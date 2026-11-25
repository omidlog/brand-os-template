import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parse, stringify } from 'yaml'
import { classifyPath, parseSyncManifest, readSyncManifest, STARTER_PROFILES, templatePages, writeAtomic } from '@brand-os/brand-core'
import engineSyncManifest from '../../.brand-os/sync.json' with { type: 'json' }
import { TOKEN_FILES, tokenBaseDir } from '@brand-os/design-tokens'
import { ENGINE_DIR, scaffoldBrand } from './scaffold.js'

/**
 * `brand-os convert`: turns an older brand repository (a full copy of the template) into a data-only one, once.
 *
 * - Template code and tooling (every tracked `core` path in `.brand-os/sync.json`, the docs build outputs, the template
 *   README / CHANGELOG / package files) is removed; the engine at `.brand-os/engine/` replaces it.
 * - Engine definitions copied under brand/ go: the question bank, field registry and knowledge graph always; a guidance
 *   page or base token file only when it is unchanged (equal to the engine's, or to the template version the brand
 *   started from). An edited one stays and replaces the engine's.
 * - A full profile copy becomes `brand/overrides/profiles/<id>.yaml` holding only the brand's additions.
 * - Brand data is never touched: ledger, facts, assets, evidence, tokens/generated, approvals, knowledge, .private …
 */
export interface ConvertOptions {
  /** A clone of the template with history: a copy equal to any version the template ever had is unedited. */
  templateDir?: string
  /** The template commit the brand recorded (brand/template-version.json); informational. */
  fromCommit?: string | null
  dryRun?: boolean
}

export interface ConvertReport {
  deleted: string[]
  kept_edits: string[]
  overrides: string[]
  notes: string[]
  scaffolded: string[]
}

const LEGACY_DEFINITIONS = /^brand\/interview\/(question-bank\/[^/]+\.yaml|field-registry\.yaml|knowledge-graph\.yaml)$/
const DOCS_OUTPUTS = /^(llms\.txt|llms-full\.txt|apps\/.*)$/
const TEMPLATE_ROOT_FILES = new Set(['package.json', 'package-lock.json', 'CHANGELOG.md', 'README.md', 'AGENTS.md', 'CLAUDE.md'])
const BRAND_DATA_GUARD = /^brand\/(instance|interview\/(answer-ledger|session-state|contradictions|evidence-|intake-log)|assets\/|tokens\/(generated|approvals)|knowledge|strategy|content-strategy\/|content-calendar\/|social\/|creative\/|competitive\/|\.private|restricted\/facts)/

function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
}

/** Blob ids every template version of `relative` ever had (any branch), so an older, never-edited copy is recognised. */
function templateBlobs(options: ConvertOptions, relative: string, cache: Map<string, Set<string>>): Set<string> {
  const known = cache.get(relative)
  if (known) return known
  const blobs = new Set<string>()
  if (options.templateDir) {
    try {
      const raw = execFileSync('git', ['-C', options.templateDir, 'log', '--all', '--format=', '--raw', '--no-abbrev', '--', relative], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of raw.split('\n')) {
        const parts = line.split(/\s+/)
        // ":100644 100644 <old> <new> M\tpath": the new blob is the fourth field.
        if (parts[3] && /^[0-9a-f]{40}$/.test(parts[3])) blobs.add(parts[3])
      }
    } catch {
      // Not a git clone of the template: only the current engine copy counts as unchanged.
    }
  }
  cache.set(relative, blobs)
  return blobs
}

function blobId(text: string): string {
  return execFileSync('git', ['hash-object', '--stdin'], { input: text, encoding: 'utf8' }).trim()
}

export function convertBrand(root: string, options: ConvertOptions = {}): ConvertReport {
  const report: ConvertReport = { deleted: [], kept_edits: [], overrides: [], notes: [], scaffolded: [] }
  if (!fs.existsSync(path.join(root, 'brand', 'brand.config.yaml'))) throw new Error('Not a Brand OS brand repository: brand/brand.config.yaml is missing.')
  // The brand's own copy of the template's file rules, or the engine's when the brand lost it.
  const manifest = readSyncManifest(root) ?? parseSyncManifest(JSON.stringify(engineSyncManifest))
  const pages = templatePages()
  const remove = (relative: string): void => {
    if (BRAND_DATA_GUARD.test(relative)) throw new Error(`convert refused to delete brand data: ${relative}`)
    report.deleted.push(relative)
    if (!options.dryRun) fs.rmSync(path.join(root, relative), { force: true })
  }
  const blobCache = new Map<string, Set<string>>()
  const unchanged = (relative: string, own: string, engine: string | null): boolean => own === engine || templateBlobs(options, relative, blobCache).has(blobId(own))

  for (const relative of trackedFiles(root)) {
    if (relative.startsWith(`${ENGINE_DIR}/`)) continue
    const own = fs.existsSync(path.join(root, relative)) ? fs.readFileSync(path.join(root, relative), 'utf8') : null
    if (own === null) continue
    if (relative.startsWith('brand/')) {
      if (LEGACY_DEFINITIONS.test(relative)) remove(relative)
      else if (pages.has(relative)) {
        if (unchanged(relative, own, pages.get(relative) ?? null)) remove(relative)
        else report.kept_edits.push(relative)
      } else if (/^brand\/tokens\/[^/]+\.json$/.test(relative)) {
        const name = path.basename(relative)
        if (TOKEN_FILES.includes(name) || name === 'contrast-pairs.json') {
          const engine = fs.readFileSync(path.join(tokenBaseDir(), name), 'utf8')
          if (unchanged(relative, own, engine)) remove(relative)
          else report.kept_edits.push(relative)
        }
      }
      continue
    }
    if (TEMPLATE_ROOT_FILES.has(relative) || DOCS_OUTPUTS.test(relative)) {
      remove(relative)
      continue
    }
    const kind = classifyPath(manifest, relative).kind
    if (kind === 'core' || kind === 'merge') {
      if (relative === '.gitignore') continue
      remove(relative)
    }
  }

  // Full profile copies become additions-only overrides; ids the copy lacks are reported, never removed.
  const profilesDir = path.join(root, 'brand', 'interview', 'profiles')
  if (fs.existsSync(profilesDir)) {
    for (const name of fs.readdirSync(profilesDir).filter((entry) => entry.endsWith('.yaml'))) {
      const id = name.slice(0, -'.yaml'.length)
      const relative = `brand/interview/profiles/${name}`
      const doc = (parse(fs.readFileSync(path.join(profilesDir, name), 'utf8')) ?? {}) as { question_ids?: string[]; title?: string; description?: string; exclusive?: boolean }
      const ids = Array.isArray(doc.question_ids) ? doc.question_ids : []
      const starter = STARTER_PROFILES.find((profile) => profile.id === id)
      let override: Record<string, unknown> | null
      if (!starter) override = { id, title: doc.title ?? id, description: doc.description ?? '', exclusive: doc.exclusive === true, question_ids: ids }
      else {
        const add = ids.filter((questionId) => !starter.question_ids.includes(questionId))
        const missing = starter.question_ids.filter((questionId) => !ids.includes(questionId))
        if (missing.length) report.notes.push(`${id}: the engine profile also asks ${missing.join(', ')}. If the brand removed them on purpose, list them under remove: in brand/overrides/profiles/${id}.yaml.`)
        override = add.length || (doc.exclusive ?? false) !== (starter.exclusive ?? false) ? { id, add, ...((doc.exclusive ?? false) !== (starter.exclusive ?? false) ? { exclusive: doc.exclusive === true } : {}) } : null
      }
      if (override) {
        const target = `brand/overrides/profiles/${name}`
        report.overrides.push(target)
        if (!options.dryRun) writeAtomic(path.join(root, target), stringify(override))
      }
      remove(relative)
    }
  }

  if (!options.dryRun) {
    removeEmptyDirs(root)
    const readme = path.join(root, 'README.md')
    if (!fs.existsSync(readme)) {
      const slug = path.basename(root)
      writeAtomic(readme, `# ${slug}\n\nBrand OS brand repository. Brand data lives in \`brand/\`; the engine in \`${ENGINE_DIR}/\` is written by engine updates.\n\nRun \`npm run brand:next\` to see what to answer next, and \`npm run check\` to validate the brand.\n`)
    }
    report.scaffolded = scaffoldBrand(root).written
  }
  return report
}

function removeEmptyDirs(root: string): void {
  const walk = (dir: string): boolean => {
    let empty = true
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') {
        empty = false
        continue
      }
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (walk(full)) fs.rmdirSync(full)
        else empty = false
      } else empty = false
    }
    return empty
  }
  walk(root)
}
