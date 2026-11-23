import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  createDemoBrand,
  DEMO_BANNER,
  DEMO_NOW,
  demoPack,
  loadApprovedLogo,
  runSocialBatch,
  RuntimeError,
  writeBatch,
  type SocialBatchResult,
} from '@brand-os/brand-core/runtime'

/**
 * brand:runtime — the Brand Runtime, first vertical slice (`docs-internal/BRAND_RUNTIME.md`).
 *
 * social-batch --demo builds the SYNTHETIC DEMO brand in a fresh temp directory, asks task_context for a social_batch
 * pack as a content-read agent of that demo brand, renders ten SVG drafts with the deterministic renderer, calls the
 * existing quality layers and writes everything to --out. It never reads or writes this repository's brand/ folder,
 * calls no model and no network, and publishes, schedules, spends, deploys or approves nothing.
 */

const HELP = `brand:runtime social-batch --demo --out <empty dir> [--locale fa|en|tr] [--png] [--json]

  --demo     required in this slice: use the SYNTHETIC DEMO brand (temp workspace, removed afterwards)
  --out      an empty or new directory outside any brand/ folder; nothing is written anywhere else
  --locale   labels and direction (default fa). Approved copy is never translated.
  --png      also write PNG previews to <out>/previews (resvg; previews are not deliverables and not hashed)
  --json     print the batch summary as JSON

Every output is a draft for human review: authorizes is always empty.`

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

async function previews(out: string, result: SocialBatchResult): Promise<string> {
  try {
    const { Resvg } = await import('@resvg/resvg-js')
    fs.mkdirSync(path.join(out, 'previews'), { recursive: true })
    for (const manifest of result.manifests) {
      const svg = result.files.get(manifest.file)!
      const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1080 }, font: { loadSystemFonts: true } }).render().asPng()
      fs.writeFileSync(path.join(out, 'previews', `${manifest.post_id}.png`), png, { flag: 'wx' })
    }
    return `previews: ${result.manifests.length} PNG files in ${path.join(out, 'previews')} (system fonts; not hashed)`
  } catch (error) {
    return `previews: unavailable (${error instanceof Error ? error.message.slice(0, 120) : 'unknown error'})`
  }
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === '--help' || command === 'help') {
    console.log(HELP)
    return
  }
  if (command !== 'social-batch') usage(`Unknown command "${command}".`)
  let values: { demo?: boolean; out?: string; locale?: string; png?: boolean; json?: boolean }
  try {
    values = parseArgs({
      args: rest,
      options: { demo: { type: 'boolean', default: false }, out: { type: 'string' }, locale: { type: 'string' }, png: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
      allowPositionals: false,
      strict: true,
    }).values
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }
  if (!values.demo) usage('This slice runs only on the SYNTHETIC DEMO brand: pass --demo. Real brands are an open owner decision (docs-internal/BRAND_RUNTIME.md).')
  if (!values.out) usage('--out <dir> is required.')
  const locale = values.locale ?? 'fa'
  if (locale !== 'fa' && locale !== 'en' && locale !== 'tr') usage(`--locale must be fa, en or tr (given ${locale}).`)

  const demo = createDemoBrand()
  try {
    const pack = demoPack(demo, locale)
    const { logo } = loadApprovedLogo(demo.root, pack)
    const result = runSocialBatch(pack, { demo: true, demoBanner: DEMO_BANNER, logo, coach: demo.engine, now: DEMO_NOW })
    const out = path.resolve(values.out)
    const written = writeBatch(out, result)
    const note = values.png ? await previews(out, result) : null
    if (values.json) {
      console.log(JSON.stringify(result.summary, null, 2))
      return
    }
    const s = result.summary
    console.log(`${DEMO_BANNER}`)
    console.log(`status: ${s.status}  posts: ${s.posts.length}  pack: ${s.context.pack_sha256.slice(0, 12)} (${s.context.pack_readiness}, ${s.context.pack_staleness})`)
    for (const post of s.posts) console.log(`  ${post.post_id}  ${post.angle.padEnd(17)} ${post.layout.padEnd(9)} pass ${post.checks.pass}  warn ${post.checks.warn}  fail ${post.checks.fail}  ${post.sha256.slice(0, 12)}`)
    for (const check of s.set_checks) console.log(`  set ${check.check_id.padEnd(24)} ${check.result}`)
    for (const layer of s.layers) console.log(`  layer ${layer.layer}: ${layer.called ? 'called' : `not called (${layer.skipped_reason})`}, ${layer.results.length} result(s)`)
    console.log(`files: ${written.length} written to ${out}`)
    if (note) console.log(note)
    console.log('Drafts for human review. Nothing was published, scheduled, spent, deployed or approved; authorizes: [].')
  } finally {
    demo.cleanup()
  }
}

main().catch((error: unknown) => {
  if (error instanceof RuntimeError) {
    console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  throw error
})
