import { addVariant, createProject, loadProject, recordFeedback } from '../creative/store.js'
import { CreativeError, SERIES_ID, type FeedbackEvent, type Surface } from '../creative/model.js'
import { captureNote } from '../knowledge/store.js'
import { KnowledgeError } from '../knowledge/model.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { StrategyError, type ContentFormat } from '../strategy/model.js'
import { assertOwnerProcess } from '../strategy/store.js'
import { validateWeekId, type ContentSlot, type ContentWeekRevision } from './calendar-model.js'
import { approvedWeekEntry, loadWeekRecord, loadWeekRevision, scanWeeks } from './calendar-store.js'
import { appendMetrics, observationWeekIds, readMetrics, type ContentMetrics, type ContentMetricsObservation, type MetricSource } from './observations.js'

/**
 * The owner's content feedback loop: feedback on a produced slot, and owner-reported metrics for it.
 *
 * - Feedback reuses Creative Learning end to end. The owner's words become a Knowledge note (source kind `owner_note`,
 *   tags `content-feedback` and `slot-<week>-<slot>`), linked to one creative project per slot (surface from the slot
 *   format, series = the slot's style id or its channel) on variant `A` (asset `missing`: Brand OS holds no copy of
 *   the produced piece). A preference only exists after the owner runs `brand:creative suggest` and `approve`; this
 *   module never suggests or approves one.
 * - Metrics are observations next to the calendar (observations.ts), labelled `owner_reported` / `not_verified`. They
 *   are never a fact, a claim or a verified result, and they change no week, strategy or fact.
 * - Both are owner-only: they refuse while BRAND_OS_AGENT_TOKEN is set.
 */

/** The creative surface for a calendar format. Copy-only formats map to the copy surfaces. */
const FORMAT_SURFACE: Record<ContentFormat, Surface> = {
  reel: 'reel',
  carousel: 'carousel',
  post: 'post',
  story: 'story',
  thread: 'thread',
  article: 'article',
  email: 'article',
  short_video: 'reel',
  video: 'script',
  live: 'script',
}

export function surfaceForFormat(format: ContentFormat | null | undefined): Surface | null {
  return format ? (FORMAT_SURFACE[format] ?? null) : null
}

/** One creative project per calendar slot. */
export function slotProjectId(weekId: string, slotId: string): string {
  return `content-${validateWeekId(weekId)}-${slotId}`
}

/**
 * The creative series for a slot: its style id when the slot carries one (`style` / `style_id`, added by the social
 * style kit), else its channel. A channel shorter than a series id (`x`) is prefixed with `channel-`.
 */
export function slotSeries(slot: ContentSlot): string {
  const extra = slot as ContentSlot & { style?: unknown; style_id?: unknown }
  for (const candidate of [extra.style_id, extra.style]) {
    if (typeof candidate === 'string' && SERIES_ID.test(candidate)) return candidate
    if (candidate && typeof candidate === 'object' && typeof (candidate as { id?: unknown }).id === 'string' && SERIES_ID.test((candidate as { id: string }).id)) return (candidate as { id: string }).id
  }
  return SERIES_ID.test(slot.channel) ? slot.channel : `channel-${slot.channel}`
}

const SLOT_ID = /^s\d{2,3}$/

/** The approved revision of a week and one of its slots. Feedback and metrics address approved weeks only. */
export function approvedSlot(ws: KnowledgeWorkspace, weekId: string, slotId: string): { revision: ContentWeekRevision; slot: ContentSlot } {
  const id = validateWeekId(weekId)
  if (typeof slotId !== 'string' || !SLOT_ID.test(slotId)) throw new StrategyError('invalid_input', '--slot is a slot id such as s01.')
  const record = loadWeekRecord(ws, id)
  const entry = approvedWeekEntry(record)
  if (!entry) throw new StrategyError('not_found', `${id} has no approved revision. Feedback and metrics are recorded on approved weeks.`)
  const revision = loadWeekRevision(ws, id, entry.revision, entry)
  const slot = revision.content.slots.find((item) => item.id === slotId)
  if (!slot) throw new StrategyError('not_found', `No slot ${slotId} in ${id} revision ${entry.revision}.`)
  return { revision, slot }
}

/** Single-quoted for a POSIX shell. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export interface SlotFeedbackInput {
  week_id: string
  slot_id: string
  /** The owner's verbatim words. Stored as a Knowledge note only. */
  text: string
  verdict?: string
  keep?: string[]
  avoid?: string[]
  language?: string | null
}

export interface SlotFeedbackResult {
  week_id: string
  slot_id: string
  week_revision: number
  project: { project_id: string; surface: Surface; series: string; created: boolean }
  variant_id: string
  feedback: FeedbackEvent
  note: { id: string; revision: string; scope: string; tags: string[] }
  /** The exact next commands: a draft preference, then the owner's approval (series scope). */
  next: { suggest: string; approve: string; context: string }
  authorizes: []
}

const VARIANT = 'A'

function asCreative<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof CreativeError) throw new StrategyError(error.code === 'not_found' ? 'not_found' : error.code === 'refused' ? 'refused' : 'invalid_input', error.message)
    if (error instanceof KnowledgeError) throw new StrategyError(error.code === 'refused' ? 'refused' : 'invalid_input', error.message)
    throw error
  }
}

/**
 * Records the owner's feedback on one slot of an approved week. The text becomes a Knowledge note; the slot's creative
 * project (created on first feedback) records the note id and revision with the verdict and closed-vocabulary aspects.
 */
export function recordSlotFeedback(ws: KnowledgeWorkspace, input: SlotFeedbackInput): SlotFeedbackResult {
  assertOwnerProcess()
  if (typeof input.text !== 'string' || !input.text.trim()) throw new StrategyError('invalid_input', '--text is the feedback in your own words.')
  const { revision, slot } = approvedSlot(ws, input.week_id, input.slot_id)
  const weekId = revision.week_id
  const surface = surfaceForFormat(slot.format)
  if (!surface) throw new StrategyError('invalid_input', `${weekId} ${slot.id} has no format yet; decide the format in the week before recording feedback.`)
  const series = slotSeries(slot)
  const projectId = slotProjectId(weekId, slot.id)
  const language = input.language ?? slot.language ?? null
  return asCreative(() => {
    let created = false
    let project
    try {
      project = loadProject(ws, projectId)
    } catch (error) {
      if (!(error instanceof CreativeError) || error.code !== 'not_found') throw error
      project = createProject(ws, { project_id: projectId, title: `Content ${weekId} ${slot.id} (${slot.channel}/${slot.format})`, surface, series, language: language && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(language) ? language : null })
      created = true
    }
    if (!project.variants.some((item) => item.variant_id === VARIANT)) addVariant(ws, { project_id: projectId, variant_id: VARIANT, asset: 'missing', describe: `${slot.channel} ${slot.format} ${slot.date}` })
    const tags = ['content-feedback', `slot-${weekId}-${slot.id}`, `proj-${projectId}`]
    const note = captureNote(ws, {
      title: `Content feedback: ${weekId} ${slot.id}`,
      body: input.text,
      kind: 'general',
      language,
      tags,
      source: { kind: 'owner_note', ref: `content:${weekId}/${slot.id}` },
    })
    const result = recordFeedback(ws, { project_id: projectId, variant_id: VARIANT, note_id: note.id, verdict: input.verdict ?? 'change_request', keep: input.keep, avoid: input.avoid })
    // A one-line owner sentence is a fair first draft of the rule; the owner edits it before approving.
    const flat = input.text.normalize('NFC').replace(/\s+/g, ' ').trim()
    const statement = flat.length <= 200 ? flat : '<one short rule in your own words, at most 200 characters>'
    return {
      week_id: weekId,
      slot_id: slot.id,
      week_revision: revision.revision,
      project: { project_id: projectId, surface: project.surface, series: project.series, created },
      variant_id: VARIANT,
      feedback: result.feedback,
      note: { id: note.id, revision: note.revision, scope: note.scope, tags },
      next: {
        suggest: `npm run brand:creative -- suggest --project ${projectId} --statement ${shellQuote(statement)} --source ${note.id}`,
        approve: 'npm run brand:creative -- approve --id <cp_… printed by suggest> --scope series',
        context: `npm run brand:creative -- context --surface ${project.surface} --series ${project.series}`,
      },
      authorizes: [],
    }
  })
}

export interface SlotMetricsInput {
  week_id: string
  slot_id: string
  metrics: ContentMetrics
  measured_at?: string
  source?: string
}

/** Owner-reported metrics for one slot of an approved week. Stored as an observation; nothing else changes. */
export function recordSlotMetrics(ws: KnowledgeWorkspace, input: SlotMetricsInput): ContentMetricsObservation {
  assertOwnerProcess()
  const { revision, slot } = approvedSlot(ws, input.week_id, input.slot_id)
  if (slot.status === 'skipped') throw new StrategyError('invalid_input', `${revision.week_id} ${slot.id} was skipped; there is nothing to measure.`)
  return appendMetrics(ws, {
    week_id: revision.week_id,
    slot_id: slot.id,
    week_revision: revision.revision,
    week_content_sha256: revision.content_sha256,
    metrics: input.metrics,
    measured_at: input.measured_at ?? ws.now().toISOString().slice(0, 10),
    source: (input.source ?? 'manual') as MetricSource,
  })
}

/** What a brief's `learnings` lists: ids and owner-reported numbers only, never note text. */
export interface SlotLearning {
  week_id: string
  slot_id: string
  date: string
  measured_at: string
  source: MetricSource
  label: 'owner_reported'
  verification: 'not_verified'
  metrics: ContentMetrics
}

export const MAX_LEARNINGS = 5

/**
 * Up to five recent slots of the same channel and format with owner-reported metrics (latest per slot), newest
 * measurement first. The slot itself is left out. Only metrics recorded against an approved week revision count.
 */
export function slotLearnings(ws: KnowledgeWorkspace, target: { week_id: string; slot_id: string; channel: string; format: string | null }): SlotLearning[] {
  if (!target.format) return []
  const weeks = new Map(scanWeeks(ws).map((record) => [record.week_id, record]))
  const latest = new Map<string, { item: ContentMetricsObservation; date: string }>()
  for (const weekId of observationWeekIds(ws)) {
    const record = weeks.get(weekId)
    if (!record) continue
    const revisions = new Map<number, ContentWeekRevision | null>()
    for (const item of readMetrics(ws, weekId)) {
      if (weekId === target.week_id && item.slot_id === target.slot_id) continue
      const entry = record.revisions.find((rev) => rev.revision === item.week_revision && rev.content_sha256 === item.week_content_sha256)
      if (!entry || !['approved', 'superseded'].includes(entry.state)) continue
      if (!revisions.has(item.week_revision)) {
        try {
          revisions.set(item.week_revision, loadWeekRevision(ws, weekId, item.week_revision, entry))
        } catch {
          revisions.set(item.week_revision, null)
        }
      }
      const slot = revisions.get(item.week_revision)?.content.slots.find((s) => s.id === item.slot_id)
      if (!slot || slot.channel !== target.channel || slot.format !== target.format) continue
      const key = `${weekId}:${item.slot_id}`
      const prior = latest.get(key)
      if (!prior || `${item.measured_at}${item.recorded_at}` >= `${prior.item.measured_at}${prior.item.recorded_at}`) latest.set(key, { item, date: slot.date })
    }
  }
  return [...latest.values()]
    .sort((a, b) => `${b.item.measured_at}${b.date}${b.item.slot_id}`.localeCompare(`${a.item.measured_at}${a.date}${a.item.slot_id}`))
    .slice(0, MAX_LEARNINGS)
    .map(({ item, date }) => ({ week_id: item.week_id, slot_id: item.slot_id, date, measured_at: item.measured_at, source: item.source, label: item.label, verification: item.verification, metrics: item.metrics }))
}

