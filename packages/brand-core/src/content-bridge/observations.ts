import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { KnowledgeError } from '../knowledge/model.js'
import { credentialFindings } from '../knowledge/safety.js'
import { dirUsable, safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { StrategyError } from '../strategy/model.js'
import { assertOwnerProcess } from '../strategy/store.js'
import { validateWeekId } from './calendar-model.js'

/**
 * Produced / published reports for calendar slots (Content Bridge Slice C): observations, never decisions.
 *
 * - An agent with the `content-read` token, or the owner, appends one observation: a slot of a served week was produced,
 *   or published at an https URL. The URL is validated and never fetched.
 * - Observations live next to, never inside, the calendar: `brand/.private/content/observations/<week_id>.json`
 *   (git-ignored). The approved week revision, its hash, the strategy and the facts are never changed by them, and
 *   nothing reads them to change strategy. They grant no publication, schedule or spend permission.
 * - Each observation pins the week revision and content hash it was reported against, so a report on a replaced week
 *   stays visibly tied to the old revision.
 * - Storage reuses the Knowledge vault helpers (lock, atomic private write, no symlinks), the same as the calendar.
 */

export const OBSERVATIONS_DIR = 'brand/.private/content/observations'
export const OBSERVATION_STATUSES = ['produced', 'published'] as const
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number]
export const OBSERVATION_LIMITS = { maxPerWeek: 400, maxUrlChars: 500, maxFileBytes: 512 * 1024 } as const
const OBSERVATION_ID = /^cob_[0-9a-f]{32}$/
const SLOT_ID = /^s\d{2,3}$/

export interface ContentObservation {
  observation_id: string
  week_id: string
  slot_id: string
  /** The served week revision and hash the report was made against. */
  week_revision: number
  week_content_sha256: string
  status: ObservationStatus
  /** https only; null for `produced` without a link. Never fetched. */
  url: string | null
  reported_at: string
  /** `agent-token:agt_…` or the owner process. */
  reporter: string
  profile: string | null
}

/** Owner-reported performance numbers. Every field is optional; at least one is given. */
export const METRIC_KEYS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'link_clicks', 'watch_time_s', 'completion_rate'] as const
export type MetricKey = (typeof METRIC_KEYS)[number]
export type ContentMetrics = Partial<Record<MetricKey, number>>
export const METRIC_SOURCES = ['manual', 'platform_export'] as const
export type MetricSource = (typeof METRIC_SOURCES)[number]
const METRICS_ID = /^cmx_[0-9a-f]{32}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const MAX_COUNT = 1e12

/**
 * Owner-reported metrics for one slot: an observation like a report, never a fact, a claim or a verified result.
 * Brand OS does not fetch platform numbers; `label` and `verification` say whose word the numbers are.
 */
export interface ContentMetricsObservation {
  metrics_id: string
  week_id: string
  slot_id: string
  week_revision: number
  week_content_sha256: string
  metrics: ContentMetrics
  /** The day the owner read the numbers (YYYY-MM-DD). */
  measured_at: string
  source: MetricSource
  label: 'owner_reported'
  verification: 'not_verified'
  recorded_at: string
  reporter: 'owner'
}

interface ObservationFile {
  schema_version: 1
  kind: 'content_observations'
  brand_slug: string
  week_id: string
  observations: ContentObservation[]
  /** Owner-reported metrics. Absent in files written before metrics existed, and while there are none. */
  metrics?: ContentMetricsObservation[]
}

/** Why a URL is refused, as a stable code (the caller prints it in the reader's language), or null when it is fine. */
export type UrlProblem = 'url_not_https' | 'url_too_long' | 'url_invalid' | 'url_credentials' | 'url_host'

export function urlProblem(value: string): UrlProblem | null {
  if (value.length > OBSERVATION_LIMITS.maxUrlChars) return 'url_too_long'
  if (/\s/.test(value)) return 'url_invalid'
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return 'url_invalid'
  }
  if (url.protocol !== 'https:') return 'url_not_https'
  if (url.username || url.password) return 'url_credentials'
  const host = url.hostname.toLowerCase()
  // A public post has a public host name: no localhost, bare names or IP literals.
  if (!host.includes('.') || host.endsWith('.localhost') || host.endsWith('.local') || /^[\d.]+$/.test(host) || host.startsWith('[')) return 'url_host'
  if (credentialFindings(value).length) return 'url_credentials'
  return null
}

function observationsFile(ws: KnowledgeWorkspace, weekId: string): string {
  return path.join(ws.root, ...OBSERVATIONS_DIR.split('/'), `${validateWeekId(weekId)}.json`)
}

function emptyFile(ws: KnowledgeWorkspace, weekId: string): ObservationFile {
  return { schema_version: 1, kind: 'content_observations', brand_slug: ws.brandSlug, week_id: weekId, observations: [] }
}

function validObservation(item: unknown, weekId: string): item is ContentObservation {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  return (
    typeof o.observation_id === 'string' &&
    OBSERVATION_ID.test(o.observation_id) &&
    o.week_id === weekId &&
    typeof o.slot_id === 'string' &&
    SLOT_ID.test(o.slot_id) &&
    typeof o.week_revision === 'number' &&
    typeof o.week_content_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(o.week_content_sha256) &&
    (OBSERVATION_STATUSES as readonly unknown[]).includes(o.status) &&
    (o.url === null || (typeof o.url === 'string' && urlProblem(o.url) === null)) &&
    typeof o.reported_at === 'string' &&
    typeof o.reporter === 'string'
  )
}

/** A metric value: a finite, non-negative number; counts are whole numbers; completion_rate is a percent (0–100). */
export function metricProblem(key: MetricKey, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return `${key} must be a number of 0 or more.`
  if (key === 'completion_rate') return value > 100 ? 'completion_rate is a percent from 0 to 100.' : null
  if (key === 'watch_time_s') return value > MAX_COUNT ? 'watch_time_s is too large.' : null
  if (!Number.isInteger(value) || value > MAX_COUNT) return `${key} must be a whole number.`
  return null
}

function validDay(value: unknown): value is string {
  return typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
}

function validMetrics(item: unknown, weekId: string): item is ContentMetricsObservation {
  if (!item || typeof item !== 'object') return false
  const o = item as Record<string, unknown>
  const m = o.metrics as Record<string, unknown> | null
  return (
    typeof o.metrics_id === 'string' &&
    METRICS_ID.test(o.metrics_id) &&
    o.week_id === weekId &&
    typeof o.slot_id === 'string' &&
    SLOT_ID.test(o.slot_id) &&
    typeof o.week_revision === 'number' &&
    typeof o.week_content_sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(o.week_content_sha256) &&
    !!m &&
    typeof m === 'object' &&
    Object.keys(m).length > 0 &&
    Object.entries(m).every(([key, value]) => (METRIC_KEYS as readonly string[]).includes(key) && metricProblem(key as MetricKey, value) === null) &&
    validDay(o.measured_at) &&
    (METRIC_SOURCES as readonly unknown[]).includes(o.source) &&
    o.label === 'owner_reported' &&
    o.verification === 'not_verified' &&
    typeof o.recorded_at === 'string' &&
    o.reporter === 'owner'
  )
}

interface FileData {
  observations: ContentObservation[]
  metrics: ContentMetricsObservation[]
}

function readFile(ws: KnowledgeWorkspace, weekId: string): FileData {
  const empty: FileData = { observations: [], metrics: [] }
  const file = observationsFile(ws, weekId)
  if (!dirUsable(ws, path.dirname(file))) return empty
  let raw: Buffer | null
  try {
    raw = safeRead(file, OBSERVATION_LIMITS.maxFileBytes)
  } catch (error) {
    if (error instanceof KnowledgeError) return empty
    throw error
  }
  if (!raw) return empty
  try {
    const doc = JSON.parse(raw.toString('utf8')) as ObservationFile
    if (doc?.kind !== 'content_observations' || doc.brand_slug !== ws.brandSlug || doc.week_id !== weekId || !Array.isArray(doc.observations)) return empty
    return {
      observations: doc.observations.filter((item) => validObservation(item, weekId)),
      metrics: Array.isArray(doc.metrics) ? doc.metrics.filter((item) => validMetrics(item, weekId)) : [],
    }
  } catch {
    return empty
  }
}

function writeFile(ws: KnowledgeWorkspace, weekId: string, data: FileData): void {
  const doc: ObservationFile = { ...emptyFile(ws, weekId), observations: data.observations }
  // A file without metrics keeps the exact shape it had before metrics existed.
  if (data.metrics.length) doc.metrics = data.metrics
  writeVaultFile(ws, observationsFile(ws, weekId), `${JSON.stringify(doc, null, 2)}\n`, true)
}

/** The observations of one week, oldest first. A missing file is empty; a corrupt or foreign file reads as empty. */
export function readObservations(ws: KnowledgeWorkspace, weekId: string): ContentObservation[] {
  return readFile(ws, weekId).observations
}

/** Owner-reported metrics of one week, oldest first. Invalid entries are skipped, never partly read. */
export function readMetrics(ws: KnowledgeWorkspace, weekId: string): ContentMetricsObservation[] {
  return readFile(ws, weekId).metrics
}

/** Week ids that have an observation file (reports or metrics), sorted. */
export function observationWeekIds(ws: KnowledgeWorkspace): string[] {
  const dir = path.join(ws.root, ...OBSERVATIONS_DIR.split('/'))
  if (!dirUsable(ws, dir)) return []
  return fs
    .readdirSync(dir)
    .map((name) => /^(wk-\d{4}-\d{2}-\d{2})\.json$/.exec(name)?.[1])
    .filter((id): id is string => Boolean(id))
    .sort()
}

/** The latest metrics per slot of one week revision (by measured_at, then recorded_at). */
export function latestMetricsBySlot(metrics: ContentMetricsObservation[], revision: number, sha: string): Map<string, ContentMetricsObservation> {
  const out = new Map<string, ContentMetricsObservation>()
  for (const item of metrics) {
    if (item.week_revision !== revision || item.week_content_sha256 !== sha) continue
    const prior = out.get(item.slot_id)
    if (!prior || `${item.measured_at}${item.recorded_at}` >= `${prior.measured_at}${prior.recorded_at}`) out.set(item.slot_id, item)
  }
  return out
}

export interface AppendMetricsInput {
  week_id: string
  slot_id: string
  week_revision: number
  week_content_sha256: string
  metrics: ContentMetrics
  measured_at: string
  source: MetricSource
}

/**
 * Appends owner-reported metrics for one slot. The caller (owner process) has checked that the slot belongs to the
 * approved week revision. Nothing else changes: not the week, the strategy or a fact.
 */
export function appendMetrics(ws: KnowledgeWorkspace, input: AppendMetricsInput): ContentMetricsObservation {
  assertOwnerProcess()
  const weekId = validateWeekId(input.week_id)
  if (!SLOT_ID.test(input.slot_id)) throw new StrategyError('invalid_input', 'slot_id is not valid.')
  const entries = Object.entries(input.metrics ?? {}).filter(([, value]) => value !== undefined)
  if (!entries.length) throw new StrategyError('invalid_input', 'Give at least one metric (for example --views 1200).')
  for (const [key, value] of entries) {
    if (!(METRIC_KEYS as readonly string[]).includes(key)) throw new StrategyError('invalid_input', `Unknown metric ${key}.`)
    const problem = metricProblem(key as MetricKey, value)
    if (problem) throw new StrategyError('invalid_input', problem)
  }
  if (!(METRIC_SOURCES as readonly string[]).includes(input.source)) throw new StrategyError('invalid_input', `source is one of ${METRIC_SOURCES.join(', ')}.`)
  if (!validDay(input.measured_at)) throw new StrategyError('invalid_input', 'measured_at is a date YYYY-MM-DD.')
  if (input.measured_at > ws.now().toISOString().slice(0, 10)) throw new StrategyError('invalid_input', 'measured_at cannot be in the future.')
  const metrics = Object.fromEntries(METRIC_KEYS.filter((key) => input.metrics[key] !== undefined).map((key) => [key, input.metrics[key]!])) as ContentMetrics
  return withLock(ws, `content-obs-${weekId}`, () => {
    const data = readFile(ws, weekId)
    if (data.observations.length + data.metrics.length >= OBSERVATION_LIMITS.maxPerWeek) throw new StrategyError('invalid_input', `At most ${OBSERVATION_LIMITS.maxPerWeek} observations per week.`)
    const item: ContentMetricsObservation = {
      metrics_id: `cmx_${crypto.randomUUID().replace(/-/g, '')}`,
      week_id: weekId,
      slot_id: input.slot_id,
      week_revision: input.week_revision,
      week_content_sha256: input.week_content_sha256,
      metrics,
      measured_at: input.measured_at,
      source: input.source,
      label: 'owner_reported',
      verification: 'not_verified',
      recorded_at: ws.now().toISOString(),
      reporter: 'owner',
    }
    data.metrics.push(item)
    writeFile(ws, weekId, data)
    return item
  })
}

/** Owner overview: every metrics entry of the given weeks. */
export function listMetrics(ws: KnowledgeWorkspace, weekIds: string[]): ContentMetricsObservation[] {
  assertOwnerProcess()
  return weekIds.flatMap((id) => readMetrics(ws, id))
}

/** The latest observation per slot of one week revision (a report against another revision is not carried over). */
export function latestBySlot(observations: ContentObservation[], revision: number, sha: string): Map<string, ContentObservation> {
  const out = new Map<string, ContentObservation>()
  for (const item of observations) if (item.week_revision === revision && item.week_content_sha256 === sha) out.set(item.slot_id, item)
  return out
}

export interface AppendInput {
  week_id: string
  slot_id: string
  week_revision: number
  week_content_sha256: string
  status: ObservationStatus
  url: string | null
  reporter: string
  profile: string | null
}

/**
 * Appends one observation. The caller has already checked that the slot belongs to the served revision. The same
 * report twice (slot, revision, status, URL) is not stored again: the earlier observation is returned.
 */
export function appendObservation(ws: KnowledgeWorkspace, input: AppendInput): { observation: ContentObservation; duplicate: boolean } {
  const weekId = validateWeekId(input.week_id)
  if (!SLOT_ID.test(input.slot_id)) throw new StrategyError('invalid_input', 'slot_id is not valid.')
  if (!(OBSERVATION_STATUSES as readonly string[]).includes(input.status)) throw new StrategyError('invalid_input', 'status must be produced or published.')
  if (input.url !== null && urlProblem(input.url)) throw new StrategyError('invalid_input', `url is refused (${urlProblem(input.url)}).`)
  if (input.status === 'published' && input.url === null) throw new StrategyError('invalid_input', 'A published report needs its https URL.')
  return withLock(ws, `content-obs-${weekId}`, () => {
    const data = readFile(ws, weekId)
    const doc = { observations: data.observations }
    const same = doc.observations.find(
      (item) => item.slot_id === input.slot_id && item.week_revision === input.week_revision && item.week_content_sha256 === input.week_content_sha256 && item.status === input.status && item.url === input.url,
    )
    if (same) return { observation: same, duplicate: true }
    if (doc.observations.length >= OBSERVATION_LIMITS.maxPerWeek) throw new StrategyError('invalid_input', `At most ${OBSERVATION_LIMITS.maxPerWeek} reports per week.`)
    const observation: ContentObservation = {
      observation_id: `cob_${crypto.randomUUID().replace(/-/g, '')}`,
      week_id: weekId,
      slot_id: input.slot_id,
      week_revision: input.week_revision,
      week_content_sha256: input.week_content_sha256,
      status: input.status,
      url: input.url,
      reported_at: ws.now().toISOString(),
      reporter: input.reporter,
      profile: input.profile,
    }
    doc.observations.push(observation)
    // Owner-reported metrics in the same file are kept as they are.
    writeFile(ws, weekId, { observations: doc.observations, metrics: data.metrics })
    return { observation, duplicate: false }
  })
}

/** Owner overview: every observation of one week, or of every week with a file. */
export function listObservations(ws: KnowledgeWorkspace, weekIds: string[]): ContentObservation[] {
  assertOwnerProcess()
  return weekIds.flatMap((id) => readObservations(ws, id))
}
