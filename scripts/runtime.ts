import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  createDemoBrand,
  createOutliner,
  DEMO_BANNER,
  DEMO_NOW,
  demoPack,
  loadApprovedLogo,
  openOwnerWorkspace,
  readPackFile,
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
 *
 * social-batch --pack <file> renders a real brand's approved social_batch pack: the JSON `brand:query --tool
 * task_context --task-type social_batch --count 10` printed. The pack is verified exactly like the demo pack (digest,
 * task type, count, empty authorizes). It reads the pack file and nothing else, unless --root names the owner's own
 * checkout of the same brand: then the Coach is called and an approved logo may be embedded through the publication
 * gate. brand/ is never written.
 */

const HELP = `brand:runtime social-batch (--demo | --pack <file> [--root <dir>]) --out <empty dir>
                           [--final --font-file <ttf|otf>...] [--locale fa|en|tr] [--png] [--json]

  --demo     use the SYNTHETIC DEMO brand (temp workspace, removed afterwards)
  --pack     a real brand's social_batch pack file: the output of
             brand:query --tool task_context --task-type social_batch --count 10 [--locale fa]
             verified like the demo pack; the pack's own task locale is used
  --root     with --pack only, owner-local: the owner's checkout of the same brand. Enables the Coach and the
             approved logo (publication gate + checksum). Read-only; refused under an agent token
  --as-of    with --pack: ISO date for the Coach and the assessment (default: now)
  --final    final export: convert text to outlines (drafts keep live, editable text). Needs an approved
             brand.type.scale and --font-file for every approved first family; nothing is substituted
  --font-file  repeatable, with --final: a local TTF/OTF of an approved family (recorded by name + sha256)
  --out      an empty or new directory outside any brand/ folder; nothing is written anywhere else
  --locale   with --demo: labels and direction (default fa). Approved copy is never translated.
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
  let values: { demo?: boolean; pack?: string; root?: string; 'as-of'?: string; final?: boolean; 'font-file'?: string[]; out?: string; locale?: string; png?: boolean; json?: boolean }
  try {
    values = parseArgs({
      args: rest,
      options: { demo: { type: 'boolean', default: false }, pack: { type: 'string' }, root: { type: 'string' }, 'as-of': { type: 'string' }, final: { type: 'boolean', default: false }, 'font-file': { type: 'string', multiple: true }, out: { type: 'string' }, locale: { type: 'string' }, png: { type: 'boolean', default: false }, json: { type: 'boolean', default: false } },
      allowPositionals: false,
      strict: true,
    }).values
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error))
  }
  if (values.demo === Boolean(values.pack)) usage('Pass exactly one of --demo (the SYNTHETIC DEMO brand) or --pack <file> (a real brand\'s task_context pack).')
  if (!values.out) usage('--out <dir> is required.')
  if (values.demo && (values.root || values['as-of'])) usage('--root and --as-of apply to --pack only.')
  if (values.pack && values.locale) usage('--locale applies to --demo only: a pack carries its own task locale (brand:query --locale).')
  const locale = values.locale ?? 'fa'
  if (locale !== 'fa' && locale !== 'en' && locale !== 'tr') usage(`--locale must be fa, en or tr (given ${locale}).`)
  if (!values.final && values['font-file']?.length) usage('--font-file applies to --final only.')
  const out = path.resolve(values.out)
  const final = values.final ? await createOutliner(values['font-file'] ?? []) : null

  let result: SocialBatchResult
  if (values.demo) {
    const demo = createDemoBrand()
    try {
      const pack = demoPack(demo, locale)
      const { logo } = loadApprovedLogo(demo.root, pack)
      result = runSocialBatch(pack, { demo: true, demoBanner: DEMO_BANNER, logo, coach: demo.engine, now: DEMO_NOW, origin: 'demo', final })
    } finally {
      demo.cleanup()
    }
  } else {
    const now = values['as-of'] ? new Date(values['as-of']) : new Date()
    if (Number.isNaN(now.getTime())) usage('--as-of must be an ISO date.')
    const pack = readPackFile(values.pack!)
    const engine = values.root ? openOwnerWorkspace(values.root, pack) : null
    const logo = engine ? loadApprovedLogo(engine.workspaceRoot(), pack).logo : null
    result = runSocialBatch(pack, { demo: false, logo, coach: engine, now, origin: 'pack_file', final })
  }
  const written = writeBatch(out, result)
  const note = values.png ? await previews(out, result) : null
  if (values.json) {
    console.log(JSON.stringify(result.summary, null, 2))
    return
  }
  const s = result.summary
  if (s.demo) console.log(`${DEMO_BANNER}`)
  console.log(`status: ${s.status}  posts: ${s.posts.length}  pack: ${s.context.pack_sha256.slice(0, 12)} (${s.context.origin}, ${s.context.pack_readiness}, ${s.context.pack_staleness})`)
  console.log(`export: ${result.manifests[0]?.export.mode ?? (final ? 'final' : 'draft')} (${final ? 'text outlined with the supplied fonts' : 'live, editable text'})`)
  for (const blocker of s.blockers) console.log(`  blocked: ${blocker.code}`)
  for (const post of s.posts) console.log(`  ${post.post_id}  ${post.angle.padEnd(17)} ${post.layout.padEnd(9)} pass ${post.checks.pass}  warn ${post.checks.warn}  fail ${post.checks.fail}  ${post.sha256.slice(0, 12)}`)
  for (const check of s.set_checks) console.log(`  set ${check.check_id.padEnd(24)} ${check.result}`)
  for (const layer of s.layers) console.log(`  layer ${layer.layer}: ${layer.called ? 'called' : `not called (${layer.skipped_reason})`}, ${layer.results.length} result(s)`)
  for (const warning of s.warnings) console.log(`  warn coach ${warning.question_id ?? 'brand'}: ${warning.status} (${warning.codes.join(', ')}) — advice, does not block`)
  console.log(`files: ${written.length} written to ${out}`)
  if (note) console.log(note)
  console.log('Drafts for human review. Nothing was published, scheduled, spent, deployed or approved; authorizes: [].')
}

main().catch((error: unknown) => {
  if (error instanceof RuntimeError) {
    console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  throw error
})
