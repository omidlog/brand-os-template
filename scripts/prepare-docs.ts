import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { parse } from 'yaml'
import { allModules, InterviewEngine } from '@brand-os/brand-core'
import type { BrandConfig } from '@brand-os/brand-core'
import { assetPathIsSafe } from '@brand-os/asset-catalog'

export interface PrepareOptions {
  audience?: 'public' | 'internal'
  mascot?: boolean
  gamification?: boolean
  rootIndex?: boolean
}

interface DocFile {
  source: string
  dest: string
  url: string
  text: string
  optional?: string
  visibility: string
}

interface PrepareContext {
  root: string
  audience: 'public' | 'internal'
  mascot: boolean
  gamification: boolean
  writeRootIndex: boolean
  engine: InterviewEngine
  config: BrandConfig
}

export function prepareDocs(root: string, options: PrepareOptions = {}): { copied: number; excluded: string[] } {
  const engine = new InterviewEngine(root)
  const config = engine.config()
  const requested = options.audience ?? (config.brand.publish_docs === 'public' ? 'public' : 'internal')
  if (requested === 'public' && config.brand.publish_docs !== 'public' && process.env.BRAND_OS_ALLOW_PUBLIC_BUILD !== '1') {
    throw new Error('Refusing a public docs build because brand.publish_docs is private. Set publish_docs to public only when the brand has agreed to publish, or build with --audience internal.')
  }
  const ctx: PrepareContext = {
    root,
    audience: requested,
    mascot: options.mascot ?? config.modules.mascot.enabled,
    gamification: options.gamification ?? config.modules.gamification.enabled,
    writeRootIndex: options.rootIndex ?? true,
    engine,
    config,
  }
  const docsRoot = path.join(root, 'apps', 'docs', 'docs')
  fs.rmSync(docsRoot, { recursive: true, force: true })
  fs.mkdirSync(docsRoot, { recursive: true })
  const docs: DocFile[] = []
  collect(ctx, path.join(root, 'brand', 'content'), docs)
  collect(ctx, path.join(root, 'brand', 'business-os'), docs)
  collect(ctx, path.join(root, 'brand', 'templates'), docs)
  const excluded = new Set<string>()
  for (const doc of docs) {
    if (doc.optional === 'mascot' && !ctx.mascot) excluded.add(doc.url)
    if (doc.optional === 'gamification' && !ctx.gamification) excluded.add(doc.url)
    if (doc.visibility === 'restricted') excluded.add(doc.url)
    if (ctx.audience === 'public' && doc.visibility === 'internal') excluded.add(doc.url)
  }
  for (const doc of docs) {
    if (excluded.has(doc.url)) continue
    const rewritten = doc.text.replace(/\[([^\]]+)\]\((\/docs\/[^)\s]+)\)/g, (full, label: string, url: string) => {
      const bare = url.split('#')[0] ?? url
      return excluded.has(bare) ? `${label} (module disabled for this build)` : full
    })
    const target = path.join(docsRoot, doc.dest)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, rewritten)
  }
  const included = docs.filter((doc) => !excluded.has(doc.url))
  writeSidebars(ctx, included)
  writeData(ctx)
  writePublished(ctx)
  writeIndexes(ctx, included)
  copyAssets(ctx)
  return { copied: included.length, excluded: [...excluded] }
}

function collect(ctx: PrepareContext, dir: string, into: DocFile[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(ctx, full, into)
    else if (entry.name.endsWith('.md')) {
      const relative = path.relative(ctx.root, full).split(path.sep).join('/')
      const dest = destination(relative)
      if (!dest) continue
      const text = fs.readFileSync(full, 'utf8')
      const meta = frontmatter(text)
      into.push({
        source: relative,
        dest,
        url: `/docs/${dest.replace(/\.md$/, '')}`,
        text,
        optional: meta.optional_module,
        visibility: meta.visibility ?? 'public',
      })
    }
  }
}

function destination(relative: string): string | null {
  if (relative === 'brand/content/00-start/introduction.md') return 'start/introduction.md'
  if (relative.startsWith('brand/content/use-cases/')) return relative.slice('brand/content/'.length)
  if (relative.startsWith('brand/content/gamification/')) return relative.slice('brand/content/'.length)
  if (relative.startsWith('brand/content/')) return `brand/${relative.slice('brand/content/'.length)}`
  if (relative.startsWith('brand/business-os/')) return `business/${relative.slice('brand/business-os/'.length)}`
  if (relative.startsWith('brand/templates/')) return `templates/${relative.slice('brand/templates/'.length)}`
  return null
}

function frontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/)
  const data: Record<string, string> = {}
  if (!match?.[1]) return data
  for (const line of match[1].split('\n')) {
    const index = line.indexOf(':')
    if (index === -1) continue
    data[line.slice(0, index).trim()] = line.slice(index + 1).trim().replace(/^"|"$/g, '')
  }
  return data
}

function writeSidebars(ctx: PrepareContext, included: DocFile[]): void {
  const items = (prefix: string) =>
    included
      .filter((doc) => doc.dest.startsWith(prefix) && doc.dest.endsWith('/overview.md'))
      .map((doc) => doc.dest.replace(/\.md$/, ''))
      .sort()
  const useCases = included.filter((doc) => doc.dest.startsWith('use-cases/')).map((doc) => doc.dest.replace(/\.md$/, '')).sort()
  const templates = included.filter((doc) => doc.dest.startsWith('templates/')).map((doc) => doc.dest.replace(/\.md$/, '')).sort()
  const categories = [
    'start/introduction',
    category('Brand Identity', items('brand/')),
    category('Business OS', items('business/')),
    ctx.gamification ? category('Gamification', items('gamification/')) : null,
    category('Use cases', useCases),
    category('Templates', templates),
  ].filter((item) => item && !(typeof item === 'object' && 'items' in item && item.items.length === 0))
  fs.writeFileSync(
    path.join(ctx.root, 'apps', 'docs', 'sidebars.js'),
    `const sidebars = {\n  main: ${JSON.stringify(categories, null, 2)}\n}\nexport default sidebars\n`,
  )
}

function category(label: string, items: string[]) {
  return { type: 'category', label, items }
}

function writeData(ctx: PrepareContext): void {
  const report = ctx.engine.statusReport()
  const brand = ctx.config.brand
  const status = {
    audience: ctx.audience,
    brandName: brand.working_name || brand.name,
    nameStatus: brand.working_name ? brand.working_name_status ?? 'draft' : brand.name_status,
    placeholderName: brand.name,
    coverage: report.coverage,
    approval: report.approval,
    required: report.required,
    requiredUnanswered: report.requiredUnanswered,
    contradictions: report.contradictions,
    modules: allModules()
      .filter((module) => (module.optional === 'mascot' ? ctx.mascot : true))
      .filter((module) => (module.optional === 'gamification' ? ctx.gamification : true))
      .map((module) => {
        const score = report.modules.find((item) => item.module === module.id)
        return {
          id: module.id,
          title: module.title,
          code: module.code,
          group: module.group,
          href: `/docs/${module.docPath}`,
          coverage: score?.coverage ?? 0,
          approval: score?.approval ?? 0,
          requiredUnanswered: score?.requiredUnanswered ?? 0,
        }
      }),
    next: report.next.map((item) => ({ id: item.id, priority: item.priority, prompt: item.prompt })),
  }
  const catalogDoc = parse(fs.readFileSync(path.join(ctx.root, 'brand', 'mascot', 'catalog.yaml'), 'utf8')) as {
    states: Array<Record<string, unknown>>
  }
  const catalog = (ctx.mascot ? catalogDoc.states : []).map((state) => ({
    id: state.id,
    name: state.name,
    category: state.category,
    intent: state.intent,
    emotion_intensity: state.emotion_intensity,
    status: state.status,
    mvp: state.mvp,
    tags: state.tags,
    preview: null,
    source_assets: [],
  }))
  const manifest = parse(fs.readFileSync(path.join(ctx.root, 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as {
    assets: Array<Record<string, unknown>>
  }
  const assets = manifest.assets.filter((asset) => {
    const visibility = String(asset.visibility ?? 'internal')
    if (visibility === 'restricted') return false
    if (visibility === 'internal' && ctx.audience === 'public') return false
    return true
  }).map((asset) => ({
    ...asset,
    downloadable: asset.present === true && asset.status === 'approved' && asset.visibility === 'public' && assetPathIsSafe(ctx.root, String(asset.path)),
  }))
  const dataDir = path.join(ctx.root, 'apps', 'docs', 'src', 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'status.json'), `${JSON.stringify(status, null, 2)}\n`)
  fs.writeFileSync(path.join(dataDir, 'catalog.json'), `${JSON.stringify({ states: catalog, enabled: ctx.mascot }, null, 2)}\n`)
  fs.writeFileSync(path.join(dataDir, 'assets.json'), `${JSON.stringify({ assets }, null, 2)}\n`)
  fs.mkdirSync(path.join(ctx.root, 'apps', 'docs', 'generated'), { recursive: true })
  fs.writeFileSync(
    path.join(ctx.root, 'apps', 'docs', 'generated', 'features.json'),
    `${JSON.stringify({ mascot: ctx.mascot, gamification: ctx.gamification, audience: ctx.audience, brandName: status.brandName, nameStatus: status.nameStatus }, null, 2)}\n`,
  )
}

function writeIndexes(ctx: PrepareContext, included: DocFile[]): void {
  const site = process.env.BRAND_OS_SITE_URL || 'http://localhost:3000'
  const lines = ['# Brand OS', '', '> EXAMPLE template documentation. Not an approved brand. Not an authorization to private data.', '']
  const full: string[] = [...lines]
  for (const doc of included) {
    const title = frontmatter(doc.text).title ?? doc.dest
    lines.push(`- [${title}](${site}${doc.url})`)
    full.push(`## ${title}`, '', doc.text, '')
  }
  const staticDir = path.join(ctx.root, 'apps', 'docs', 'static')
  fs.mkdirSync(staticDir, { recursive: true })
  fs.writeFileSync(path.join(staticDir, 'llms.txt'), `${lines.join('\n')}\n`)
  fs.writeFileSync(path.join(staticDir, 'llms-full.txt'), `${full.join('\n')}\n`)
  if (ctx.writeRootIndex && ctx.audience === 'public' && ctx.mascot && ctx.gamification) {
    fs.writeFileSync(path.join(ctx.root, 'llms.txt'), `${lines.join('\n')}\n`)
    fs.writeFileSync(path.join(ctx.root, 'llms-full.txt'), `${full.join('\n')}\n`)
  }
}

function writePublished(ctx: PrepareContext): void {
  const file = path.join(ctx.root, 'brand', 'instance', 'approved-facts.yaml')
  const facts = fs.existsSync(file) ? ((parse(fs.readFileSync(file, 'utf8')) as { facts?: Record<string, Record<string, unknown>> }).facts ?? {}) : {}
  const lines = ['---', 'title: "Published claims"', 'visibility: public', 'sidebar_position: 0', '---', '', '# Published claims', '', 'Only approved facts for this audience are listed. Restricted values are never published. Unapproved interview answers stay in the ledger.', '']
  const visible = Object.entries(facts).filter(([, fact]) => {
    if (fact.visibility === 'restricted') return false
    if (ctx.audience === 'public' && fact.visibility !== 'public') return false
    return true
  })
  if (visible.length === 0) lines.push('No approved claims for this audience yet.')
  for (const [id, fact] of visible) {
    lines.push(`## ${id}`, '', String(fact.value ?? 'TBD'), '', `- Status: approved`, `- Approved by: ${String(fact.approved_by ?? 'unknown')}`, `- Updated: ${String(fact.updated ?? 'unknown')}`, `- Answer: \`${String(fact.answer_id ?? '')}\``, `- Source: \`brand/instance/approved-facts.yaml\``, '')
  }
  const target = path.join(ctx.root, 'apps', 'docs', 'docs', 'published', 'claims.md')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${lines.join('\n')}\n`)
  const sidebarFile = path.join(ctx.root, 'apps', 'docs', 'sidebars.js')
  if (fs.existsSync(sidebarFile)) {
    const text = fs.readFileSync(sidebarFile, 'utf8')
    if (!text.includes('published/claims')) {
      fs.writeFileSync(sidebarFile, text.replace('main: [', 'main: [\n    "published/claims",'))
    }
  }
}

function copyAssets(ctx: PrepareContext): void {
  const manifest = parse(fs.readFileSync(path.join(ctx.root, 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as {
    assets: Array<{ path: string; present: boolean; visibility: string; status?: string }>
  }
  const targetRoot = path.join(ctx.root, 'apps', 'docs', 'static', 'brand-assets')
  fs.rmSync(targetRoot, { recursive: true, force: true })
  for (const asset of manifest.assets) {
    if (!asset.present || asset.visibility !== 'public' || asset.status !== 'approved') continue
    if (!assetPathIsSafe(ctx.root, asset.path)) continue
    const from = path.join(ctx.root, asset.path)
    if (!fs.existsSync(from)) continue
    const relative = asset.path.replace(/^brand\/assets\//, '')
    const target = path.join(targetRoot, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(from, target)
  }
}

const isEntry = process.argv[1]?.includes('prepare-docs')
if (isEntry) {
  const { values } = parseArgs({
    options: {
      audience: { type: 'string', default: process.env.DOCS_AUDIENCE === 'internal' ? 'internal' : 'public' },
      mascot: { type: 'string' },
      gamification: { type: 'string' },
      'root-index': { type: 'boolean', default: true },
    },
  })
  const result = prepareDocs(process.cwd(), {
    audience: values.audience === 'internal' ? 'internal' : 'public',
    mascot: values.mascot === undefined ? undefined : values.mascot === 'true',
    gamification: values.gamification === undefined ? undefined : values.gamification === 'true',
    rootIndex: values.mascot === 'false' || values.gamification === 'false' ? false : values['root-index'],
  })
  console.log(`Prepared docs. Copied ${result.copied}. Excluded ${result.excluded.length}.`)
}
