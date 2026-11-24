import fs from 'node:fs'
import path from 'node:path'
import { writeAtomic } from '@brand-os/brand-core'
import { brandPackageScripts } from './commands.js'

/**
 * The root files of a data-only brand repository, written from the engine: package.json scripts, the brand-check
 * workflow, .gitignore entries, and AGENTS.md / CLAUDE.md pointing at the engine's docs and skills. These files are
 * engine-owned and rewritten on every engine update; brand data lives only under brand/.
 */
export const ENGINE_DIR = '.brand-os/engine'
export const BRAND_WORKFLOW = '.github/workflows/brand.yml'
export const BRAND_CHECK_JOB = 'brand-check'

const GITIGNORE = [
  'node_modules/',
  'brand/.private/',
  'brand/restricted/facts.yaml',
  'brand/restricted/drafts/',
  'brand/restricted/finance/',
  'brand/generated/artifacts/',
  'brand/exports/',
  'dist/',
  '.env',
]

export const BRAND_WORKFLOW_TEXT = `# Brand check: validates this brand's own data with the engine committed in ${ENGINE_DIR}.
# Engine tests run once, in the template, before an engine release; a brand never runs them.
# Written by the Brand OS engine; an engine update rewrites it.
name: brand-check

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: brand-check-\${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ${BRAND_CHECK_JOB}:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: brand check
        run: node ${ENGINE_DIR}/brand-os.mjs check
`

/** Where the engine keeps the agent instructions it writes into a brand (bundled), or this repository's own. */
function agentSource(name: 'AGENTS.md' | 'CLAUDE.md'): string {
  const engineDir = process.env.BRAND_OS_ENGINE_ASSETS ? path.dirname(process.env.BRAND_OS_ENGINE_ASSETS) : null
  if (engineDir && fs.existsSync(path.join(engineDir, 'agents', name))) return path.join(engineDir, 'agents', name)
  return path.resolve(import.meta.dirname, '..', '..', name)
}

/** Template agent instructions with their paths pointed at the engine folder of a brand repository. */
export function brandAgentText(text: string, version: string): string {
  const rewritten = text
    .replace(/(^|[\s`(])docs-internal\//g, `$1${ENGINE_DIR}/docs-internal/`)
    .replace(/(^|[\s`(])agent-skills\//g, `$1${ENGINE_DIR}/agent-skills/`)
    .replace(/(^|[\s`(])examples\//g, `$1${ENGINE_DIR}/examples/`)
  return `<!-- Written by the Brand OS engine ${version}; an engine update rewrites this file. Brand-specific notes go in brand/AGENTS.local.md. -->\n${rewritten}`
}

export interface ScaffoldResult {
  written: string[]
}

function write(root: string, relative: string, text: string, written: string[]): void {
  const file = path.join(root, relative)
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return
  writeAtomic(file, text)
  written.push(relative)
}

/**
 * Writes the engine-owned root files of a brand repository. Idempotent. A template-copy package.json (with npm
 * workspaces) is replaced by a data-only one; otherwise only its `scripts` are set and other keys are kept.
 */
export function scaffoldBrand(root: string, options: { version?: string; slug?: string } = {}): ScaffoldResult {
  const written: string[] = []
  const version = options.version ?? process.env.BRAND_OS_ENGINE_VERSION ?? 'development'
  const pkgFile = path.join(root, 'package.json')
  const current = fs.existsSync(pkgFile) ? (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as Record<string, unknown>) : null
  const templateCopy = !current || 'workspaces' in current
  const pkg: Record<string, unknown> = templateCopy
    ? {
        name: `${options.slug ?? path.basename(root)}-brand`.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        private: true,
        type: 'module',
        description: 'Brand OS brand repository: brand data in brand/, the engine in .brand-os/engine.',
        engines: { node: '>=22' },
      }
    : { ...current }
  pkg.scripts = { ...(templateCopy ? {} : (current?.scripts as Record<string, string> | undefined) ?? {}), ...brandPackageScripts() }
  write(root, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`, written)
  write(root, BRAND_WORKFLOW, BRAND_WORKFLOW_TEXT, written)
  for (const name of ['AGENTS.md', 'CLAUDE.md'] as const) {
    const source = agentSource(name)
    if (fs.existsSync(source)) write(root, name, brandAgentText(fs.readFileSync(source, 'utf8'), version), written)
  }
  const ignoreFile = path.join(root, '.gitignore')
  const ignore = fs.existsSync(ignoreFile) ? fs.readFileSync(ignoreFile, 'utf8') : ''
  const lines = new Set(ignore.split('\n').map((line) => line.trim()))
  const missing = GITIGNORE.filter((line) => !lines.has(line))
  if (missing.length) write(root, '.gitignore', `${ignore}${ignore && !ignore.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`, written)
  return { written }
}
