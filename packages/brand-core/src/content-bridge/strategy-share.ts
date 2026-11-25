import fs from 'node:fs'
import path from 'node:path'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import {
  CHANNEL_KPI_METRICS,
  CHANNEL_KPI_PERIODS,
  CHANNEL_OBJECTIVES,
  CHANNEL_PLAN_LIMITS,
  CONTENT_CHANNELS,
  CONTENT_FORMATS,
  CONTENT_GAP_REASONS,
  CONTENT_MIX_TYPES,
  FACT_ID,
  ITEM_ID,
  LOCALE,
  STRATEGY_ID,
  STRATEGY_LIMITS,
  StrategyError,
  validateStrategyId,
  type ContentChannelPlan,
  type ContentGap,
  type ContentPillar,
} from '../strategy/model.js'
import { assertOwnerProcess } from '../strategy/store.js'
import { contentStrategyView } from './projection.js'

/**
 * Sharing the approved content strategy with Studio (the same pattern as `brand:content share` for a week).
 *
 * `brand:content share-strategy [--id content-main]` writes the owner-facing view of the one approved revision the
 * Strategy Feed serves now (`current` or `review_due`) to `brand/content-strategy/shared/<id>.json`: channels with
 * role, objective, audience, formats, cadence, mix, KPIs, posting windows and rules; pillars; languages; validity;
 * the revision pin and its content digest. Never a draft, never the restricted block, never resolved fact values
 * (only fact ids), never notes or research. The owner commits and merges it; Studio's read-only "Content strategy"
 * page shows only that file from the merged commit. The private strategy record stays the truth.
 */

export const SHARED_STRATEGY_DIR = 'brand/content-strategy/shared'
export const SHARED_STRATEGY_FILE = /^[a-z0-9][a-z0-9-]{2,47}\.json$/

export interface SharedContentStrategy {
  schema_version: 1
  kind: 'content_strategy'
  brand_slug: string
  strategy_id: string
  revision: number
  /** The approved revision's content digest: which revision this is. */
  content_sha256: string
  approved_at: string
  /** The Strategy Feed status when it was shared. */
  status: 'current' | 'review_due'
  validity: { valid_from: string; valid_until: string; review_due_at: string }
  languages: string[]
  pillars: ContentPillar[]
  channels: ContentChannelPlan[]
  gaps: ContentGap[]
  shared_at: string
}

function channelCopy(c: ContentChannelPlan): ContentChannelPlan {
  return {
    channel: c.channel,
    role: c.role,
    formats: [...c.formats],
    cadence: c.cadence ? { per: c.cadence.per, target: c.cadence.target } : null,
    languages: [...c.languages],
    pillars: [...c.pillars],
    fact_refs: [...c.fact_refs],
    ...(c.objective ? { objective: c.objective } : {}),
    ...(c.audience ? { audience: c.audience } : {}),
    ...(c.mix?.length ? { mix: c.mix.map((m) => ({ type: m.type, share: m.share })) } : {}),
    ...(c.kpis?.length ? { kpis: c.kpis.map((k) => ({ metric: k.metric, target: k.target, per: k.per })) } : {}),
    ...(c.posting_windows?.length ? { posting_windows: [...c.posting_windows] } : {}),
    ...(c.rules?.length ? { rules: [...c.rules] } : {}),
  }
}

function sharedText(doc: SharedContentStrategy): string {
  return [
    ...doc.pillars.map((p) => p.name),
    ...doc.channels.flatMap((c) => [c.role ?? '', c.audience ?? '', ...(c.posting_windows ?? []), ...(c.rules ?? [])]),
  ].join('\n')
}

/** Writes (or with `dryRun`, previews) the shared view of the approved, served revision of one content strategy. */
export function shareStrategy(ws: KnowledgeWorkspace, input: { strategy_id: string; dryRun: boolean }): { path: string; strategy: SharedContentStrategy; written: boolean } {
  assertOwnerProcess()
  const id = validateStrategyId(input.strategy_id)
  const result = contentStrategyView(ws, { lang: 'en', strategy_id: id })
  const view = result.views[0]
  if (!view) {
    const held = Object.entries(result.withheld).map(([status, n]) => `${status}: ${n}`).join(', ')
    throw new StrategyError('refused', `No approved revision of ${id} is served now${held ? ` (${held})` : ''}. Approve it with brand:strategy first. Nothing was shared.`)
  }
  const strategy: SharedContentStrategy = {
    schema_version: 1,
    kind: 'content_strategy',
    brand_slug: ws.brandSlug,
    strategy_id: view.strategy_id,
    revision: view.revision,
    content_sha256: view.digests.content_sha256,
    approved_at: view.approval.approved_at,
    status: view.status,
    validity: { ...view.validity },
    languages: [...view.languages],
    pillars: view.pillars.map((p) => ({ id: p.id, name: p.name, fact_refs: [...p.fact_refs] })),
    channels: view.channels.map(channelCopy),
    gaps: view.gaps.map((gap) => ({ field: gap.field, reason: gap.reason, fact_ids: [...gap.fact_ids] })),
    shared_at: ws.now().toISOString(),
  }
  const blocked = safetyBlocksSharing(safetyReport(sharedText(strategy)))
  if (blocked.length) throw new StrategyError('refused', `The strategy text looks like it contains ${blocked.join('; ')}. Nothing was shared.`)
  const rel = `${SHARED_STRATEGY_DIR}/${id}.json`
  if (!input.dryRun) writeVaultFile(ws, path.join(ws.root, ...rel.split('/')), `${JSON.stringify(strategy, null, 2)}\n`, false)
  return { path: rel, strategy, written: !input.dryRun }
}

// ---- Studio projection ---------------------------------------------------------------------------------

export type WithheldStrategyReason = 'symlink' | 'unreadable' | 'invalid_record' | 'wrong_brand' | 'filename_mismatch' | 'unexpected_file' | 'unsafe_text'

export interface StudioStrategyProjection {
  strategies: SharedContentStrategy[]
  withheld: Array<{ path: string; reason: WithheldStrategyReason }>
  total: number
}

export const STUDIO_STRATEGY_LIMITS = { maxStrategies: 20, maxFileBytes: 256 * 1024 } as const

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).every((key) => keys.includes(key))
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max
const listOf = (v: unknown, max: number, test: (item: unknown) => boolean): boolean => Array.isArray(v) && v.length <= max && v.every(test)
const factId = (v: unknown) => typeof v === 'string' && FACT_ID.test(v) && !v.includes('..')
const oneOf = (list: readonly string[]) => (v: unknown) => typeof v === 'string' && list.includes(v)

function validChannel(value: unknown): boolean {
  if (!isObj(value)) return false
  if (!onlyKeys(value, ['channel', 'role', 'formats', 'cadence', 'languages', 'pillars', 'fact_refs', 'objective', 'audience', 'mix', 'kpis', 'posting_windows', 'rules'])) return false
  const c = value
  const cadence = c.cadence
  return (
    oneOf(CONTENT_CHANNELS)(c.channel) &&
    (c.role === null || str(c.role, STRATEGY_LIMITS.maxShortChars)) &&
    listOf(c.formats, CONTENT_FORMATS.length, oneOf(CONTENT_FORMATS)) &&
    (cadence === null || (isObj(cadence) && onlyKeys(cadence, ['per', 'target']) && (cadence.per === 'week' || cadence.per === 'month') && Number.isInteger(cadence.target) && (cadence.target as number) >= 1 && (cadence.target as number) <= STRATEGY_LIMITS.maxCadence)) &&
    listOf(c.languages, 10, (v) => typeof v === 'string' && LOCALE.test(v)) &&
    listOf(c.pillars, STRATEGY_LIMITS.maxPillars, (v) => typeof v === 'string' && ITEM_ID.test(v)) &&
    listOf(c.fact_refs, STRATEGY_LIMITS.maxFactRefs, factId) &&
    (c.objective === undefined || oneOf(CHANNEL_OBJECTIVES)(c.objective)) &&
    (c.audience === undefined || str(c.audience, CHANNEL_PLAN_LIMITS.maxAudienceChars)) &&
    (c.mix === undefined || listOf(c.mix, CONTENT_MIX_TYPES.length, (m) => isObj(m) && onlyKeys(m, ['type', 'share']) && oneOf(CONTENT_MIX_TYPES)(m.type) && Number.isInteger(m.share) && (m.share as number) >= 1 && (m.share as number) <= 100)) &&
    (c.kpis === undefined || listOf(c.kpis, CHANNEL_PLAN_LIMITS.maxKpis, (k) => isObj(k) && onlyKeys(k, ['metric', 'target', 'per']) && oneOf(CHANNEL_KPI_METRICS)(k.metric) && oneOf(CHANNEL_KPI_PERIODS)(k.per) && (k.target === null || (typeof k.target === 'number' && Number.isFinite(k.target) && k.target >= 0)))) &&
    (c.posting_windows === undefined || listOf(c.posting_windows, CHANNEL_PLAN_LIMITS.maxPostingWindows, (v) => str(v, CHANNEL_PLAN_LIMITS.maxPostingWindowChars))) &&
    (c.rules === undefined || listOf(c.rules, CHANNEL_PLAN_LIMITS.maxRules, (v) => str(v, CHANNEL_PLAN_LIMITS.maxRuleChars)))
  )
}

/** Strict shape check: an unexpected field anywhere withholds the whole file, never a partial view. */
export function validSharedStrategy(value: unknown): value is SharedContentStrategy {
  if (!isObj(value)) return false
  const d = value
  if (!onlyKeys(d, ['schema_version', 'kind', 'brand_slug', 'strategy_id', 'revision', 'content_sha256', 'approved_at', 'status', 'validity', 'languages', 'pillars', 'channels', 'gaps', 'shared_at'])) return false
  const validity = d.validity
  return (
    d.schema_version === 1 &&
    d.kind === 'content_strategy' &&
    str(d.brand_slug, 80) &&
    typeof d.strategy_id === 'string' &&
    STRATEGY_ID.test(d.strategy_id) &&
    Number.isInteger(d.revision) &&
    (d.revision as number) >= 1 &&
    typeof d.content_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(d.content_sha256) &&
    typeof d.approved_at === 'string' &&
    ISO.test(d.approved_at) &&
    (d.status === 'current' || d.status === 'review_due') &&
    isObj(validity) &&
    onlyKeys(validity, ['valid_from', 'valid_until', 'review_due_at']) &&
    [validity.valid_from, validity.valid_until, validity.review_due_at].every((v) => typeof v === 'string' && ISO.test(v)) &&
    listOf(d.languages, 10, (v) => typeof v === 'string' && LOCALE.test(v)) &&
    listOf(d.pillars, STRATEGY_LIMITS.maxPillars, (p) => isObj(p) && onlyKeys(p, ['id', 'name', 'fact_refs']) && typeof p.id === 'string' && ITEM_ID.test(p.id) && str(p.name, 80) && listOf(p.fact_refs, STRATEGY_LIMITS.maxFactRefs, factId)) &&
    listOf(d.channels, STRATEGY_LIMITS.maxChannels, validChannel) &&
    listOf(d.gaps, STRATEGY_LIMITS.maxGaps, (g) => isObj(g) && onlyKeys(g, ['field', 'reason', 'fact_ids']) && str(g.field, 120) && oneOf(CONTENT_GAP_REASONS)(g.reason) && listOf(g.fact_ids, STRATEGY_LIMITS.maxFactRefs, factId)) &&
    typeof d.shared_at === 'string' &&
    ISO.test(d.shared_at)
  )
}

/**
 * Reads `brand/content-strategy/shared/*.json` from a checkout (Studio: the extracted merged commit). Symlinks,
 * oversized, malformed, misnamed, other-brand and secret-looking files are withheld with a reason. Valid files are
 * copied field by field, so nothing else in a committed file reaches the page.
 */
export function buildStudioStrategy(root: string, brandSlug: string): StudioStrategyProjection {
  const dir = path.join(root, ...SHARED_STRATEGY_DIR.split('/'))
  const out: StudioStrategyProjection = { strategies: [], withheld: [], total: 0 }
  let stat: fs.Stats | undefined
  try {
    stat = fs.lstatSync(dir)
  } catch {
    return out
  }
  if (!stat.isDirectory()) return out
  for (const name of fs.readdirSync(dir).sort()) {
    const rel = `${SHARED_STRATEGY_DIR}/${name}`
    const file = path.join(dir, name)
    const entry = fs.lstatSync(file)
    if (entry.isSymbolicLink()) {
      out.withheld.push({ path: rel, reason: 'symlink' })
      continue
    }
    if (!SHARED_STRATEGY_FILE.test(name) || !entry.isFile()) {
      out.withheld.push({ path: rel, reason: 'unexpected_file' })
      continue
    }
    if (entry.size > STUDIO_STRATEGY_LIMITS.maxFileBytes) {
      out.withheld.push({ path: rel, reason: 'unreadable' })
      continue
    }
    let doc: unknown
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      out.withheld.push({ path: rel, reason: 'unreadable' })
      continue
    }
    if (!validSharedStrategy(doc)) {
      out.withheld.push({ path: rel, reason: 'invalid_record' })
      continue
    }
    if (doc.brand_slug !== brandSlug) {
      out.withheld.push({ path: rel, reason: 'wrong_brand' })
      continue
    }
    if (`${doc.strategy_id}.json` !== name) {
      out.withheld.push({ path: rel, reason: 'filename_mismatch' })
      continue
    }
    if (safetyBlocksSharing(safetyReport(sharedText(doc))).length) {
      out.withheld.push({ path: rel, reason: 'unsafe_text' })
      continue
    }
    out.strategies.push({
      schema_version: 1,
      kind: 'content_strategy',
      brand_slug: doc.brand_slug,
      strategy_id: doc.strategy_id,
      revision: doc.revision,
      content_sha256: doc.content_sha256,
      approved_at: doc.approved_at,
      status: doc.status,
      validity: { valid_from: doc.validity.valid_from, valid_until: doc.validity.valid_until, review_due_at: doc.validity.review_due_at },
      languages: [...doc.languages],
      pillars: doc.pillars.map((p) => ({ id: p.id, name: p.name, fact_refs: [...p.fact_refs] })),
      channels: doc.channels.map(channelCopy),
      gaps: doc.gaps.map((g) => ({ field: g.field, reason: g.reason, fact_ids: [...g.fact_ids] })),
      shared_at: doc.shared_at,
    })
  }
  out.total = out.strategies.length
  out.strategies = out.strategies.slice(0, STUDIO_STRATEGY_LIMITS.maxStrategies)
  return out
}
