/**
 * The owner-local bridge from a real brand workspace to the Assurance evaluator (GAP-09).
 *
 * `assess()` is pure and takes frozen inputs. This file builds those inputs from what the brand has
 * already approved, and nothing else:
 *
 * - **Facts** come from `brand/instance/approved-facts.yaml` through `readFacts`, pinned by their
 *   `revision_hash`. An answer that is not approved is never treated as approved; its presence
 *   (`draft`, `unknown`, `not_applicable`, `absent`) is read from the answer ledger.
 * - **Evidence** is the brand's internal research notes in the Knowledge Inbox whose `question_ids`
 *   touch the control, pinned by note revision. Restricted notes are never read.
 * - **Conflicts** are the interview's own deterministic contradictions (`findContradictions`), by id.
 * - **Subject** fields come from approved facts and `brand.config.yaml`. Whether the brand runs paid
 *   media is the interview question `business.marketing.paid_media`. The old `--paid-media` statement is
 *   a deprecated fallback, used only while that question has no approved answer.
 * - **Company or person** comes from `brand.profile` only. A person-centred brand is the
 *   `personal-brand` profile. Turning on the personal module for a company brand (a founder's personal
 *   brand) never makes the company a person: it is recorded separately in `personal_brand`, outside the
 *   assessed subject.
 *
 * Rules this bridge keeps:
 *
 * 1. **Owner-local.** Refused while `BRAND_OS_AGENT_TOKEN` is set. No MCP tool, `brand_retrieve` kind,
 *    Studio route or agent profile reaches it.
 * 2. **Read-only.** It writes no file, cache or lock anywhere.
 * 3. **No values out.** The snapshot carries ids, revisions, states and closed-vocabulary subject
 *    values. A restricted fact below the `restricted` audience is not even pinned (`revision: withheld`).
 * 4. **Reproducible.** The digest is `sourceSnapshotDigest()` of the built input: the same workspace
 *    state, clock and options give the same digest, regardless of file order.
 * 5. **No score on an incomplete snapshot.** Everything that would make `assess()` refuse a ratio is
 *    listed as `blocking`; facts that are simply not approved are listed as `gaps`. The bridge never
 *    fills, guesses or pads an input to reach a score.
 * 6. **No certification.** The result is an internal assessment against Brand OS's own method. It is
 *    not a certification, a compliance statement or an independent audit, and `authorizes` is empty.
 */

import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import type { Audience } from '../auth.js'
import { latestAnswers } from '../completeness.js'
import { personalConfig } from '../conditions.js'
import { findContradictions } from '../contradictions.js'
import { InterviewEngine } from '../engine.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import { scanAll } from '../knowledge/store.js'
import { openWorkspace, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { canonicalJson, type EvidenceRef, type FactRef } from '../strategy/model.js'
import { evidenceState, factState, type RefState } from '../strategy/store.js'
import type { AnswerRecord, FieldQuestion } from '../types.js'
import { assess, sourceSnapshotDigest, type AssessmentInput, type AuditAssessment, type ControlInput, type FactPresence, type ResolvedEvidence, type ResolvedFact } from './assess.js'
import { applicabilityOf, controlsForMethod, DEFAULT_CATALOG, type AssessableControl, type AssessmentSubject, type SubjectField } from './controls.js'
import { methodById, POSITIONING_READINESS } from './registry.js'

export const SNAPSHOT_SCHEMA = 'brand-os.assurance-snapshot/1'
/** Version of the mapping from a workspace to assessment inputs. A changed mapping is a visible change. */
export const BRIDGE_VERSION = 'brand-os.assurance-bridge/2'
/** The revision written for a restricted fact the audience may not see. Never a hash of anything. */
export const WITHHELD_REVISION = 'withheld'
/** Bound on a `--pin` / `verify` snapshot file, so a hostile file cannot exhaust memory. */
export const MAX_SNAPSHOT_BYTES = 1024 * 1024

const AUDIENCE_RANK: Record<Audience, number> = { public: 0, internal: 1, restricted: 2 }

export class AssuranceBridgeError extends Error {
  constructor(
    readonly code: 'refused' | 'not_a_brand' | 'invalid_input' | 'invalid_pin',
    message: string,
  ) {
    super(message)
    this.name = 'AssuranceBridgeError'
  }
}

/** Owner-local: an agent process never reaches the bridge. Same rule as the Strategic Coach. */
export function assertOwnerAssurance(env: NodeJS.ProcessEnv = process.env): void {
  if (env[AGENT_TOKEN_ENV]) {
    throw new AssuranceBridgeError('refused', `Assurance on a real brand is the owner's local review. Refusing while ${AGENT_TOKEN_ENV} is set; no agent profile covers it.`)
  }
}

// ---- options and output -------------------------------------------------------------------------

export type PaidMediaStatement = 'yes' | 'no' | 'unknown'

/** Revisions a previous snapshot cited. Re-checked against the workspace now: current, changed or missing. */
export interface SnapshotPins {
  facts: FactRef[]
  /** Research notes by the control that cited them, so a note deleted since is still reported, as missing. */
  evidence: Array<EvidenceRef & { control_id: string }>
}

export interface BridgeOptions {
  /** The clock, injected. Required: a snapshot without a fixed clock is not reproducible. */
  asOf: Date
  audience?: Audience
  /**
   * Deprecated: the old `--paid-media` statement. The answer now comes from the approved interview
   * question `business.marketing.paid_media`; this is only a fallback while that has no approved answer.
   */
  paidMedia?: PaidMediaStatement
  pins?: SnapshotPins | null
  method_id?: string
}

export type SubjectSource = 'approved_fact' | 'brand_config' | 'owner_flag' | 'none'

export interface SubjectProvenance {
  field: SubjectField
  value: string
  source: SubjectSource
  /** The approved fact the value came from, by id and revision. Never the fact's value. */
  question_id: string | null
}

export const MISSING_KINDS = ['subject_field', 'fact', 'evidence', 'reviewer_judgment', 'changed_source'] as const
export type MissingKind = (typeof MISSING_KINDS)[number]

export interface MissingItem {
  kind: MissingKind
  /** True when this item alone keeps `assess()` from giving a completeness ratio. */
  blocking: boolean
  control_id: string | null
  /** A subject field, for `subject_field`. */
  field: SubjectField | null
  /** Existing question ids that would close the item. Nothing is invented. */
  question_ids: string[]
  /** For `fact`: how the answer stands now. Never its value. */
  presence: FactPresence | null
  /** For `subject_field` with no canonical question: the command-line statement that sets it. */
  flag: string | null
}

/** The question that states whether the brand runs paid media. */
export const PAID_MEDIA_QUESTION = 'business.marketing.paid_media'

/**
 * A founder's (or any person's) personal brand inside a company brand repository. Tracked beside the
 * company, never folded into it: it does not change `subject.entity_kind` and is not part of the digest.
 */
export interface PersonalBrandRecord {
  /** `modules.personal.enabled` in brand.config.yaml. */
  enabled: boolean
  /** The selected facets, sorted. Facet ids only. */
  facets: string[]
  /** `person` only for the `personal-brand` profile, where the brand is the person; else `company`. */
  brand_entity_kind: 'company' | 'person'
  /** Always false: the personal module never changes what the brand is. */
  changes_subject: false
}

export interface AssuranceSnapshot {
  schema: typeof SNAPSHOT_SCHEMA
  bridge_version: typeof BRIDGE_VERSION
  brand_id: string
  method_id: string
  as_of: string
  audience: Audience
  /** The deprecated `--paid-media` statement as given (`unknown` when not given). The subject uses the approved answer first. */
  paid_media_statement: PaidMediaStatement
  subject: AssessmentSubject
  subject_provenance: SubjectProvenance[]
  controls: ControlInput[]
  /** The personal module, kept separate from the assessed subject. */
  personal_brand: PersonalBrandRecord
  /** `sourceSnapshotDigest()` of exactly these inputs. Same workspace state + same options = same digest. */
  source_snapshot_digest: string
  /** True only when nothing is missing at all. */
  complete: boolean
  /** True when no blocking item is listed, so `assess()` can give a ratio. */
  scoreable: boolean
  missing: MissingItem[]
  authorizes: []
  disclaimer: 'internal_assessment_not_certification'
}

export interface BridgeResult {
  snapshot: AssuranceSnapshot
  assessment: AuditAssessment
  authorizes: []
}

// ---- reading the workspace ----------------------------------------------------------------------

interface Workspace {
  root: string
  brandId: string
  ws: KnowledgeWorkspace
  /** `brand.profile: personal-brand`: the brand itself is a person. */
  personProfile: boolean
  personal: { enabled: boolean; facets: string[] }
  mascot: boolean
  gamification: boolean
  questions: Map<string, FieldQuestion>
  facts: Record<string, CanonicalFact>
  answers: Map<string, AnswerRecord>
  contradictions: Array<{ id: string; fields: string[] }>
  notes: Array<{ id: string; revision: string; question_ids: string[] }>
}

function openBrand(root: string): Workspace {
  let ws: KnowledgeWorkspace
  try {
    ws = openWorkspace(root)
  } catch {
    throw new AssuranceBridgeError('not_a_brand', 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing or has no slug). Run the command from the brand repository root.')
  }
  const engine = new InterviewEngine(ws.root)
  const config = engine.config()
  const questionList = engine.questions()
  const questions = new Map(questionList.map((question) => [question.id, question]))
  let records: AnswerRecord[] = []
  try {
    records = engine.ledger().records ?? []
  } catch {
    records = []
  }
  const answers = latestAnswers(records)
  const mascot = config.modules?.mascot?.enabled === true
  const gamification = config.modules?.gamification?.enabled === true
  // The interview's own rules, called purely. Ids and field lists only; the message is never kept.
  const contradictions = findContradictions(questionList, answers, mascot, gamification)
    .filter((entry) => entry.status === 'open')
    .map((entry) => ({ id: entry.id, fields: [...entry.fields] }))
  // Only shared and local scopes: restricted notes are never decrypted or read here.
  const notes = scanAll(ws, ['local', 'shared'])
    .notes.filter((loaded) => {
      const meta = loaded.note.meta
      return meta.kind === 'research' && meta.classification === 'internal' && meta.status !== 'archived' && meta.brand_slug === ws.brandSlug
    })
    .map((loaded) => ({ id: loaded.id, revision: loaded.revision, question_ids: [...loaded.note.meta.question_ids] }))
  return {
    root: ws.root,
    brandId: ws.brandSlug,
    ws,
    personProfile: config.brand?.profile === 'personal-brand',
    personal: { enabled: personalConfig(config).enabled === true, facets: [...personalConfig(config).facets].sort() },
    mascot,
    gamification,
    questions,
    facts: readFacts(ws.root, 'approved', ws.brandSlug),
    answers,
    contradictions,
    notes,
  }
}

function approvedFact(w: Workspace, id: string): CanonicalFact | null {
  const fact = w.facts[id]
  if (!fact || fact.status !== 'approved' || fact.brand_id !== w.brandId || !fact.revision_hash) return null
  return fact
}

/** An approved single-choice value, only for internal enum questions the subject is derived from. */
function approvedChoice(w: Workspace, id: string): string | null {
  const fact = approvedFact(w, id)
  if (!fact || fact.classification === 'restricted') return null
  return typeof fact.value === 'string' ? fact.value : null
}

// ---- subject ------------------------------------------------------------------------------------

function deriveSubject(w: Workspace, paidMedia: PaidMediaStatement): { subject: AssessmentSubject; provenance: SubjectProvenance[] } {
  const provenance: SubjectProvenance[] = []

  // Only the profile says the brand is a person. The personal module on a company brand is the
  // founder's own brand, tracked in `personal_brand`; it never turns the company into a person.
  const entity: AssessmentSubject['entity_kind'] = w.personProfile ? 'person' : 'company'
  provenance.push({ field: 'entity_kind', value: entity, source: 'brand_config', question_id: null })

  let sells: AssessmentSubject['sells'] = 'unknown'
  const motion = approvedChoice(w, 'business.sales.motion')
  if (motion === 'not-applicable') sells = 'no'
  else if (motion && motion !== 'undecided') sells = 'yes'
  provenance.push({ field: 'sells', value: sells, source: sells === 'unknown' ? 'none' : 'approved_fact', question_id: sells === 'unknown' ? null : 'business.sales.motion' })

  let stage: AssessmentSubject['stage'] = 'unknown'
  let stageSource: string | null = null
  const current = approvedChoice(w, 'business.stage.current')
  if (current === 'established') [stage, stageSource] = ['established', 'business.stage.current']
  else if (current === 'idea' || current === 'pre-revenue') [stage, stageSource] = ['new', 'business.stage.current']
  else {
    const newOrExisting = approvedChoice(w, 'business.identity.new_or_existing')
    if (newOrExisting === 'new') [stage, stageSource] = ['new', 'business.identity.new_or_existing']
    else if (newOrExisting === 'existing') [stage, stageSource] = ['established', 'business.identity.new_or_existing']
  }
  provenance.push({ field: 'stage', value: stage, source: stageSource ? 'approved_fact' : 'none', question_id: stageSource })

  // The approved interview answer wins. The deprecated statement only fills a gap the interview left.
  let runsPaid: PaidMediaStatement = 'unknown'
  const answered = approvedChoice(w, PAID_MEDIA_QUESTION)
  if (answered === 'yes' || answered === 'no') {
    runsPaid = answered
    provenance.push({ field: 'runs_paid_media', value: runsPaid, source: 'approved_fact', question_id: PAID_MEDIA_QUESTION })
  } else {
    runsPaid = paidMedia
    provenance.push({ field: 'runs_paid_media', value: runsPaid, source: runsPaid === 'unknown' ? 'none' : 'owner_flag', question_id: null })
  }

  return { subject: { entity_kind: entity, sells, stage, runs_paid_media: runsPaid }, provenance }
}

/** Which existing questions would settle a subject field, so a missing item points somewhere real. */
const SUBJECT_QUESTIONS: Record<SubjectField, { question_ids: string[]; flag: string | null }> = {
  entity_kind: { question_ids: [], flag: null },
  sells: { question_ids: ['business.sales.motion'], flag: null },
  stage: { question_ids: ['business.stage.current'], flag: null },
  runs_paid_media: { question_ids: [PAID_MEDIA_QUESTION], flag: null },
}

// ---- controls -----------------------------------------------------------------------------------

function presenceOf(answer: AnswerRecord | undefined): FactPresence {
  if (!answer) return 'absent'
  if (answer.status === 'unknown') return 'unknown'
  if (answer.status === 'not_applicable') return 'not_applicable'
  if (answer.status === 'draft' || answer.status === 'in_review' || answer.status === 'approved') return 'draft'
  return 'absent'
}

function classificationOf(w: Workspace, id: string, fact: CanonicalFact | null): ResolvedFact['classification'] {
  const sensitivity = w.questions.get(id)?.sensitivity
  if (sensitivity === 'restricted' || fact?.classification === 'restricted') return 'restricted'
  if (fact?.classification === 'public' && sensitivity !== 'internal') return 'public'
  return 'internal'
}

function resolveFact(w: Workspace, id: string, audience: Audience, pins: Map<string, string>): ResolvedFact {
  const fact = approvedFact(w, id)
  const classification = classificationOf(w, id, fact)
  // Below the restricted audience a restricted fact is not pinned: not its revision, not its presence.
  if (classification === 'restricted' && AUDIENCE_RANK[audience] < AUDIENCE_RANK.restricted) {
    return { ref: { id, revision: WITHHELD_REVISION }, state: 'current', presence: 'approved', classification }
  }
  const pinned = pins.get(id)
  if (pinned !== undefined) {
    // A previous snapshot cited this revision: is it still the approved one?
    const state: RefState = factState(w.ws, { id, revision: pinned }, w.facts)
    return { ref: { id, revision: pinned }, state, presence: state === 'missing' ? presenceOf(w.answers.get(id)) : 'approved', classification }
  }
  if (fact) return { ref: { id, revision: fact.revision_hash! }, state: 'current', presence: 'approved', classification }
  const answer = w.answers.get(id)
  const presence = presenceOf(answer)
  // An answer that exists but is not approved is current as an answer: the engine then names why it is
  // not usable (`owner_said_unknown`, `fact_not_approved`, ...). Its answer id stands in for a revision.
  if (answer && presence !== 'absent') return { ref: { id, revision: `answer:${answer.answer_id}` }, state: 'current', presence, classification }
  return { ref: { id, revision: '' }, state: 'missing', presence: 'absent', classification }
}

function resolveEvidence(w: Workspace, control: AssessableControl, pins: Map<string, Map<string, string>>): ResolvedEvidence[] {
  if (!control.required_evidence) return []
  const ids = new Set([...control.required_question_ids, ...control.related_question_ids])
  const pinned = pins.get(control.control_id) ?? new Map<string, string>()
  const out = new Map<string, ResolvedEvidence>()
  const add = (noteId: string, revision: string, isPinned: boolean) => {
    const ref: EvidenceRef = { ref: `knowledge:${noteId}@${revision}`, note_id: noteId, revision }
    // Knowledge notes carry no independent verification, so every note counts as owner-stated here.
    out.set(noteId, { ref, state: isPinned ? evidenceState(w.ws, ref) : 'current', independence: 'owner_stated' })
  }
  for (const note of w.notes.filter((entry) => entry.question_ids.some((id) => ids.has(id)))) add(note.id, pinned.get(note.id) ?? note.revision, pinned.has(note.id))
  // A note the previous snapshot cited and that is gone (archived, deleted, retagged) stays visible.
  for (const [noteId, revision] of pinned) if (!out.has(noteId)) add(noteId, revision, true)
  return [...out.values()].sort((a, b) => (a.ref.note_id < b.ref.note_id ? -1 : 1))
}

function controlInput(w: Workspace, control: AssessableControl, audience: Audience, factPins: Map<string, string>, notePins: Map<string, Map<string, string>>): ControlInput {
  const touched = new Set([...control.required_question_ids, ...control.related_question_ids])
  return {
    control_id: control.control_id,
    facts: control.required_question_ids.map((id) => resolveFact(w, id, audience, factPins)),
    evidence: resolveEvidence(w, control, notePins),
    conflicts: w.contradictions
      .filter((entry) => entry.fields.some((field) => touched.has(field)))
      .map((entry) => entry.id)
      .sort(),
    // No review store exists yet: a judgment control stays `needs_review` and is listed as blocking.
    review: null,
    maturity: null,
  }
}

// ---- what is missing ----------------------------------------------------------------------------

function item(kind: MissingKind, blocking: boolean, fields: Partial<Omit<MissingItem, 'kind' | 'blocking'>>): MissingItem {
  return { kind, blocking, control_id: null, field: null, question_ids: [], presence: null, flag: null, ...fields }
}

function missingOf(controls: AssessableControl[], inputs: ControlInput[], subject: AssessmentSubject, audience: Audience): MissingItem[] {
  const out: MissingItem[] = []
  const unknownFields = new Set<SubjectField>()
  const byId = new Map(inputs.map((input) => [input.control_id, input]))

  for (const control of controls) {
    const applicability = applicabilityOf(control.applicability, subject)
    if (applicability === 'not_applicable') continue
    if (applicability === 'unknown') {
      for (const condition of control.applicability.conditions) if (subject[condition.field] === 'unknown') unknownFields.add(condition.field)
      continue
    }
    const input = byId.get(control.control_id)
    if (!input) continue
    // Withheld controls stay silent, as in the engine: not even which question is open.
    const restricted = control.privacy_classification === 'restricted' || input.facts.some((fact) => fact.classification === 'restricted')
    if (restricted && AUDIENCE_RANK[audience] < AUDIENCE_RANK.restricted) continue

    const changed = [
      ...input.facts.filter((fact) => fact.state === 'changed').map((fact) => fact.ref.id),
      ...input.evidence.filter((note) => note.state === 'changed').map((note) => note.ref.note_id),
    ]
    if (changed.length > 0) out.push(item('changed_source', true, { control_id: control.control_id, question_ids: input.facts.filter((fact) => fact.state === 'changed').map((fact) => fact.ref.id).sort() }))

    for (const fact of input.facts) {
      if (fact.presence === 'approved' && fact.state === 'current') continue
      if (fact.state === 'changed') continue
      out.push(item('fact', false, { control_id: control.control_id, question_ids: [fact.ref.id], presence: fact.presence }))
    }
    if (control.required_evidence && !input.evidence.some((note) => note.state === 'current')) {
      out.push(item('evidence', false, { control_id: control.control_id, question_ids: [...control.related_question_ids, ...control.required_question_ids].sort() }))
    }
    // Same order as the engine: a changed source or a recorded conflict is reported before any judgment is asked for.
    if (control.evaluation_mode === 'reviewer_judgment' && !input.review && changed.length === 0 && input.conflicts.length === 0) {
      out.push(item('reviewer_judgment', true, { control_id: control.control_id }))
    }
  }

  for (const field of [...unknownFields].sort()) {
    const where = SUBJECT_QUESTIONS[field]
    out.push(item('subject_field', true, { field, question_ids: where.question_ids, flag: where.flag }))
  }
  const order = (entry: MissingItem) => `${entry.blocking ? 0 : 1}\u0000${MISSING_KINDS.indexOf(entry.kind)}\u0000${entry.control_id ?? ''}\u0000${entry.field ?? ''}\u0000${entry.question_ids.join(',')}`
  return out.sort((a, b) => (order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0))
}

// ---- the bridge ---------------------------------------------------------------------------------

/** Only approved revisions are pins. A withheld, unanswered or draft entry is re-read as it is now. */
function isApprovedPin(revision: string): boolean {
  return revision !== '' && revision !== WITHHELD_REVISION && !revision.startsWith('answer:')
}

function pinMaps(pins: SnapshotPins | null | undefined): { facts: Map<string, string>; notes: Map<string, Map<string, string>> } {
  const notes = new Map<string, Map<string, string>>()
  for (const ref of pins?.evidence ?? []) {
    const forControl = notes.get(ref.control_id) ?? new Map<string, string>()
    forControl.set(ref.note_id, ref.revision)
    notes.set(ref.control_id, forControl)
  }
  return {
    facts: new Map((pins?.facts ?? []).filter((ref) => isApprovedPin(ref.revision)).map((ref) => [ref.id, ref.revision])),
    notes,
  }
}

/**
 * Build the snapshot for one brand. Reads the workspace, writes nothing, and refuses an agent process.
 */
export function buildAssuranceSnapshot(root: string, options: BridgeOptions): AssuranceSnapshot {
  assertOwnerAssurance()
  if (!(options.asOf instanceof Date) || Number.isNaN(options.asOf.getTime())) throw new AssuranceBridgeError('invalid_input', 'as_of must be a valid date.')
  const audience = options.audience ?? 'internal'
  if (!(audience in AUDIENCE_RANK)) throw new AssuranceBridgeError('invalid_input', 'audience must be public, internal or restricted.')
  const paidMedia = options.paidMedia ?? 'unknown'
  if (!['yes', 'no', 'unknown'].includes(paidMedia)) throw new AssuranceBridgeError('invalid_input', 'paid media must be yes, no or unknown.')
  const methodId = options.method_id ?? POSITIONING_READINESS.method_id
  const method = methodById(methodId)
  if (!method) throw new AssuranceBridgeError('invalid_input', `No method ${methodId} in the registry.`)

  const w = openBrand(root)
  const { subject, provenance } = deriveSubject(w, paidMedia)
  const controls = [...controlsForMethod(method.method_id, DEFAULT_CATALOG)].sort((a, b) => (a.control_id < b.control_id ? -1 : 1))
  const pins = pinMaps(options.pins)
  const inputs = controls.map((control) => controlInput(w, control, audience, pins.facts, pins.notes))
  const input: AssessmentInput = { brand_id: w.brandId, method_id: method.method_id, subject, audience, as_of: options.asOf, controls: inputs }
  const missing = missingOf(controls, inputs, subject, audience)

  return {
    schema: SNAPSHOT_SCHEMA,
    bridge_version: BRIDGE_VERSION,
    brand_id: w.brandId,
    method_id: method.method_id,
    as_of: options.asOf.toISOString(),
    audience,
    paid_media_statement: paidMedia,
    subject,
    subject_provenance: provenance,
    controls: inputs,
    personal_brand: { enabled: w.personal.enabled, facets: w.personal.facets, brand_entity_kind: subject.entity_kind === 'person' ? 'person' : 'company', changes_subject: false },
    source_snapshot_digest: sourceSnapshotDigest(input),
    complete: missing.length === 0,
    scoreable: !missing.some((entry) => entry.blocking),
    missing,
    authorizes: [],
    disclaimer: 'internal_assessment_not_certification',
  }
}

/** The frozen engine input a snapshot stands for. */
export function snapshotInput(snapshot: AssuranceSnapshot): AssessmentInput {
  return {
    brand_id: snapshot.brand_id,
    method_id: snapshot.method_id,
    subject: snapshot.subject,
    audience: snapshot.audience,
    as_of: new Date(snapshot.as_of),
    controls: snapshot.controls,
  }
}

/** Snapshot plus the existing evaluator's assessment of it. Nothing about the evaluation is redone here. */
export function assessWorkspace(root: string, options: BridgeOptions): BridgeResult {
  const snapshot = buildAssuranceSnapshot(root, options)
  return { snapshot, assessment: assess(snapshotInput(snapshot)), authorizes: [] }
}

// ---- reading a previous snapshot ----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const PIN_ID = /^[A-Za-z0-9_.:-]{1,200}$/

/**
 * Parses a snapshot file the owner kept, as data. Only ids, revisions and the options are taken from it;
 * anything else in the file is ignored. A malformed file is refused without echoing its content.
 */
export function parseSnapshotFile(text: string): { brand_id: string; method_id: string; as_of: Date; audience: Audience; paid_media: PaidMediaStatement; digest: string; pins: SnapshotPins } {
  if (text.length > MAX_SNAPSHOT_BYTES) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is too large.')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is not JSON.')
  }
  // `brand:assurance assess --json` wraps the snapshot; accept both shapes.
  const doc = isRecord(raw) && isRecord(raw.snapshot) ? raw.snapshot : raw
  if (!isRecord(doc) || doc.schema !== SNAPSHOT_SCHEMA) throw new AssuranceBridgeError('invalid_pin', `The file is not a ${SNAPSHOT_SCHEMA} snapshot.`)
  const asOf = new Date(String(doc.as_of))
  const audience = doc.audience
  const paid = doc.paid_media_statement
  if (typeof doc.brand_id !== 'string' || typeof doc.method_id !== 'string' || typeof doc.source_snapshot_digest !== 'string' || Number.isNaN(asOf.getTime())) {
    throw new AssuranceBridgeError('invalid_pin', 'The snapshot file is missing its brand, method, digest or date.')
  }
  if (audience !== 'public' && audience !== 'internal' && audience !== 'restricted') throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no valid audience.')
  if (paid !== 'yes' && paid !== 'no' && paid !== 'unknown') throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no valid paid-media statement.')
  if (!Array.isArray(doc.controls)) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file has no controls.')
  const facts: FactRef[] = []
  const evidence: SnapshotPins['evidence'] = []
  for (const control of doc.controls) {
    if (!isRecord(control) || typeof control.control_id !== 'string' || !PIN_ID.test(control.control_id)) throw new AssuranceBridgeError('invalid_pin', 'A control in the snapshot file is malformed.')
    for (const fact of Array.isArray(control.facts) ? control.facts : []) {
      const ref = isRecord(fact) && isRecord(fact.ref) ? fact.ref : null
      if (!ref || typeof ref.id !== 'string' || typeof ref.revision !== 'string' || !PIN_ID.test(ref.id) || ref.revision.length > 200) throw new AssuranceBridgeError('invalid_pin', 'A fact reference in the snapshot file is malformed.')
      facts.push({ id: ref.id, revision: ref.revision })
    }
    for (const note of Array.isArray(control.evidence) ? control.evidence : []) {
      const ref = isRecord(note) && isRecord(note.ref) ? note.ref : null
      if (!ref || typeof ref.note_id !== 'string' || typeof ref.revision !== 'string' || !PIN_ID.test(ref.note_id) || ref.revision.length > 200) throw new AssuranceBridgeError('invalid_pin', 'An evidence reference in the snapshot file is malformed.')
      evidence.push({ ref: `knowledge:${ref.note_id}@${ref.revision}`, note_id: ref.note_id, revision: ref.revision, control_id: control.control_id })
    }
  }
  return { brand_id: doc.brand_id, method_id: doc.method_id, as_of: asOf, audience, paid_media: paid, digest: doc.source_snapshot_digest, pins: { facts, evidence } }
}

export interface VerifyResult {
  reproduced: boolean
  expected_digest: string
  actual_digest: string
  /** Refs whose pinned revision is no longer the approved one, or no longer there. Ids only. */
  changed: Array<{ kind: 'fact' | 'research_note'; id: string; state: RefState }>
  snapshot: AssuranceSnapshot
  authorizes: []
}

/**
 * Rebuild a kept snapshot from the workspace as it is now, with the same clock, audience and statement.
 * `reproduced` is true exactly when nothing it cited has changed.
 */
export function verifyAssuranceSnapshot(root: string, text: string): VerifyResult {
  assertOwnerAssurance()
  const kept = parseSnapshotFile(text)
  const brand = openWorkspace(root).brandSlug
  if (kept.brand_id !== brand) throw new AssuranceBridgeError('invalid_pin', 'The snapshot file belongs to a different brand.')
  // First the snapshot as it would be built today, unpinned, with the kept options.
  const fresh = buildAssuranceSnapshot(root, { asOf: kept.as_of, audience: kept.audience, paidMedia: kept.paid_media, method_id: kept.method_id })
  // Then the kept refs re-checked, so a change is named rather than only detected.
  const pinned = buildAssuranceSnapshot(root, { asOf: kept.as_of, audience: kept.audience, paidMedia: kept.paid_media, method_id: kept.method_id, pins: kept.pins })
  const changed = new Map<string, VerifyResult['changed'][number]>()
  for (const control of pinned.controls) {
    for (const fact of control.facts) if (fact.state !== 'current' && isApprovedPin(fact.ref.revision) && kept.pins.facts.some((ref) => ref.id === fact.ref.id && ref.revision === fact.ref.revision)) changed.set(`fact:${fact.ref.id}`, { kind: 'fact', id: fact.ref.id, state: fact.state })
    for (const note of control.evidence) if (note.state !== 'current') changed.set(`note:${note.ref.note_id}`, { kind: 'research_note', id: note.ref.note_id, state: note.state })
  }
  return {
    reproduced: fresh.source_snapshot_digest === kept.digest,
    expected_digest: kept.digest,
    actual_digest: fresh.source_snapshot_digest,
    changed: [...changed.values()].sort((a, b) => (`${a.kind}:${a.id}` < `${b.kind}:${b.id}` ? -1 : 1)),
    snapshot: pinned,
    authorizes: [],
  }
}

/** Canonical JSON of a snapshot, so two runs can be compared byte for byte. */
export function canonicalSnapshot(snapshot: AssuranceSnapshot): string {
  return canonicalJson(snapshot)
}
