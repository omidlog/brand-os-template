import fs from 'node:fs'
import path from 'node:path'
import { shouldSkip, type ConditionContext } from './conditions.js'
import { completeness, latestAnswers } from './completeness.js'
import { findContradictions } from './contradictions.js'
import { fieldBlock, renderDraftFile, upsertFieldBlock } from './documents.js'
import { exists, readYaml, writeYaml } from './fsutil.js'
import { t, normalizeCommand, type Locale } from './i18n.js'
import { canApprove } from './permissions.js'
import type {
  AnswerRecord,
  Authority,
  BrandConfig,
  Contradiction,
  FieldQuestion,
  LedgerFile,
  SessionState,
  SourceType,
  Status,
} from './types.js'

export interface StepResult {
  kind: 'recorded' | 'info' | 'exit' | 'error' | 'impact'
  message: string
  questionId?: string
  status?: Status
  impact?: ImpactReport
}

export interface ImpactReport {
  questionId: string
  previous: { value: AnswerRecord['value']; status: Status } | null
  proposedPreview: string
  requiresConfirmation: boolean
  impactedDocuments: string[]
  impactedQuestions: string[]
  approvalsPreserved: boolean
}

export interface InitInput {
  name: string
  slug: string
  industry: string
  sector?: string
  language: string
  languages: string[]
  website?: string | null
  mascot: boolean
  gamification: boolean
  publish: 'public' | 'private'
  profile?: string
}

const CONFIG_BINDINGS: Array<{ id: string; assign: (config: BrandConfig, value: string) => void }> = [
  {
    id: 'brand.mascot.enabled',
    assign: (config, value) => {
      config.modules.mascot.enabled = value === 'yes'
    },
  },
  {
    id: 'brand.gamification.enabled',
    assign: (config, value) => {
      config.modules.gamification.enabled = value === 'yes'
    },
  },
  {
    id: 'business.identity.sector',
    assign: (config, value) => {
      config.brand.sector = value
    },
  },
  {
    id: 'business.identity.trade_name',
    assign: (config, value) => {
      config.brand.working_name = value
      config.brand.working_name_status = 'draft'
    },
  },
  {
    id: 'business.stage.current',
    assign: (config, value) => {
      config.brand.stage = value
    },
  },
  {
    id: 'business.identity.new_or_existing',
    assign: (config, value) => {
      config.brand.new_or_existing = value
    },
  },
]

function priorityRank(question: FieldQuestion, sector: string | null): number {
  const base = { critical: 0, high: 1, medium: 2, low: 3 }[question.priority]
  if (sector && question.sector_hints.includes(sector)) return base - 0.5
  return base
}

export class InterviewEngine {
  private cachedQuestions: FieldQuestion[] | null = null

  constructor(
    private readonly root: string,
    private readonly opts: { now?: () => Date } = {},
  ) {}

  private now(): string {
    return (this.opts.now ?? (() => new Date()))().toISOString()
  }

  private file(...parts: string[]): string {
    return path.join(this.root, ...parts)
  }

  questions(): FieldQuestion[] {
    if (this.cachedQuestions) return this.cachedQuestions
    const dir = this.file('brand', 'interview', 'question-bank')
    if (!exists(dir)) return []
    const questions: FieldQuestion[] = []
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.yaml'))) {
      const doc = readYaml<{ questions: FieldQuestion[] }>(path.join(dir, name))
      questions.push(...doc.questions)
    }
    this.cachedQuestions = questions.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    return this.cachedQuestions
  }

  question(id: string): FieldQuestion | undefined {
    return this.questions().find((item) => item.id === id)
  }

  config(): BrandConfig {
    return readYaml<BrandConfig>(this.file('brand', 'brand.config.yaml'))
  }

  private saveConfig(config: BrandConfig): void {
    writeYaml(this.file('brand', 'brand.config.yaml'), config)
  }

  ledger(): LedgerFile {
    return readYaml<LedgerFile>(this.file('brand', 'interview', 'answer-ledger.yaml'))
  }

  session(): SessionState {
    return readYaml<SessionState>(this.file('brand', 'interview', 'session-state.yaml'))
  }

  private saveSession(session: SessionState): void {
    session.updated_at = this.now()
    writeYaml(this.file('brand', 'interview', 'session-state.yaml'), session)
  }

  private context(): ConditionContext {
    return { config: this.config(), answers: latestAnswers(this.ledger().records) }
  }

  private depsSatisfied(question: FieldQuestion, ctx: ConditionContext): boolean {
    const byId = new Map(this.questions().map((item) => [item.id, item]))
    return question.depends_on.every((id) => {
      const dependency = byId.get(id)
      if (dependency && shouldSkip(dependency.skip_when, ctx)) return true
      const answer = ctx.answers.get(id)
      return Boolean(answer && answer.status !== 'unanswered')
    })
  }

  eligible(): FieldQuestion[] {
    const ctx = this.context()
    const sectorAnswer = ctx.answers.get('business.identity.sector')
    const sector = sectorAnswer?.value === null || sectorAnswer?.value === undefined ? null : String(sectorAnswer.value)
    return this.questions()
      .filter((question) => {
        if (shouldSkip(question.skip_when, ctx)) return false
        const answer = ctx.answers.get(question.id)
        if (answer && answer.status !== 'unanswered') return false
        return this.depsSatisfied(question, ctx)
      })
      .sort((a, b) => {
        const rank = priorityRank(a, sector) - priorityRank(b, sector)
        if (rank !== 0) return rank
        if (a.order !== b.order) return a.order - b.order
        return a.id.localeCompare(b.id)
      })
  }

  isEligible(id: string): boolean {
    return this.eligible().some((question) => question.id === id)
  }

  current(): FieldQuestion | null {
    const session = this.session()
    if (session.cursor_question_id) {
      return this.question(session.cursor_question_id) ?? null
    }
    const open = this.eligible()
    const deferred = new Set(session.deferred)
    return open.find((question) => !deferred.has(question.id)) ?? open.find((question) => deferred.has(question.id)) ?? null
  }

  queue(limit = 10): FieldQuestion[] {
    const session = this.session()
    const deferred = new Set(session.deferred)
    const open = this.eligible()
    const ordered = [...open.filter((question) => !deferred.has(question.id)), ...open.filter((question) => deferred.has(question.id))]
    return ordered.slice(0, limit)
  }

  private ensureSession(): string {
    const session = this.session()
    if (!session.session_id) {
      session.session_id = 'ses-0001'
      session.status = 'active'
      session.started_at = session.started_at ?? this.now()
      this.saveSession(session)
    } else if (session.status === 'idle' || session.status === 'paused') {
      session.status = 'active'
      this.saveSession(session)
    }
    return session.session_id
  }

  promptText(question: FieldQuestion, locale: Locale = this.session().locale): { text: string; fellBack: boolean } {
    const text = question.prompt[locale]
    if (text && text.trim()) return { text, fellBack: false }
    return { text: question.prompt.en, fellBack: locale !== 'en' }
  }

  submit(rawInput: string, actor = 'owner'): StepResult {
    const raw = normalizeCommand(rawInput).trim()
    const lower = raw.toLowerCase()
    const session = this.session()
    const locale = session.locale

    if (lower === 'help') return { kind: 'info', message: t(locale, 'commands') }
    if (lower === 'exit' || lower === 'quit') {
      session.status = 'paused'
      this.saveSession(session)
      return { kind: 'exit', message: t(locale, 'exit') }
    }
    const lang = lower.match(/^lang\s+(en|fa|tr)$/)
    if (lang) {
      session.locale = lang[1] as Locale
      this.saveSession(session)
      return { kind: 'info', message: `Locale set to ${session.locale}.` }
    }
    if (lower === 'status') return { kind: 'info', message: this.statusText() }
    if (lower === 'review') return { kind: 'info', message: this.reviewText() }
    if (lower === 'go back' || lower === 'back') return this.goBack()

    const change = raw.match(/^(confirm\s+)?change\s+(\S+)\s*:\s*([\s\S]+)$/i)
    if (change) {
      return this.changeAnswer(change[2] ?? '', (change[3] ?? '').trim(), Boolean(change[1]), actor)
    }
    const approve = raw.match(/^approve\s+(\S+)(?:\s+as\s+(\S+))?$/i)
    if (approve) return this.approve(approve[1] ?? '', approve[2] ?? actor)

    const current = this.current()
    if (!current) return { kind: 'info', message: t(locale, 'noMore') }

    if (lower === 'show examples') {
      return {
        kind: 'info',
        questionId: current.id,
        message: `${t(locale, 'examplesTitle')}\n${current.examples.map((example) => `- ${example}`).join('\n')}`,
      }
    }
    if (lower === 'suggest options') {
      const suggestions = current.suggestions?.length ? current.suggestions : current.examples
      session.pending_suggestions = suggestions
      this.saveSession(session)
      return {
        kind: 'info',
        questionId: current.id,
        message: `${t(locale, 'suggestionsTitle')}\n${suggestions.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
      }
    }
    const accept = lower.match(/^accept\s+(\d+)$/)
    if (accept) {
      const index = Number(accept[1]) - 1
      const suggestion = session.pending_suggestions[index]
      if (!suggestion) return { kind: 'error', message: 'No suggestion with that number. Use suggest options first.' }
      return this.record(current, suggestion, {
        sourceType: 'agent_suggestion',
        authority: 'unverified',
        status: 'draft',
        uncertainty: 'Agent suggestion from the question bank. Not a confirmed fact until a person approves it.',
      })
    }

    if (['unknown', "i don't know", 'idk'].includes(lower)) {
      return this.record(current, null, {
        sourceType: 'owner',
        authority: 'unverified',
        status: 'unknown',
        uncertainty: 'Owner does not know. No value was invented.',
        raw,
      })
    }
    if (lower === 'skip') {
      return this.record(current, null, {
        sourceType: 'owner',
        authority: 'unverified',
        status: 'skipped',
        uncertainty: 'Owner skipped. Field stays unresolved.',
        raw,
      })
    }
    if (['not relevant', 'n/a', 'na'].includes(lower)) {
      return this.record(current, null, {
        sourceType: 'owner',
        authority: 'unverified',
        status: 'not_applicable',
        uncertainty: 'Owner marked this question not applicable.',
        raw,
      })
    }
    if (['decide later', 'later'].includes(lower)) {
      if (!session.deferred.includes(current.id)) session.deferred.push(current.id)
      session.history.push(current.id)
      session.cursor_question_id = null
      this.saveSession(session)
      return { kind: 'info', questionId: current.id, message: t(locale, 'later') }
    }

    const estimate = raw.match(/^estimate\s*:\s*([\s\S]+)$/i)
    if (estimate) {
      return this.recordNormalized(current, estimate[1] ?? '', {
        sourceType: 'owner',
        authority: 'estimated',
        status: 'draft',
        uncertainty: 'Owner described this as an estimate.',
        confidence: 0.4,
        raw,
      })
    }
    const imported = raw.match(/^import\s+(approved|existing)\s*:\s*(\S+)$/i)
    if (imported) {
      const kind = (imported[1] ?? '').toLowerCase()
      const url = imported[2] ?? ''
      if (!/^https?:\/\//.test(url)) return { kind: 'error', message: 'Import needs an http(s) URL. The file was not fetched.' }
      return this.record(current, url, {
        sourceType: kind === 'approved' ? 'approved_import' : 'external_cited',
        authority: 'unverified',
        status: 'draft',
        uncertainty: 'Reference recorded. The contents were not fetched or turned into facts.',
        sourceReference: url,
        raw,
      })
    }

    return this.recordNormalized(current, raw, {
      sourceType: 'owner',
      authority: 'confirmed_by_owner',
      status: 'draft',
      uncertainty: null,
      raw,
    })
  }

  private recordNormalized(
    question: FieldQuestion,
    rawValue: string,
    meta: {
      sourceType: SourceType
      authority: Authority
      status: Status
      uncertainty: string | null
      confidence?: number | null
      sourceReference?: string | null
      raw: string
    },
  ): StepResult {
    const normalized = normalizeAnswer(question, rawValue)
    if (!normalized.ok) return { kind: 'error', questionId: question.id, message: normalized.message }
    return this.record(question, normalized.value, { ...meta, raw: meta.raw })
  }

  private record(
    question: FieldQuestion,
    value: string | number | boolean | null,
    meta: {
      sourceType: SourceType
      authority: Authority
      status: Status
      uncertainty: string | null
      confidence?: number | null
      sourceReference?: string | null
      raw?: string
    },
  ): StepResult {
    const latest = this.context().answers.get(question.id)
    if (latest && latest.status === 'approved') {
      const impact = this.impact(question.id, meta.raw ?? String(value ?? ''))
      return {
        kind: 'impact',
        questionId: question.id,
        impact,
        message: `${t(this.session().locale, 'needConfirm')}\n${formatImpact(impact)}`,
      }
    }
    if (latest) this.supersede(latest.answer_id)
    const answer = this.appendAnswer(question, value, meta)
    this.afterWrite(question, answer)
    const locale = this.session().locale
    const message =
      answer.status === 'unknown'
        ? t(locale, 'unknown')
        : answer.status === 'skipped'
          ? t(locale, 'skipped')
          : answer.status === 'not_applicable'
            ? t(locale, 'irrelevant')
            : t(locale, 'recorded', { status: answer.status })
    return { kind: 'recorded', questionId: question.id, status: answer.status, message }
  }

  changeAnswer(questionId: string, rawValue: string, confirm: boolean, _actor = 'owner'): StepResult {
    const question = this.question(questionId)
    if (!question) return { kind: 'error', message: `Unknown question ${questionId}.` }
    const latest = this.context().answers.get(questionId)
    const impact = this.impact(questionId, rawValue)
    if (latest?.status === 'approved' && !confirm) {
      return { kind: 'impact', questionId, impact, message: `${t(this.session().locale, 'needConfirm')}\n${formatImpact(impact)}` }
    }
    const normalized = normalizeAnswer(question, rawValue)
    if (!normalized.ok) return { kind: 'error', questionId, message: normalized.message }
    if (latest) this.supersede(latest.answer_id)
    const answer = this.appendAnswer(question, normalized.value, {
      sourceType: 'owner',
      authority: 'confirmed_by_owner',
      status: 'draft',
      uncertainty: latest?.status === 'approved' ? 'Previous approval withdrawn until this draft is approved again.' : null,
      raw: rawValue,
    })
    if (latest?.status === 'approved') this.withdrawApproval(questionId)
    this.afterWrite(question, answer)
    return {
      kind: 'recorded',
      questionId,
      status: 'draft',
      impact: { ...impact, approvalsPreserved: false, requiresConfirmation: false },
      message: latest?.status === 'approved' ? 'Approval withdrawn. The new value is a draft.' : 'Draft updated.',
    }
  }

  approve(questionId: string, actor: string): StepResult {
    const question = this.question(questionId)
    if (!question) return { kind: 'error', message: `Unknown question ${questionId}.` }
    const locale = this.session().locale
    if (!canApprove(actor, question)) {
      return { kind: 'error', questionId, message: t(locale, 'denied', { actor }) }
    }
    const latest = this.context().answers.get(questionId)
    if (!latest || latest.value === null || ['unknown', 'skipped', 'not_applicable', 'unanswered'].includes(latest.status)) {
      return { kind: 'error', questionId, message: t(locale, 'cannotApprove') }
    }
    this.supersede(latest.answer_id)
    const answer = this.appendAnswer(question, latest.value, {
      sourceType: latest.source_type ?? 'owner',
      authority: latest.authority === 'estimated' ? 'estimated' : 'confirmed_by_owner',
      status: 'approved',
      uncertainty: latest.uncertainty,
      confidence: latest.confidence,
      sourceReference: latest.source_reference,
      raw: latest.raw_answer,
      reviewedBy: actor,
    })
    this.writeApprovedFact(question, answer)
    if (question.id === 'business.identity.trade_name' && typeof answer.value === 'string') {
      const config = this.config()
      config.brand.name = answer.value
      config.brand.name_status = 'approved'
      config.brand.working_name = answer.value
      config.brand.working_name_status = 'approved'
      this.saveConfig(config)
    }
    this.afterWrite(question, answer)
    return { kind: 'recorded', questionId, status: 'approved', message: t(locale, 'approved', { actor }) }
  }

  private impact(questionId: string, proposed: string): ImpactReport {
    const question = this.question(questionId)
    const latest = this.context().answers.get(questionId)
    const related = new Set<string>(question?.related_outputs ?? [])
    const impactedQuestions = new Set<string>()
    for (const other of this.questions()) {
      if (other.depends_on.includes(questionId) || other.related_ids.includes(questionId)) impactedQuestions.add(other.id)
    }
    for (const id of question?.related_ids ?? []) impactedQuestions.add(id)
    return {
      questionId,
      previous: latest ? { value: latest.value, status: latest.status } : null,
      proposedPreview: proposed,
      requiresConfirmation: latest?.status === 'approved',
      impactedDocuments: [...related],
      impactedQuestions: [...impactedQuestions],
      approvalsPreserved: latest?.status === 'approved',
    }
  }

  private supersede(answerId: string): void {
    const ledger = this.ledger()
    const record = ledger.records.find((item) => item.answer_id === answerId && !item.superseded_by)
    if (!record) return
    const next = `ans-${String(ledger.records.length + 1).padStart(4, '0')}`
    record.superseded_by = next
    writeYaml(this.file('brand', 'interview', 'answer-ledger.yaml'), ledger)
  }

  private appendAnswer(
    question: FieldQuestion,
    value: string | number | boolean | null,
    meta: {
      sourceType: SourceType | null
      authority: Authority
      status: Status
      uncertainty: string | null
      confidence?: number | null
      sourceReference?: string | null
      raw?: string | null
      reviewedBy?: string | null
    },
  ): AnswerRecord {
    const ledger = this.ledger()
    const sessionId = this.ensureSession()
    const answer: AnswerRecord = {
      answer_id: `ans-${String(ledger.records.length + 1).padStart(4, '0')}`,
      question_id: question.id,
      value,
      raw_answer: meta.raw ?? (value === null ? null : String(value)),
      source_type: meta.sourceType,
      source_reference: meta.sourceReference ?? null,
      authority: meta.authority,
      confidence: meta.confidence ?? null,
      status: meta.status,
      last_updated: this.now(),
      reviewed_by: meta.reviewedBy ?? null,
      visibility: question.sensitivity,
      uncertainty: meta.uncertainty,
      session_id: sessionId,
      normalized: value,
      superseded_by: null,
      disposition_reason: meta.uncertainty,
    }
    ledger.records.push(answer)
    writeYaml(this.file('brand', 'interview', 'answer-ledger.yaml'), ledger)
    const session = this.session()
    session.last_answer_id = answer.answer_id
    session.cursor_question_id = null
    session.pending_suggestions = []
    session.deferred = session.deferred.filter((id) => id !== question.id)
    session.history.push(question.id)
    session.status = 'active'
    this.saveSession(session)
    return answer
  }

  private afterWrite(question: FieldQuestion, answer: AnswerRecord): void {
    if (answer.value !== null && typeof answer.value !== 'boolean') {
      const binding = CONFIG_BINDINGS.find((item) => item.id === question.id)
      if (binding) {
        const config = this.config()
        binding.assign(config, String(answer.value))
        this.saveConfig(config)
      }
    }
    if (typeof answer.value === 'boolean') {
      const binding = CONFIG_BINDINGS.find((item) => item.id === question.id)
      if (binding) {
        const config = this.config()
        binding.assign(config, answer.value ? 'yes' : 'no')
        this.saveConfig(config)
      }
    }
    if (answer.value !== null && (answer.value === 'yes' || answer.value === 'no')) {
      const binding = CONFIG_BINDINGS.find((item) => item.id === question.id)
      if (binding && question.question_type === 'boolean') {
        const config = this.config()
        binding.assign(config, String(answer.value))
        this.saveConfig(config)
      }
    }
    this.writeFact(question, answer)
    this.writeDocuments(question, answer)
    if (answer.source_reference) this.addEvidence(question, answer)
    this.refreshContradictions()
  }

  private writeFact(question: FieldQuestion, answer: AnswerRecord): void {
    const file = this.file('brand', 'instance', 'draft-facts.yaml')
    const doc = exists(file)
      ? readYaml<{ schema_version: number; facts: Record<string, unknown> }>(file)
      : { schema_version: 1, facts: {} }
    doc.facts[question.id] = {
      value: question.sensitivity === 'restricted' ? '[restricted]' : answer.value,
      stored_in: question.sensitivity === 'restricted' ? 'brand/restricted' : 'brand/instance/draft-facts.yaml',
      status: answer.status,
      visibility: question.sensitivity,
      authority: answer.authority,
      source_type: answer.source_type,
      uncertainty: answer.uncertainty,
      answer_id: answer.answer_id,
      updated: answer.last_updated,
    }
    if (question.sensitivity === 'restricted') {
      const secretFile = this.file('brand', 'restricted', 'facts.yaml')
      const secret = exists(secretFile)
        ? readYaml<{ schema_version: number; facts: Record<string, unknown> }>(secretFile)
        : { schema_version: 1, facts: {} }
      secret.facts[question.id] = {
        value: answer.value,
        status: answer.status,
        visibility: 'restricted',
        answer_id: answer.answer_id,
        updated: answer.last_updated,
      }
      writeYaml(secretFile, secret)
    }
    writeYaml(file, doc)
  }

  private writeApprovedFact(question: FieldQuestion, answer: AnswerRecord): void {
    const file = this.file('brand', 'instance', 'approved-facts.yaml')
    const doc = exists(file)
      ? readYaml<{ schema_version: number; facts: Record<string, unknown> }>(file)
      : { schema_version: 1, facts: {} }
    doc.facts[question.id] = {
      value: question.sensitivity === 'restricted' ? '[restricted]' : answer.value,
      status: 'approved',
      visibility: question.sensitivity,
      authority: answer.authority,
      source_type: answer.source_type,
      approved_by: answer.reviewed_by,
      answer_id: answer.answer_id,
      updated: answer.last_updated,
    }
    writeYaml(file, doc)
  }

  private withdrawApproval(questionId: string): void {
    const file = this.file('brand', 'instance', 'approved-facts.yaml')
    if (!exists(file)) return
    const doc = readYaml<{ schema_version: number; facts: Record<string, unknown> }>(file)
    delete doc.facts[questionId]
    writeYaml(file, doc)
  }

  private writeDocuments(question: FieldQuestion, answer: AnswerRecord): void {
    const targets = question.related_outputs.length ? question.related_outputs : []
    for (const relative of targets) {
      const file = this.resolveOutput(relative)
      upsertFieldBlock(file, question.id, fieldBlock(question, answer, file))
    }
  }

  private addEvidence(question: FieldQuestion, answer: AnswerRecord): void {
    const file = this.file('brand', 'interview', 'evidence-index.yaml')
    const doc = exists(file)
      ? readYaml<{ schema_version: number; items: Array<Record<string, unknown>> }>(file)
      : { schema_version: 1, items: [] }
    doc.items.push({
      answer_id: answer.answer_id,
      question_id: question.id,
      source_reference: answer.source_reference,
      source_type: answer.source_type,
      captured_at: answer.last_updated,
      confidentiality: question.sensitivity,
      review_status: answer.status,
      note: 'Reference only. Contents were not fetched.',
    })
    writeYaml(file, doc)
  }

  private refreshContradictions(): void {
    const config = this.config()
    const items = findContradictions(this.questions(), this.context().answers, config.modules.mascot.enabled, config.modules.gamification.enabled)
    writeYaml(this.file('brand', 'interview', 'contradictions.yaml'), {
      schema_version: 1,
      derived: true,
      scanned_at: this.now(),
      items,
    })
  }

  contradictions(): Contradiction[] {
    const file = this.file('brand', 'interview', 'contradictions.yaml')
    if (!exists(file)) return []
    return readYaml<{ items: Contradiction[] }>(file).items
  }

  private resolveOutput(relative: string): string {
    if (relative.includes('..')) throw new Error(`Unsafe output path: ${relative}`)
    const full = path.resolve(this.root, relative)
    const root = path.resolve(this.root)
    if (full !== root && !full.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe output path: ${relative}`)
    return full
  }

  private goBack(): StepResult {
    const session = this.session()
    const previous = [...session.history].reverse().find((id) => id !== session.cursor_question_id)
    if (!previous) return { kind: 'info', message: 'No earlier question in this session.' }
    session.cursor_question_id = previous
    this.saveSession(session)
    const question = this.question(previous)
    return { kind: 'info', questionId: previous, message: question ? `Back to ${question.id}.` : 'Back.' }
  }

  statusReport() {
    const report = completeness(this.questions(), this.context())
    const next = this.queue(5).map((question) => ({
      id: question.id,
      priority: question.priority,
      prompt: question.prompt.en,
      module: question.module,
    }))
    return { ...report, next, contradictions: this.contradictions().length, session: this.session() }
  }

  statusText(): string {
    const report = this.statusReport()
    const lines = [
      `Coverage (required fields with a disposition): ${(report.coverage * 100).toFixed(1)}%`,
      `Approval (required fields approved): ${(report.approval * 100).toFixed(1)}%`,
      `Required unanswered: ${report.requiredUnanswered} / ${report.required}`,
      `Open contradictions: ${report.contradictions}`,
      'Next questions:',
      ...report.next.map((item) => `- [${item.priority}] ${item.id}`),
    ]
    return lines.join('\n')
  }

  reviewText(revealRestricted = false): string {
    const allow = revealRestricted && process.env.BRAND_OS_ALLOW_RESTRICTED === '1'
    const answers = this.context().answers
    const lines = ['# Review', '', 'Drafts are not canonical until approved. Restricted values are withheld unless a local override is set.', '']
    const modules = [...new Set(this.questions().map((question) => question.module))]
    for (const moduleId of modules) {
      const owned = this.questions().filter((question) => question.module === moduleId)
      const relevant = owned.filter((question) => answers.has(question.id))
      if (relevant.length === 0) continue
      lines.push(`## ${moduleId}`, '')
      for (const question of relevant) {
        const answer = answers.get(question.id)
        if (!answer) continue
        const hidden = question.sensitivity === 'restricted' && !allow
        lines.push(`### ${question.label}`)
        lines.push(`- Status: ${answer.status}`)
        lines.push(`- Authority: ${answer.authority}`)
        lines.push(`- Source: ${answer.source_type ?? 'none'}`)
        lines.push(`- Uncertainty: ${answer.uncertainty ?? 'none'}`)
        lines.push(`- Value: ${hidden ? '[restricted withheld]' : answer.value === null ? 'none' : String(answer.value)}`)
        lines.push('')
      }
    }
    const contradictions = this.contradictions()
    lines.push('## Contradictions', '')
    if (contradictions.length === 0) lines.push('None open.')
    for (const item of contradictions) lines.push(`- (${item.severity}) ${item.message}`)
    return lines.join('\n')
  }

  exportSnapshot(mode: 'full' | 'public' = 'full'): Record<string, unknown> {
    const answers = [...this.context().answers.values()].map((answer) => {
      if (mode === 'public' && answer.visibility !== 'public') {
        return { ...answer, value: null, raw_answer: null, normalized: null, redacted: true }
      }
      return answer
    })
    return {
      exported_at: this.now(),
      mode,
      brand: this.config().brand,
      session: this.session(),
      answers,
      contradictions: this.contradictions(),
      completeness: this.statusReport(),
      next_queue: this.queue(20).map((question) => question.id),
    }
  }

  rebuildDrafts(): void {
    const questions = this.questions()
    const answers = this.context().answers
    const files = new Map<string, FieldQuestion[]>()
    for (const question of questions) {
      for (const output of question.related_outputs) {
        const list = files.get(output) ?? []
        list.push(question)
        files.set(output, list)
      }
    }
    for (const [relative, group] of files) {
      const file = this.resolveOutput(relative)
      const blocks = group.map((question) => ({
        id: question.id,
        inner: fieldBlock(question, answers.get(question.id) ?? null, file),
      }))
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, renderDraftFile(file, blocks))
    }
  }
}

function formatImpact(impact: ImpactReport): string {
  return [
    `Proposed change to ${impact.questionId}`,
    `Previous status: ${impact.previous?.status ?? 'none'}`,
    `Documents: ${impact.impactedDocuments.join(', ') || 'none'}`,
    `Linked questions: ${impact.impactedQuestions.join(', ') || 'none'}`,
    impact.requiresConfirmation ? 'Confirmation required before the approved value changes.' : 'No approval is held on this field.',
  ].join('\n')
}

function normalizeAnswer(
  question: FieldQuestion,
  rawValue: string,
): { ok: true; value: string | number | boolean } | { ok: false; message: string } {
  const value = rawValue.trim()
  if (!value) return { ok: false, message: 'Empty answer. Use unknown, skip, or decide later.' }
  if (question.question_type === 'boolean') {
    const token = value.toLowerCase()
    if (['yes', 'y', 'true', 'بله', 'evet'].includes(token)) return { ok: true, value: 'yes' }
    if (['no', 'n', 'false', 'خیر', 'hayır', 'hayir'].includes(token)) return { ok: true, value: 'no' }
    return { ok: false, message: 'Answer yes or no. Or say unknown.' }
  }
  if (question.question_type === 'single_choice') {
    const match = question.options?.find((option) => option.toLowerCase() === value.toLowerCase())
    if (!match) return { ok: false, message: `Choose one of: ${(question.options ?? []).join(', ')}` }
    return { ok: true, value: match }
  }
  if (question.question_type === 'number') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return { ok: false, message: 'Enter a number, or say unknown.' }
    return { ok: true, value: parsed }
  }
  if (question.question_type === 'url') {
    if (!/^https?:\/\//.test(value)) return { ok: false, message: 'Enter an http(s) URL, or say none is not available for this field — use unknown.' }
    return { ok: true, value }
  }
  if (question.validation?.min_length && value.length < question.validation.min_length) {
    return { ok: false, message: `Answer must be at least ${question.validation.min_length} characters.` }
  }
  return { ok: true, value }
}

export function assertSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Slug "${slug}" must be lowercase letters, numbers, and single hyphens.`)
  }
}

export function applyInit(root: string, input: InitInput): BrandConfig {
  assertSlug(input.slug)
  const engine = new InterviewEngine(root)
  const config = engine.config()
  config.brand.name = input.name
  config.brand.name_status = 'working'
  config.brand.working_name = input.name
  config.brand.working_name_status = 'draft'
  config.brand.slug = input.slug
  config.brand.industry = input.industry
  config.brand.sector = input.sector ?? 'unknown'
  config.brand.website = input.website ?? null
  config.brand.default_locale = input.language
  config.brand.supported_locales = input.languages
  config.brand.profile = input.profile ?? 'universal'
  config.brand.publish_docs = input.publish
  config.brand.stage = 'unknown'
  config.brand.new_or_existing = 'unknown'
  config.brand.legal_name = 'TBD'
  config.brand.tagline = 'TBD'
  config.modules.mascot.enabled = input.mascot
  config.modules.gamification.enabled = input.gamification
  writeYaml(path.join(root, 'brand', 'brand.config.yaml'), config)
  writeYaml(path.join(root, 'brand', 'interview', 'session-state.yaml'), emptySession(input.language))
  writeYaml(path.join(root, 'brand', 'interview', 'answer-ledger.yaml'), { schema_version: 1, records: [] })
  writeYaml(path.join(root, 'brand', 'interview', 'contradictions.yaml'), { schema_version: 1, derived: true, items: [] })
  writeYaml(path.join(root, 'brand', 'interview', 'evidence-index.yaml'), { schema_version: 1, items: [] })
  writeYaml(path.join(root, 'brand', 'instance', 'draft-facts.yaml'), { schema_version: 1, facts: {} })
  writeYaml(path.join(root, 'brand', 'instance', 'approved-facts.yaml'), { schema_version: 1, facts: {} })
  writeYaml(path.join(root, 'brand', 'restricted', 'facts.yaml'), { schema_version: 1, facts: {} })
  new InterviewEngine(root).rebuildDrafts()
  return config
}

export function emptySession(locale: string): SessionState {
  const safe = locale === 'fa' || locale === 'tr' ? locale : 'en'
  return {
    session_id: null,
    status: 'idle',
    locale: safe,
    history: [],
    deferred: [],
    pending_suggestions: [],
    cursor_question_id: null,
    started_at: null,
    updated_at: null,
    last_answer_id: null,
  }
}
