import fs from 'node:fs'
import path from 'node:path'
import { effectiveModelUse, inspectAssetForPublication } from '@brand-os/asset-catalog'
import type { CoachSource } from '../coach/model.js'
import { canonicalJson, sha256Hex } from '../strategy/model.js'
import { TASK_CONTEXT_SCHEMA, verifyPack, type TaskContextPack } from '../task-context/model.js'
import { assuranceLayer, coachLayer, postChecks, setChecks } from './gate.js'
import {
  POST_FORMAT,
  RUNTIME_BATCH_SCHEMA,
  RUNTIME_PERMISSIONS,
  RUNTIME_POST_SCHEMA,
  RUNTIME_RENDERER,
  RUNTIME_RENDERER_VERSION,
  RuntimeError,
  SOCIAL_BATCH_COUNT,
  type BatchSummary,
  type CheckResult,
  type LayerReport,
  type PostManifest,
  type UsedAsset,
  type UsedSource,
} from './model.js'
import { assertPackShape } from './pack.js'
import { planSocialBatch } from './plan.js'
import { logoMarkup, renderPost, type EmbeddedLogo } from './render.js'

export interface ApprovedLogo {
  asset_id: string
  source_revision: string | null
  checksum_sha256: string
  model_use: UsedAsset['model_use']
  svg: string
}

export interface SocialBatchOptions {
  /** True only for the synthetic demo brand; stamps every post and the summary. */
  demo: boolean
  demoBanner?: string | null
  /** The approved logo, already read through `loadApprovedLogo`. Absent: posts carry no logo. */
  logo?: ApprovedLogo | null
  /** The owner-local coach source (the interview engine). Absent: the coach is reported as not called. */
  coach?: CoachSource | null
  /** The clock for the coach and the assessment. Injected so a run is reproducible. */
  now: Date
  /** Where the pack came from: the synthetic demo, or a pack file from `brand:query --tool task_context`. */
  origin?: 'demo' | 'pack_file'
}

export interface SocialBatchResult {
  /** Relative path → file text. Nothing is written until `writeBatch`. */
  files: Map<string, string>
  summary: BatchSummary
  manifests: PostManifest[]
}

const tally = (checks: Array<{ result: CheckResult }>): Record<CheckResult, number> => ({
  pass: checks.filter((entry) => entry.result === 'pass').length,
  warn: checks.filter((entry) => entry.result === 'warn').length,
  fail: checks.filter((entry) => entry.result === 'fail').length,
  not_tested: checks.filter((entry) => entry.result === 'not_tested').length,
})

/**
 * Reads the approved logo the pack names, through the existing publication gate: safe path under `brand/assets`, no
 * symlink, checksum equal to the one the pack pinned, both SVG gates. Anything else returns a reason code and no
 * bytes. Owner-local: it reads the workspace the owner ran the pack in; nothing is sent to a model.
 */
export function loadApprovedLogo(root: string, pack: TaskContextPack): { logo: ApprovedLogo | null; considered: UsedAsset[] } {
  const items = Object.values(pack.sections).flat().filter((item) => item.key === 'assets.logo' && item.state === 'approved')
  const considered: UsedAsset[] = []
  let logo: ApprovedLogo | null = null
  for (const item of items) {
    const value = (item.value ?? {}) as Record<string, unknown>
    const assetId = String(value.id ?? item.source_id)
    const checksum = typeof value.checksum_sha256 === 'string' ? value.checksum_sha256 : null
    const base = { asset_id: assetId, source_revision: item.source_revision, checksum_sha256: checksum, model_use: effectiveModelUse(value), sent_to_model: false as const }
    if (logo) {
      considered.push({ ...base, embedded: false, not_embedded_reason: 'one_logo_per_post' })
      continue
    }
    const assetPath = typeof value.path === 'string' ? value.path : ''
    if (!checksum || !assetPath.toLowerCase().endsWith('.svg')) {
      considered.push({ ...base, embedded: false, not_embedded_reason: 'not_svg_or_no_checksum' })
      continue
    }
    const inspected = inspectAssetForPublication(root, assetPath, checksum)
    if (!inspected.ok) {
      considered.push({ ...base, embedded: false, not_embedded_reason: `publication_gate:${inspected.reason}` })
      continue
    }
    logo = { asset_id: assetId, source_revision: item.source_revision, checksum_sha256: checksum, model_use: base.model_use, svg: fs.readFileSync(inspected.realPath, 'utf8') }
    considered.push({ ...base, embedded: true, not_embedded_reason: null })
  }
  return { logo, considered }
}

/** One warning per Coach result that is not `ready`: the status and finding codes only, never answer text. */
export function coachWarnings(layer: LayerReport): BatchSummary['warnings'] {
  if (layer.layer !== 'coach' || !layer.called) return []
  return layer.results
    .filter((entry) => entry.status !== 'ready')
    .map((entry) => ({
      layer: 'coach' as const,
      question_id: typeof entry.question_id === 'string' ? entry.question_id : null,
      status: String(entry.status),
      codes: Array.isArray(entry.codes) ? entry.codes.map(String) : [],
      blocks: false as const,
    }))
}

function dedupeSources(sources: Array<UsedSource | null>): UsedSource[] {
  const out: UsedSource[] = []
  for (const source of sources) if (source && !out.some((entry) => entry.source_id === source.source_id)) out.push(source)
  return out
}

/** Pack in, ten SVG drafts + manifests + summary out, in memory. Deterministic for the same pack and options. */
export function runSocialBatch(pack: TaskContextPack, opts: SocialBatchOptions): SocialBatchResult {
  if (pack?.schema !== TASK_CONTEXT_SCHEMA) throw new RuntimeError('invalid_pack', `Expected a ${TASK_CONTEXT_SCHEMA} pack.`)
  assertPackShape(pack)
  if (!verifyPack(pack)) throw new RuntimeError('invalid_pack', 'The pack digest does not verify: it changed after task_context built it. Build a new pack.')
  if (pack.task.type !== 'social_batch') throw new RuntimeError('wrong_task', `This runtime slice renders social_batch packs only (got ${pack.task.type}).`)
  if (pack.task.deliverable_count !== SOCIAL_BATCH_COUNT) throw new RuntimeError('wrong_task', `This slice renders exactly ${SOCIAL_BATCH_COUNT} posts (the pack asks for ${pack.task.deliverable_count}).`)
  if (pack.authorizes.length !== 0 || Object.values(pack.permissions).some(Boolean)) throw new RuntimeError('invalid_pack', 'A pack never authorizes anything.')

  const plan = planSocialBatch(pack)
  const packSha = pack.digests.context_sha256!
  const embedded: EmbeddedLogo | null = opts.logo ? logoMarkup(opts.logo.asset_id, opts.logo.svg) : null
  const logoAssets: UsedAsset[] = opts.logo
    ? [{ asset_id: opts.logo.asset_id, source_revision: opts.logo.source_revision, checksum_sha256: opts.logo.checksum_sha256, model_use: opts.logo.model_use, sent_to_model: false, embedded: embedded !== null, not_embedded_reason: embedded ? null : 'no_viewbox' }]
    : []

  const files = new Map<string, string>()
  const manifests: PostManifest[] = []
  for (const post of plan.posts) {
    const rendered = renderPost(plan, post, { demo: opts.demo, logo: embedded })
    const sha256 = sha256Hex(rendered.svg)
    const file = `posts/${post.post_id}.svg`
    const manifest: PostManifest = {
      schema: RUNTIME_POST_SCHEMA,
      post_id: post.post_id,
      index: post.index,
      brand_id: pack.brand_id,
      demo: opts.demo,
      state: 'draft',
      locale: plan.locale,
      direction: plan.direction,
      angle: post.angle,
      layout: post.layout,
      format: POST_FORMAT,
      file,
      sha256,
      bytes: Buffer.byteLength(rendered.svg, 'utf8'),
      renderer: { name: RUNTIME_RENDERER, version: RUNTIME_RENDERER_VERSION, model: null, network: false },
      context: { pack_schema: pack.schema, pack_sha256: packSha, task_type: 'social_batch' },
      sources: dedupeSources([post.message_source, post.brand_source, post.cta_source, plan.palette.source]),
      assets: logoAssets,
      checks: postChecks(pack, plan, post, rendered),
      human_review_required: true,
      authorizes: [],
      permissions: RUNTIME_PERMISSIONS,
    }
    files.set(file, rendered.svg)
    files.set(`posts/${post.post_id}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
    manifests.push(manifest)
  }

  const usedQuestionIds = [...new Set(manifests.flatMap((manifest) => manifest.sources.map((source) => source.source_id)))].filter((id) => /^[a-z]+\.[a-z_]+\.[a-z_]+$/.test(id)).sort()
  const blockers = [...plan.blockers]
  const set = setChecks(
    pack,
    manifests.map((manifest, i) => ({ post: plan.posts[i]!, sha256: manifest.sha256 })),
  )
  const layers = [coachLayer(opts.coach ?? null, usedQuestionIds, opts.now), assuranceLayer(pack, pack.brand_id, opts.now, opts.demo)]
  // Coach findings are advice about the answers behind the copy. They are surfaced as warnings and never block a draft
  // (owner decision 4); `status` depends only on the plan's blockers and the post count.
  const warnings = coachWarnings(layers[0]!)
  const batchSha = sha256Hex(canonicalJson(manifests.map((manifest) => ({ post_id: manifest.post_id, sha256: manifest.sha256 }))))
  const summary: BatchSummary = {
    schema: RUNTIME_BATCH_SCHEMA,
    job_id: `social-batch-${packSha.slice(0, 12)}`,
    brand_id: pack.brand_id,
    demo: opts.demo,
    demo_banner: opts.demo ? (opts.demoBanner ?? null) : null,
    task: { type: 'social_batch', channel: 'instagram', locale: plan.locale, requested_count: pack.task.deliverable_count },
    status: blockers.length > 0 || manifests.length !== SOCIAL_BATCH_COUNT ? 'blocked' : 'drafted',
    blockers,
    warnings,
    context: {
      origin: opts.origin ?? (opts.demo ? 'demo' : 'pack_file'),
      pack_schema: pack.schema,
      pack_sha256: packSha,
      pack_readiness: pack.readiness,
      pack_staleness: pack.staleness,
      pack_verified: true,
      missing: pack.missing.map((entry) => entry.id),
    },
    posts: manifests.map((manifest) => ({
      post_id: manifest.post_id,
      file: manifest.file,
      manifest: `posts/${manifest.post_id}.manifest.json`,
      sha256: manifest.sha256,
      angle: manifest.angle,
      layout: manifest.layout,
      checks: tally(manifest.checks),
    })),
    set_checks: set,
    layers,
    advisory: {
      visual_review: 'not_tested',
      semantic_review: 'not_tested',
      note: 'No model reviewed these drafts. Taste, clarity and brand feel need a person; nothing here is a quality score.',
    },
    batch_sha256: batchSha,
    human_review_required: true,
    authorizes: [],
    permissions: RUNTIME_PERMISSIONS,
  }
  files.set('batch-summary.json', `${JSON.stringify(summary, null, 2)}\n`)
  return { files, summary, manifests }
}

/**
 * Writes a batch into `outDir` and nowhere else. Refuses a directory that is not empty, a symlinked directory, and any
 * directory inside a `brand/` tree (an output is never a brand file). Every path is checked to stay under `outDir`.
 */
export function writeBatch(outDir: string, result: SocialBatchResult): string[] {
  const target = path.resolve(outDir)
  if (target.split(path.sep).includes('brand')) throw new RuntimeError('unsafe_output', 'The output directory may not be inside a brand/ folder.')
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isSymbolicLink() || !fs.statSync(target).isDirectory()) throw new RuntimeError('unsafe_output', 'The output path must be a real directory.')
    if (fs.readdirSync(target).length > 0) throw new RuntimeError('unsafe_output', 'The output directory must be empty. Nothing was overwritten.')
  }
  fs.mkdirSync(target, { recursive: true })
  const real = fs.realpathSync(target)
  const written: string[] = []
  for (const [relative, text] of [...result.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const full = path.resolve(real, relative)
    if (!full.startsWith(`${real}${path.sep}`)) throw new RuntimeError('unsafe_output', `Refusing to write outside the output directory: ${relative}`)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text, { flag: 'wx' })
    written.push(relative)
  }
  return written
}
