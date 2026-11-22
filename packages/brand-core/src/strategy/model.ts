import crypto from 'node:crypto'
import { safetyReport } from '../knowledge/safety.js'
import { parseKnowledgeRef } from '../knowledge/proposals.js'

/**
 * Strategy records (Spec Sprint 3): one typed, owner-approved strategy with immutable revisions.
 *
 * - A StrategyRevision is written once and never edited. Its `content_sha256` covers the canonical JSON of what the
 *   owner reviews. A StrategyRecord is the small mutable index: which revisions exist and their lifecycle state.
 * - Brand claims are cited, never copied: `fact_refs` name approved canonical facts with the revision_hash seen at
 *   proposal time; `evidence_refs` name Knowledge research notes as `knowledge:kn_…@<sha256>`. A note body is never
 *   stored here.
 * - Approval is the owner's step (approval proof), bound to the exact content hash and sealed with an HMAC keyed by
 *   the owner's approval secret, so a hand edit of either file is detected on every read.
 * - A strategy never authorizes execution, spending or publication. See docs-internal/STRATEGY_FEED.md.
 */

export const STRATEGY_SCHEMA_VERSION = 1

export const STRATEGY_TYPES = ['seo', 'paid_media'] as const
/** The execution-agent kinds a recommendation can be handed to. Fixed by the agent's token profile, never an argument. */
export const AGENT_KINDS = ['seo', 'ads'] as const
/** Which agent kind may read which strategy type. One slice per kind. */
export const TYPE_AGENT: Record<StrategyType, AgentKind> = { seo: 'seo', paid_media: 'ads' }

export const REVISION_STATES = ['draft', 'approved', 'rejected', 'superseded', 'withdrawn'] as const
/** Computed at read time from the stored state, the dates and the cited sources. Never stored. */
export const EFFECTIVE_STATUSES = ['current', 'review_due', 'not_yet_valid', 'expired', 'needs_review', 'integrity_failed', 'draft', 'rejected', 'superseded', 'withdrawn'] as const

export type StrategyType = (typeof STRATEGY_TYPES)[number]
export type AgentKind = (typeof AGENT_KINDS)[number]
export type RevisionState = (typeof REVISION_STATES)[number]
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number]

export const STRATEGY_ID = /^[a-z0-9][a-z0-9-]{2,47}$/
const ITEM_ID = /^[a-z0-9][a-z0-9_.-]{0,39}$/
const FACT_ID = /^[a-z0-9][a-z0-9_.-]{1,119}$/
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/
const CURRENCY = /^[A-Z]{3}$/

export const STRATEGY_LIMITS = {
  maxTitleChars: 120,
  maxShortChars: 200,
  maxLongChars: 600,
  maxListItems: 20,
  maxRecommendations: 30,
  maxAlternatives: 10,
  maxMetrics: 10,
  maxFactRefs: 30,
  maxEvidenceRefs: 40,
  maxRevisions: 200,
  maxFileBytes: 512 * 1024,
} as const

export class StrategyError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'not_found' | 'exists' | 'wrong_brand' | 'refused' | 'proof' | 'stale_source' | 'stale_revision' | 'integrity_failed' | 'unsafe_path' | 'invalid_record',
    message: string,
  ) {
    super(message)
    this.name = 'StrategyError'
  }
}

export interface FactRef {
  id: string
  /** The fact's revision_hash when it was cited. A different hash later means the fact changed: needs_review. */
  revision: string
}

export interface EvidenceRef {
  /** `knowledge:kn_…@<sha256>`: a research note in this brand's Knowledge Inbox at the revision that was read. */
  ref: string
  note_id: string
  revision: string
}

export interface SuccessMetric {
  id: string
  unit: string
  /** Null means unknown. Never a guess. */
  baseline: number | null
  target: number | null
  measurement_source: string | null
  status: 'needs_baseline' | 'defined' | 'not_measured'
}

export interface StrategyAlternative {
  id: string
  description: string
  assessment: 'chosen' | 'secondary' | 'deferred' | 'rejected'
  rationale: string | null
}

export interface Recommendation {
  id: string
  priority: 'high' | 'medium' | 'low'
  action: string
  rationale: string
  /** Which execution-agent kinds receive this recommendation in their slice. */
  agent_kinds: AgentKind[]
  evidence_refs: string[]
  fact_refs: string[]
}

/** Owner-only. Never leaves the owner's process: every agent read lists it under `withheld`. */
export interface RestrictedBlock {
  budget: { amount: number; currency: string; period: string } | null
  notes: string | null
}

export type StrategyOrigin = { kind: 'manual' } | { kind: 'seo_draft'; plan_id: string; strategist: string }

/** Everything the owner reviews and approves. Hashed canonically into content_sha256. */
export interface StrategyContent {
  title: string
  type: StrategyType
  locale: string
  scope: { markets: string[]; channel: string; period: string | null }
  valid_from: string
  valid_until: string
  review_due_at: string
  objective: { statement: string; status: 'hypothesis' | 'decided' }
  success_metrics: SuccessMetric[]
  guardrails: string[]
  constraints: string[]
  must_do: string[]
  must_not_do: string[]
  non_goals: string[]
  alternatives: StrategyAlternative[]
  selection_rationale: string
  recommendations: Recommendation[]
  fact_refs: FactRef[]
  evidence_refs: EvidenceRef[]
  assumptions: string[]
  open_questions: string[]
  restricted: RestrictedBlock | null
  origin: StrategyOrigin
}

/** One immutable revision file. */
export interface StrategyRevision {
  schema_version: number
  kind: 'strategy_revision'
  strategy_id: string
  brand_slug: string
  revision: number
  /** The approved revision this draft replaces when approved, or null for the first. */
  supersedes_revision: number | null
  content: StrategyContent
  content_sha256: string
  created_at: string
}

export interface StrategyApproval {
  event_id: string
  approved_at: string
  actor: 'owner'
  /** sha256 over strategy id, brand, revision, content_sha256, event id and time. */
  digest: string
  /** HMAC-SHA256 of the digest keyed by the owner's approval secret. A copied or hand-written approval does not verify. */
  seal: string
}

export interface RevisionEntry {
  revision: number
  content_sha256: string
  state: RevisionState
  created_at: string
  approval: StrategyApproval | null
  superseded_by: number | null
  superseded_at: string | null
  rejected_at: string | null
  withdrawn: { at: string; reason: string } | null
}

/** The mutable index of one strategy. At most one revision is `approved` at a time. */
export interface StrategyRecord {
  schema_version: number
  kind: 'strategy_record'
  strategy_id: string
  brand_slug: string
  type: StrategyType
  created_at: string
  updated_at: string
  revisions: RevisionEntry[]
}

// ---- canonical hashing -------------------------------------------------------------------------------

/** JSON with object keys sorted at every level; arrays keep their order. The single serialization every digest uses. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

export function sha256Hex(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex')
}

export function contentDigest(rev: Pick<StrategyRevision, 'strategy_id' | 'brand_slug' | 'revision' | 'supersedes_revision' | 'content'>): string {
  return sha256Hex(canonicalJson({ strategy_id: rev.strategy_id, brand_slug: rev.brand_slug, revision: rev.revision, supersedes_revision: rev.supersedes_revision, content: rev.content }))
}

export function approvalDigest(input: { strategy_id: string; brand_slug: string; revision: number; content_sha256: string; event_id: string; approved_at: string }): string {
  return sha256Hex(canonicalJson(input))
}

export function approvalSeal(secret: string, digest: string): string {
  return crypto.createHmac('sha256', secret).update(`brand-os/strategy-approval/v1\n${digest}`).digest('hex')
}

/** Digest of what a revision cites (facts and research notes, with revisions). Lets an agent detect a source change. */
export function sourceDigest(content: Pick<StrategyContent, 'fact_refs' | 'evidence_refs'>): string {
  return sha256Hex(canonicalJson({ facts: content.fact_refs.map((ref) => [ref.id, ref.revision]), evidence: content.evidence_refs.map((ref) => ref.ref) }))
}

export function newApprovalEventId(): string {
  return `apv_${crypto.randomUUID()}`
}

// ---- input validation --------------------------------------------------------------------------------

export function validateStrategyId(value: unknown): string {
  if (typeof value !== 'string' || !STRATEGY_ID.test(value)) throw new StrategyError('invalid_input', 'A strategy id is 3–48 lowercase letters, digits and hyphens (for example seo-global-discovery).')
  return value
}

export function validateRevisionNumber(value: unknown): number {
  const n = typeof value === 'string' && /^[1-9][0-9]{0,5}$/.test(value) ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 999_999) throw new StrategyError('invalid_input', 'A revision is a positive whole number (1, 2, …).')
  return n
}

export function validateSha(value: unknown, field = 'sha256'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new StrategyError('invalid_input', `${field} must be a 64-character lowercase hex sha256.`)
  return value
}

/** Placeholder text from examples or templates must never pass as an approved decision. */
const PLACEHOLDER = /\b(?:EXAMPLE|TBD|TODO|PLACEHOLDER|LOREM)\b|EXAMPLE_[A-Z_]+/
/** Money amounts and budget figures. They belong in the restricted block, which no agent receives. */
const MONEY = /[€$£₺]\s?\d|\d[\d.,]*\s?(?:k|m)?\s?(?:EUR|USD|GBP|TRY|IRR|TL|euros?|dollars?|lira|tomans?|تومان|ریال)(?![A-Za-z])|\b(?:budget|spend|cpc|cpa|bid)\b[^.]{0,30}\d/i

type Raw = Record<string, unknown>

function objectOf(value: unknown, field: string, allowed: readonly string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new StrategyError('invalid_input', `${field} must be an object.`)
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) throw new StrategyError('invalid_input', `${field} has unknown field(s): ${unknown.slice(0, 5).join(', ')}.`)
  return value as Raw
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  throw new StrategyError('invalid_input', `${field} must be one of ${allowed.join(', ')}.`)
}

/** Single-line, bounded, no credentials or personal data, no placeholders. */
export function text(value: unknown, field: string, max: number = STRATEGY_LIMITS.maxShortChars, opts: { optional?: boolean; restricted?: boolean } = {}): string {
  if ((value === undefined || value === null || value === '') && opts.optional) return ''
  if (typeof value !== 'string') throw new StrategyError('invalid_input', `${field} must be text.`)
  const clean = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!clean) throw new StrategyError('invalid_input', `${field} is empty.`)
  if (clean.length > max) throw new StrategyError('invalid_input', `${field} is longer than ${max} characters. Keep long reasoning in a Knowledge note and cite it.`)
  if (PLACEHOLDER.test(clean)) throw new StrategyError('invalid_input', `${field} contains placeholder text (EXAMPLE, TBD, TODO). Write the real decision or leave it out.`)
  const report = safetyReport(clean)
  const blocked = [...report.credentials.map((kind) => `possible credentials (${kind})`), ...report.personal.map((kind) => `personal private data (${kind})`)]
  // Budgets, finance and legal terms belong in the restricted block, which no agent receives.
  if (!opts.restricted && (report.restricted_passages > 0 || MONEY.test(clean))) blocked.push('restricted financial or legal data such as a budget or amount (put it under restricted)')
  if (blocked.length) throw new StrategyError('refused', `${field} looks like it contains ${blocked.join('; ')}. Nothing was written.`)
  return clean
}

function optionalText(value: unknown, field: string, max?: number): string | null {
  const out = text(value, field, max, { optional: true })
  return out === '' ? null : out
}

function list(value: unknown, field: string, max: number = STRATEGY_LIMITS.maxListItems): unknown[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new StrategyError('invalid_input', `${field} must be a list.`)
  if (value.length > max) throw new StrategyError('invalid_input', `${field} has more than ${max} items.`)
  return value
}

function textList(value: unknown, field: string): string[] {
  const out = list(value, field).map((item, i) => text(item, `${field}[${i}]`))
  return [...new Set(out)]
}

function itemId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ITEM_ID.test(value)) throw new StrategyError('invalid_input', `${field} must be a short id (lowercase letters, digits, . _ -).`)
  return value
}

function uniqueIds<T extends { id: string }>(items: T[], field: string): T[] {
  const seen = new Set<string>()
  for (const item of items) {
    if (seen.has(item.id)) throw new StrategyError('invalid_input', `${field} has a duplicate id ${item.id}.`)
    seen.add(item.id)
  }
  return items
}

function isoDate(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) {
    throw new StrategyError('invalid_input', `${field} must be an ISO date (2027-03-31 or 2027-03-31T00:00:00Z).`)
  }
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(date.getTime())) throw new StrategyError('invalid_input', `${field} is not a real date.`)
  return date.toISOString()
}

function finiteOrNull(value: unknown, field: string): number | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new StrategyError('invalid_input', `${field} must be a number or null (unknown).`)
  return value
}

/** The proposal as the owner (or Claude, for the owner) writes it. fact_refs and evidence_refs are resolved by the store. */
export interface ProposalInput {
  title: string
  type: StrategyType
  locale: string
  scope: StrategyContent['scope']
  valid_from: string
  valid_until: string
  review_due_at: string
  objective: StrategyContent['objective']
  success_metrics: SuccessMetric[]
  guardrails: string[]
  constraints: string[]
  must_do: string[]
  must_not_do: string[]
  non_goals: string[]
  alternatives: StrategyAlternative[]
  selection_rationale: string
  recommendations: Recommendation[]
  /** Approved fact ids. The store records each one's current revision_hash. */
  fact_ids: string[]
  /** Research note ids (kn_…) or pinned refs (knowledge:kn_…@sha256). The store checks the pin is current. */
  evidence: string[]
  assumptions: string[]
  open_questions: string[]
  restricted: RestrictedBlock | null
  origin: StrategyOrigin
}

const PROPOSAL_KEYS = [
  'title',
  'type',
  'locale',
  'scope',
  'valid_from',
  'valid_until',
  'review_due_at',
  'objective',
  'success_metrics',
  'guardrails',
  'constraints',
  'must_do',
  'must_not_do',
  'non_goals',
  'alternatives',
  'selection_rationale',
  'recommendations',
  'fact_refs',
  'evidence_refs',
  'assumptions',
  'open_questions',
  'restricted',
] as const

function evidenceInput(value: unknown, field: string): string {
  if (typeof value === 'string' && (/^kn_[a-z0-9][a-z0-9-]{2,63}$/.test(value) || parseKnowledgeRef(value))) return value
  throw new StrategyError('invalid_input', `${field} must be a research note id (kn_…) or knowledge:kn_…@<sha256>.`)
}

/** Strict parse of a proposal file. Unknown keys are refused at every level. Dates are normalized to ISO UTC. */
export function parseProposal(raw: unknown, origin: StrategyOrigin = { kind: 'manual' }): ProposalInput {
  const doc = objectOf(raw, 'The proposal', PROPOSAL_KEYS)
  const scope = objectOf(doc.scope, 'scope', ['markets', 'channel', 'period'])
  const objective = objectOf(doc.objective, 'objective', ['statement', 'status'])
  const markets = list(scope.markets, 'scope.markets', 20).map((item, i) => {
    if (typeof item !== 'string' || !LOCALE.test(item)) throw new StrategyError('invalid_input', `scope.markets[${i}] must be a market code such as en-US or tr.`)
    return item
  })
  if (markets.length === 0) throw new StrategyError('invalid_input', 'scope.markets needs at least one market.')
  if (typeof doc.locale !== 'string' || !LOCALE.test(doc.locale)) throw new StrategyError('invalid_input', 'locale must be a code such as en, fa or tr.')
  const metrics = uniqueIds(
    list(doc.success_metrics, 'success_metrics', STRATEGY_LIMITS.maxMetrics).map((item, i) => {
      const m = objectOf(item, `success_metrics[${i}]`, ['id', 'unit', 'baseline', 'target', 'measurement_source', 'status'])
      const baseline = finiteOrNull(m.baseline, `success_metrics[${i}].baseline`)
      const status = oneOf(m.status ?? (baseline === null ? 'needs_baseline' : 'defined'), ['needs_baseline', 'defined', 'not_measured'] as const, `success_metrics[${i}].status`)
      if (status === 'defined' && baseline === null) throw new StrategyError('invalid_input', `success_metrics[${i}] is defined but has no baseline. Use needs_baseline.`)
      return {
        id: itemId(m.id, `success_metrics[${i}].id`),
        unit: text(m.unit, `success_metrics[${i}].unit`, 40),
        baseline,
        target: finiteOrNull(m.target, `success_metrics[${i}].target`),
        measurement_source: optionalText(m.measurement_source, `success_metrics[${i}].measurement_source`, 80),
        status,
      }
    }),
    'success_metrics',
  )
  const alternatives = uniqueIds(
    list(doc.alternatives, 'alternatives', STRATEGY_LIMITS.maxAlternatives).map((item, i) => {
      const a = objectOf(item, `alternatives[${i}]`, ['id', 'description', 'assessment', 'rationale'])
      return {
        id: itemId(a.id, `alternatives[${i}].id`),
        description: text(a.description, `alternatives[${i}].description`),
        assessment: oneOf(a.assessment, ['chosen', 'secondary', 'deferred', 'rejected'] as const, `alternatives[${i}].assessment`),
        rationale: optionalText(a.rationale, `alternatives[${i}].rationale`, STRATEGY_LIMITS.maxLongChars),
      }
    }),
    'alternatives',
  )
  const recommendations = uniqueIds(
    list(doc.recommendations, 'recommendations', STRATEGY_LIMITS.maxRecommendations).map((item, i) => {
      const r = objectOf(item, `recommendations[${i}]`, ['id', 'priority', 'action', 'rationale', 'agent_kinds', 'evidence_refs', 'fact_refs'])
      const kinds = [...new Set(list(r.agent_kinds, `recommendations[${i}].agent_kinds`, AGENT_KINDS.length).map((kind) => oneOf(kind, AGENT_KINDS, `recommendations[${i}].agent_kinds`)))]
      return {
        id: itemId(r.id, `recommendations[${i}].id`),
        priority: oneOf(r.priority, ['high', 'medium', 'low'] as const, `recommendations[${i}].priority`),
        action: text(r.action, `recommendations[${i}].action`),
        rationale: text(r.rationale, `recommendations[${i}].rationale`, STRATEGY_LIMITS.maxLongChars),
        agent_kinds: kinds,
        evidence_refs: [...new Set(list(r.evidence_refs, `recommendations[${i}].evidence_refs`).map((ref, j) => evidenceInput(ref, `recommendations[${i}].evidence_refs[${j}]`)))],
        fact_refs: [...new Set(list(r.fact_refs, `recommendations[${i}].fact_refs`).map((id, j) => factIdOf(id, `recommendations[${i}].fact_refs[${j}]`)))],
      }
    }),
    'recommendations',
  )
  if (recommendations.length === 0) throw new StrategyError('invalid_input', 'A strategy needs at least one recommendation.')
  let restricted: RestrictedBlock | null = null
  if (doc.restricted !== undefined && doc.restricted !== null) {
    const r = objectOf(doc.restricted, 'restricted', ['budget', 'notes'])
    let budget: RestrictedBlock['budget'] = null
    if (r.budget !== undefined && r.budget !== null) {
      const b = objectOf(r.budget, 'restricted.budget', ['amount', 'currency', 'period'])
      const amount = finiteOrNull(b.amount, 'restricted.budget.amount')
      if (amount === null || amount < 0) throw new StrategyError('invalid_input', 'restricted.budget.amount must be a number of zero or more.')
      if (typeof b.currency !== 'string' || !CURRENCY.test(b.currency)) throw new StrategyError('invalid_input', 'restricted.budget.currency must be an ISO code such as EUR.')
      budget = { amount, currency: b.currency, period: text(b.period, 'restricted.budget.period', 40) }
    }
    restricted = { budget, notes: text(r.notes, 'restricted.notes', STRATEGY_LIMITS.maxLongChars, { optional: true, restricted: true }) || null }
  }
  const proposal: ProposalInput = {
    title: text(doc.title, 'title', STRATEGY_LIMITS.maxTitleChars),
    type: oneOf(doc.type, STRATEGY_TYPES, 'type'),
    locale: doc.locale,
    scope: { markets: [...new Set(markets)], channel: text(scope.channel, 'scope.channel', 60), period: optionalText(scope.period, 'scope.period', 40) },
    valid_from: isoDate(doc.valid_from, 'valid_from'),
    valid_until: isoDate(doc.valid_until, 'valid_until'),
    review_due_at: isoDate(doc.review_due_at, 'review_due_at'),
    objective: { statement: text(objective.statement, 'objective.statement', STRATEGY_LIMITS.maxLongChars), status: oneOf(objective.status, ['hypothesis', 'decided'] as const, 'objective.status') },
    success_metrics: metrics,
    guardrails: textList(doc.guardrails, 'guardrails'),
    constraints: textList(doc.constraints, 'constraints'),
    must_do: textList(doc.must_do, 'must_do'),
    must_not_do: textList(doc.must_not_do, 'must_not_do'),
    non_goals: textList(doc.non_goals, 'non_goals'),
    alternatives,
    selection_rationale: text(doc.selection_rationale, 'selection_rationale', STRATEGY_LIMITS.maxLongChars),
    recommendations,
    fact_ids: [...new Set(list(doc.fact_refs, 'fact_refs', STRATEGY_LIMITS.maxFactRefs).map((id, i) => factIdOf(id, `fact_refs[${i}]`)))],
    evidence: [...new Set(list(doc.evidence_refs, 'evidence_refs', STRATEGY_LIMITS.maxEvidenceRefs).map((ref, i) => evidenceInput(ref, `evidence_refs[${i}]`)))],
    assumptions: textList(doc.assumptions, 'assumptions'),
    open_questions: textList(doc.open_questions, 'open_questions'),
    restricted,
    origin,
  }
  if (proposal.valid_until <= proposal.valid_from) throw new StrategyError('invalid_input', 'valid_until must be after valid_from.')
  if (proposal.review_due_at > proposal.valid_until) throw new StrategyError('invalid_input', 'review_due_at must not be after valid_until.')
  if (!alternatives.some((alt) => alt.assessment === 'chosen') && alternatives.length > 0) throw new StrategyError('invalid_input', 'Mark the alternative that was chosen (assessment: chosen).')
  return proposal
}

function factIdOf(value: unknown, field: string): string {
  if (typeof value !== 'string' || !FACT_ID.test(value) || value.includes('..')) throw new StrategyError('invalid_input', `${field} must be an approved fact id such as business.marketing.objective.`)
  return value
}

/** Short label for the revision: `seo-global-discovery@2`. */
export function revisionLabel(strategyId: string, revision: number): string {
  return `${strategyId}@${revision}`
}
