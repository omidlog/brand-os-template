import type { Locale } from '../i18n.js'
import type { FieldQuestion } from '../types.js'
import { answerDigest, coachQuestion, contextDigest, openCoachContext, type CoachContext } from './context.js'
import { answeredIds, consistencyFindings } from './consistency.js'
import { chooseFollowUp } from './follow-up.js'
import { CLARIFY_QUESTIONS, coachText, CRITERION_NAMES, NO_FOLLOW_UP_TEXT } from './i18n.js'
import {
  COACH_ENGINE_VERSION,
  COACH_RULE_VERSION,
  COACH_SCHEMA_VERSION,
  CoachError,
  validateCoachResult,
  type CoachFinding,
  type CoachMode,
  type CoachResult,
  type CoachSeverity,
  type CoachSource,
  type CoachSourceRef,
  type CoachStatus,
} from './model.js'
import { assessAnswer, topFindings, type QualityAssessment, type QualityFinding } from './quality.js'

/**
 * Assembling a `CoachResult`. One shape for all three modes, validated against the contract before it is
 * returned, so a rule that invented a code, a score or a non-empty `authorizes` fails here.
 *
 * Everything is computed on demand: nothing is cached, nothing is written. `answer_ref.digest` and
 * `analysis_scope.context_digest` exist so a future cache (or a Studio projection) can tell current advice
 * from stale advice without storing the owner's words anywhere.
 */

export interface CoachOptions {
  locale?: Locale
  now?: Date
}

const SEVERITY: Record<CoachStatus, CoachSeverity> = {
  ready: 'info',
  not_applicable: 'info',
  insufficient_context: 'info',
  needs_clarification: 'advice',
  evidence_missing: 'attention',
  needs_review: 'attention',
}

const NO_MODEL_NOTE = 'no_model_called: every finding in this result is deterministic'
const ADVISORY_NOTE = 'advisory_only: this result changes no answer, fact, approval, strategy, calendar or asset'
const PR1_CONSISTENCY_NOTE = 'potential_tension and needs_verification are not assessed in this version; silence here does not mean there is no strategic tension'

function findingId(mode: CoachMode, questionId: string | null, answerId: string | null, code: string): string {
  return [mode, questionId ?? 'brand', answerId ?? 'none', code].join(':')
}

function outputsOf(question: FieldQuestion): string[] {
  return [...new Set(question.related_outputs)].sort()
}

function fromQualityFinding(mode: CoachMode, assessment: QualityAssessment, finding: QualityFinding, locale: Locale): CoachFinding {
  const text = coachText(locale, finding.code, finding.vars)
  const outputs = outputsOf(assessment.question)
  return {
    id: findingId(mode, assessment.question.id, assessment.answer?.answer_id ?? null, finding.code),
    type: 'quality',
    code: finding.code,
    status: finding.status,
    severity: SEVERITY[finding.status],
    criterion: finding.criterion,
    verdict: null,
    question_id: assessment.question.id,
    related_question_ids: finding.relatedIds,
    canonical_question_id: null,
    suggested_question: null,
    missing_dimension: finding.criterion,
    improves_outputs: outputs,
    reason: text.reason,
    improvement: text.improvement,
    // An approved fact is not automatically a good answer, but changing one is a human step, never the coach's.
    requires_change_request: assessment.approved && finding.status !== 'ready' && finding.status !== 'not_applicable',
    source_refs: finding.sourceRefs,
    origin: 'deterministic',
  }
}

function shell(ctx: CoachContext, mode: CoachMode, locale: Locale, questionIds: string[]): Omit<CoachResult, 'status' | 'findings' | 'question_id' | 'answer_ref' | 'source_refs' | 'notes'> {
  return {
    schema_version: COACH_SCHEMA_VERSION,
    kind: 'coach_result',
    brand_id: ctx.brandId,
    mode,
    locale,
    analysis_scope: { profile: ctx.profileId, questions: [...questionIds].sort(), context_digest: contextDigest(ctx, COACH_RULE_VERSION, questionIds) },
    generated_at: ctx.now.toISOString(),
    engine_version: COACH_ENGINE_VERSION,
    rule_version: COACH_RULE_VERSION,
    authority: 'derived_advice',
    authorizes: [],
  }
}

function dedupeRefs(refs: CoachSourceRef[]): CoachSourceRef[] {
  const seen = new Map<string, CoachSourceRef>()
  for (const ref of refs) seen.set(`${ref.kind}:${ref.id}:${ref.revision ?? ''}`, ref)
  return [...seen.values()]
}

/** `quality_review` for one question. */
export function qualityReview(ctx: CoachContext, questionId: string, opts: CoachOptions = {}): CoachResult {
  const locale = opts.locale ?? 'en'
  const question = coachQuestion(ctx, questionId)
  const assessment = assessAnswer(ctx, question, locale)
  const reported = topFindings(assessment)
  const findings = reported.map((finding) => fromQualityFinding('quality_review', assessment, finding, locale))
  const notes = [NO_MODEL_NOTE, ADVISORY_NOTE]
  if (assessment.checked.length > 0) notes.push(`criteria_checked: ${assessment.checked.join(', ')}`)
  if (assessment.approved) notes.push('approved_fact: a change needs brand:interview change, brand:review and brand:approve')
  return validateCoachResult({
    ...shell(ctx, 'quality_review', locale, [questionId, ...findings.flatMap((finding) => finding.related_question_ids)]),
    question_id: questionId,
    answer_ref: assessment.answer ? { answer_id: assessment.answer.answer_id, status: assessment.answer.status, digest: answerDigest(assessment.answer) } : null,
    status: assessment.status,
    findings,
    source_refs: dedupeRefs([{ kind: 'profile', id: ctx.profileId }, ...findings.flatMap((finding) => finding.source_refs)]),
    notes,
  })
}

/** `follow_up` for one question: 0 or 1 finding of type `follow_up`. */
export function followUpReview(ctx: CoachContext, questionId: string, opts: CoachOptions = {}): CoachResult {
  const locale = opts.locale ?? 'en'
  const question = coachQuestion(ctx, questionId)
  const choice = chooseFollowUp(ctx, question, locale)
  const answer = choice.assessment.answer
  const outputs = outputsOf(question)
  const criterionName = choice.criterion ? CRITERION_NAMES[locale][choice.criterion] : ''
  const baseRefs: CoachSourceRef[] = [{ kind: 'question', id: question.id }, ...(answer ? [{ kind: 'answer' as const, id: answer.answer_id, revision: answer.answer_id }] : [])]

  let finding: CoachFinding
  if (choice.kind === 'canonical' && choice.canonicalId) {
    const text = coachText(locale, 'follow_up_canonical', { question: question.id, criterion: criterionName, canonical: choice.canonicalId })
    finding = {
      id: findingId('follow_up', question.id, answer?.answer_id ?? null, 'follow_up_canonical'),
      type: 'follow_up',
      code: 'follow_up_canonical',
      status: choice.assessment.status,
      severity: 'advice',
      criterion: choice.criterion,
      verdict: null,
      question_id: question.id,
      related_question_ids: [choice.canonicalId],
      canonical_question_id: choice.canonicalId,
      // Deliberately null: the canonical question owns its own prompt in all three locales.
      suggested_question: null,
      missing_dimension: choice.criterion,
      improves_outputs: outputs,
      reason: text.reason,
      improvement: text.improvement,
      requires_change_request: false,
      source_refs: dedupeRefs([...baseRefs, { kind: 'question', id: choice.canonicalId }, ...(choice.deficit?.sourceRefs ?? [])]),
      origin: 'deterministic',
    }
  } else if (choice.kind === 'clarify' && choice.criterion) {
    const text = coachText(locale, 'follow_up_clarify', { question: question.id, criterion: criterionName, outputs: outputs.join(', ') || question.module })
    finding = {
      id: findingId('follow_up', question.id, answer?.answer_id ?? null, 'follow_up_clarify'),
      type: 'follow_up',
      code: 'follow_up_clarify',
      status: choice.assessment.status,
      severity: 'advice',
      criterion: choice.criterion,
      verdict: null,
      question_id: question.id,
      related_question_ids: [],
      canonical_question_id: null,
      suggested_question: CLARIFY_QUESTIONS[locale][choice.criterion],
      missing_dimension: choice.criterion,
      improves_outputs: outputs,
      reason: text.reason,
      improvement: text.improvement,
      requires_change_request: choice.assessment.approved,
      source_refs: dedupeRefs([...baseRefs, ...(choice.deficit?.sourceRefs ?? [])]),
      origin: 'deterministic',
    }
  } else {
    const why = NO_FOLLOW_UP_TEXT[locale][choice.noneReason ?? 'quality_ready']
    const text = coachText(locale, 'follow_up_none', { question: question.id, why })
    finding = {
      id: findingId('follow_up', question.id, answer?.answer_id ?? null, 'follow_up_none'),
      type: 'follow_up',
      code: 'follow_up_none',
      status: choice.assessment.status,
      severity: 'info',
      criterion: null,
      verdict: null,
      question_id: question.id,
      related_question_ids: [],
      canonical_question_id: null,
      suggested_question: null,
      missing_dimension: null,
      improves_outputs: outputs,
      reason: text.reason,
      improvement: text.improvement,
      requires_change_request: false,
      source_refs: baseRefs,
      origin: 'deterministic',
    }
  }

  return validateCoachResult({
    ...shell(ctx, 'follow_up', locale, [question.id, ...finding.related_question_ids]),
    question_id: question.id,
    answer_ref: answer ? { answer_id: answer.answer_id, status: answer.status, digest: answerDigest(answer) } : null,
    status: choice.assessment.status,
    findings: [finding],
    source_refs: dedupeRefs([{ kind: 'profile', id: ctx.profileId }, ...finding.source_refs]),
    notes: [NO_MODEL_NOTE, ADVISORY_NOTE, `at_most_one_follow_up: ${choice.kind}`],
  })
}

/** `consistency_review` across the brand, or scoped to one question's conflicts when an id is given. */
export function consistencyReview(ctx: CoachContext, questionId: string | null, opts: CoachOptions = {}): CoachResult {
  const locale = opts.locale ?? 'en'
  const question = questionId === null ? null : coachQuestion(ctx, questionId)
  const all = consistencyFindings(ctx)
  const items = question === null ? all : all.filter((item) => item.contradiction.fields.includes(question.id))
  const answered = answeredIds(ctx)

  const findings: CoachFinding[] = items.map((item) => {
    const text = coachText(locale, 'consistency_rule', { rule: item.contradiction.rule, ids: item.relatedIds.join(', ') })
    return {
      id: findingId('consistency_review', question?.id ?? null, null, `consistency_rule:${item.contradiction.id}`),
      type: 'consistency',
      code: 'consistency_rule',
      status: 'needs_review',
      severity: 'attention',
      criterion: 'clarity_coherence',
      verdict: item.verdict,
      question_id: question?.id ?? null,
      related_question_ids: item.relatedIds.filter((id) => ctx.byId.has(id)),
      canonical_question_id: null,
      suggested_question: null,
      missing_dimension: null,
      improves_outputs: [],
      reason: text.reason,
      improvement: text.improvement,
      requires_change_request: item.relatedIds.some((id) => ctx.answers.get(id)?.status === 'approved'),
      source_refs: item.sourceRefs,
      origin: 'deterministic',
    }
  })

  let status: CoachStatus = 'needs_review'
  if (findings.length === 0) {
    status = answered.length === 0 ? 'insufficient_context' : 'ready'
    const text = coachText(locale, 'consistency_none', { count: String(answered.length) })
    findings.push({
      id: findingId('consistency_review', question?.id ?? null, null, 'consistency_none'),
      type: 'consistency',
      code: 'consistency_none',
      status,
      severity: 'info',
      criterion: 'clarity_coherence',
      verdict: null,
      question_id: question?.id ?? null,
      related_question_ids: [],
      canonical_question_id: null,
      suggested_question: null,
      missing_dimension: null,
      improves_outputs: [],
      reason: text.reason,
      improvement: text.improvement,
      requires_change_request: false,
      source_refs: [{ kind: 'profile', id: ctx.profileId }],
      origin: 'deterministic',
    })
  }

  return validateCoachResult({
    ...shell(ctx, 'consistency_review', locale, question === null ? answered : [question.id, ...items.flatMap((item) => item.relatedIds)]),
    question_id: question?.id ?? null,
    answer_ref: null,
    status,
    findings,
    source_refs: dedupeRefs([{ kind: 'profile', id: ctx.profileId }, ...findings.flatMap((finding) => finding.source_refs)]),
    notes: [NO_MODEL_NOTE, ADVISORY_NOTE, PR1_CONSISTENCY_NOTE, 'rules_source: findContradictions (packages/brand-core/src/contradictions.ts), reported unchanged'],
  })
}

/**
 * The one entry point the CLI uses. `follow_up` and `quality_review` need a question id;
 * `consistency_review` takes one optionally and otherwise reviews the whole brand.
 */
export function coachAnalyze(source: CoachSource, input: { mode: CoachMode; questionId?: string | null } & CoachOptions): CoachResult {
  const ctx = openCoachContext(source, { now: input.now })
  if (input.mode === 'consistency_review') return consistencyReview(ctx, input.questionId ?? null, input)
  const questionId = input.questionId ?? null
  if (!questionId) throw new CoachError('invalid_input', `${input.mode} needs a question id: pass --question <id>. Canonical ids come from brand/interview/field-registry.yaml or npm run brand:next.`)
  return input.mode === 'quality_review' ? qualityReview(ctx, questionId, input) : followUpReview(ctx, questionId, input)
}

/**
 * The eligible `next` variant: coach the question the owner answered last in this session. With no
 * answered question yet it returns an `insufficient_context` follow-up result that names what to do, so
 * the command is always safe to run on a fresh brand.
 */
export function coachNext(source: CoachSource, opts: CoachOptions = {}): CoachResult {
  const ctx = openCoachContext(source, { now: opts.now })
  const locale = opts.locale ?? 'en'
  const lastId = ctx.lastAnsweredId
  const question = lastId ? ctx.byId.get(lastId) : undefined
  if (!question || question.sensitivity === 'restricted') {
    const text = coachText(locale, 'answer_missing', { question: lastId ?? 'the interview' })
    return validateCoachResult({
      ...shell(ctx, 'follow_up', locale, []),
      question_id: null,
      answer_ref: null,
      status: 'insufficient_context',
      findings: [
        {
          id: findingId('follow_up', null, null, 'answer_missing'),
          type: 'follow_up',
          code: 'answer_missing',
          status: 'insufficient_context',
          severity: 'info',
          criterion: null,
          verdict: null,
          question_id: null,
          related_question_ids: [],
          canonical_question_id: null,
          suggested_question: null,
          missing_dimension: null,
          improves_outputs: [],
          reason: text.reason,
          improvement: text.improvement,
          requires_change_request: false,
          source_refs: [{ kind: 'profile', id: ctx.profileId }],
          origin: 'deterministic',
        },
      ],
      source_refs: [{ kind: 'profile', id: ctx.profileId }],
      notes: [NO_MODEL_NOTE, ADVISORY_NOTE, 'no_recent_answer: answer a question first, or pass --question <id>'],
    })
  }
  return followUpReview(ctx, question.id, opts)
}
