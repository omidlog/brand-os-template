import { appendAccessLog } from '../access-log.js'
import type { AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { KnowledgeError } from '../knowledge/model.js'
import { openWorkspace, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { creativeAccess } from './agent.js'
import {
  asAspects,
  asScopeLevel,
  asSurface,
  CreativeError,
  PREFERENCE_ID,
  validatePreferenceId,
  validateProjectId,
  validateSeries,
  type PreferenceScopeLevel,
  type Surface,
} from './model.js'
import { addVariantAuthorized, assertOwnerProcess, createProjectAuthorized, loadProject, recordFeedbackAuthorized, suggestPreferenceAuthorized } from './store.js'

/**
 * Learn from a correction in one step.
 *
 * When the owner corrects a deliverable (a narration script, a voice-over delivery, an image, a caption), the
 * correction is recorded once and reaches every later piece of the same surface and series:
 *
 * 1. The owner's words, with the before and after text when there is one, become a local Knowledge note
 *    (`brand/.private/knowledge/local`, source kind `agent_capture` or `owner_note`). Nothing is committed, so this
 *    works when git or a cloud-synced checkout is unavailable.
 * 2. A feedback event is added to the series' learning project `learn-<surface>-<series>` (created on first use, one
 *    variant `A` with asset `missing`).
 * 3. A short rule (≤200 characters) is stored as a DRAFT creative preference that asks for series scope.
 *
 * The rule changes nothing until the owner approves it (`brand:approve --all-pending` or `brand:creative approve
 * --scope series`). Once approved, `creative_context`, `visual_dna` and content briefs serve it to every later task of
 * that surface and series. This is the same governance as the rest of creative memory: an agent records and
 * suggests, only the owner approves.
 */

export const LEARN_LIMITS = {
  maxFeedbackChars: 4000,
  maxBeforeAfterChars: 12000,
} as const

export const LEARN_VERDICTS = ['change_request', 'like', 'observation'] as const
export type LearnVerdict = (typeof LEARN_VERDICTS)[number]

export const LEARN_VARIANT = 'A'

export interface LearnInput {
  surface: string
  series: string
  /** The owner's words about the correction, verbatim, any language. */
  feedback: string
  /** What was produced (optional). */
  before?: string | null
  /** What the owner changed it to (optional). */
  after?: string | null
  /** The rule to apply next time, ≤200 characters, in the language later work is written in. */
  rule: string
  /** When the rule applies, ≤300 characters. */
  context?: string | null
  verdict?: string
  keep?: string[]
  avoid?: string[]
  language?: string | null
  /** Default series. */
  scope?: string
  /** An approved cp_… this rule replaces once the owner approves it. */
  supersedes?: string | null
}

export interface LearnResult {
  project_id: string
  project_created: boolean
  feedback_id: string
  note: { id: string; revision: string; scope: string }
  preference: { preference_id: string; state: 'draft'; statement: string; requested_scope: PreferenceScopeLevel; supersedes: string | null }
  next_step: string
  authorizes: []
}

export function learnProjectId(surface: Surface, series: string): string {
  const id = `learn-${surface}-${series}`.slice(0, 40).replace(/-+$/, '')
  return validateProjectId(id)
}

function boundedText(value: unknown, max: number, field: string, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new CreativeError('invalid_input', `${field} is required.`)
    return null
  }
  if (typeof value !== 'string') throw new CreativeError('invalid_input', `${field} must be text.`)
  const text = value.normalize('NFC').replace(/\r\n?/g, '\n').trim()
  if (!text) {
    if (required) throw new CreativeError('invalid_input', `${field} is empty.`)
    return null
  }
  if (text.length > max) throw new CreativeError('invalid_input', `${field} is longer than ${max} characters.`)
  return text
}

function noteBody(feedback: string, before: string | null, after: string | null): string {
  const parts = [feedback]
  if (before) parts.push('', '## Before', '', before)
  if (after) parts.push('', '## After (owner correction)', '', after)
  return parts.join('\n')
}

function asLearnVerdict(value: unknown): LearnVerdict {
  if (value === undefined || value === null) return 'change_request'
  if (typeof value === 'string' && (LEARN_VERDICTS as readonly string[]).includes(value)) return value as LearnVerdict
  throw new CreativeError('invalid_input', `Verdict must be one of ${LEARN_VERDICTS.join(', ')}. A learned correction never rejects a variant.`)
}

function learn(ws: KnowledgeWorkspace, input: LearnInput, sourceKind: 'agent_capture' | 'owner_note', origin: 'owner' | 'agent_capture'): LearnResult {
  const surface = asSurface(input.surface)
  const series = validateSeries(input.series)
  const feedback = boundedText(input.feedback, LEARN_LIMITS.maxFeedbackChars, 'Feedback', true)!
  const before = boundedText(input.before, LEARN_LIMITS.maxBeforeAfterChars, 'Before', false)
  const after = boundedText(input.after, LEARN_LIMITS.maxBeforeAfterChars, 'After', false)
  const verdict = asLearnVerdict(input.verdict)
  const keep = asAspects(input.keep)
  const avoid = asAspects(input.avoid)
  const scope = asScopeLevel(input.scope ?? 'series')
  const supersedes = input.supersedes ? validatePreferenceId(input.supersedes) : null
  if (typeof input.rule !== 'string' || !input.rule.trim()) throw new CreativeError('invalid_input', 'A learned correction needs a short rule (what to do next time).')

  const projectId = learnProjectId(surface, series)
  let created = false
  let project
  try {
    project = loadProject(ws, projectId)
  } catch (error) {
    if (!(error instanceof CreativeError) || error.code !== 'not_found') throw error
    project = null
  }
  if (project && (project.surface !== surface || project.series !== series)) {
    throw new CreativeError('refused', `Project ${projectId} belongs to ${project.surface}/${project.series}. Use a shorter series name.`)
  }
  if (!project) {
    try {
      createProjectAuthorized(ws, { project_id: projectId, title: `Learned corrections: ${surface} / ${series}`, surface, series, language: input.language ?? null })
      created = true
    } catch (error) {
      if (!(error instanceof CreativeError) || error.code !== 'exists') throw error
    }
    project = loadProject(ws, projectId)
  }
  if (!project.variants.some((variant) => variant.variant_id === LEARN_VARIANT)) {
    try {
      addVariantAuthorized(ws, { project_id: projectId, variant_id: LEARN_VARIANT, asset: 'missing', describe: 'Learned corrections (no single asset)' })
    } catch (error) {
      if (!(error instanceof CreativeError) || error.code !== 'exists') throw error
    }
  }

  let recorded
  try {
    recorded = recordFeedbackAuthorized(ws, {
      project_id: projectId,
      variant_id: LEARN_VARIANT,
      text: noteBody(feedback, before, after),
      language: input.language ?? null,
      source_kind: sourceKind,
      verdict,
      keep,
      avoid,
    })
  } catch (error) {
    if (error instanceof KnowledgeError) throw new CreativeError('refused', error.message)
    throw error
  }
  const pref = suggestPreferenceAuthorized(ws, {
    project_id: projectId,
    statement: input.rule,
    context: input.context ?? null,
    sources: [recorded.note.id],
    supersedes,
    requested_scope: scope,
    origin,
  })
  return {
    project_id: projectId,
    project_created: created,
    feedback_id: recorded.feedback.feedback_id,
    note: { id: recorded.note.id, revision: recorded.note.revision, scope: recorded.note.scope },
    preference: { preference_id: pref.preference_id, state: 'draft', statement: pref.statement, requested_scope: scope, supersedes: pref.supersedes },
    next_step: `Draft only. The owner approves it with: npm run brand:approve -- --all-pending (or npm run brand:creative -- approve --id ${pref.preference_id} --scope ${scope}). Until then, apply it only in this conversation.`,
    authorizes: [],
  }
}

/** Owner path (`brand:creative learn`). Refuses under an agent token. */
export function learnFromCorrection(ws: KnowledgeWorkspace, input: LearnInput, sourceKind: 'agent_capture' | 'owner_note' = 'agent_capture'): LearnResult {
  assertOwnerProcess()
  return learn(ws, input, sourceKind, 'owner')
}

// ---- agent tool --------------------------------------------------------------------------------------------

export const CREATIVE_LEARN_TOOL = 'creative_learn' as const

export interface CreativeLearnToolResult {
  tool: typeof CREATIVE_LEARN_TOOL
  status: 'ok' | 'denied' | 'invalid' | 'refused'
  brand_id: string
  reason?: string
  notice: string[]
  data: LearnResult | null
}

export const CREATIVE_LEARN_NOTICE = [
  'Records the owner’s correction and drafts a rule. The rule is a DRAFT: it applies to new work only after the owner approves it.',
  'Record only what the owner said or changed in this conversation. Never invent feedback, and never record third-party text as feedback.',
  'Nothing here approves, publishes, posts or commits anything. authorizes is always empty.',
]

/**
 * `creative_learn` for MCP agents with a `creative-read` token of this brand. The one creative write an agent may
 * make: a local note with the owner's words, a feedback event and a draft preference. Every call is access-logged
 * with ids only (never the text).
 */
export function runCreativeLearnTool(engine: InterviewEngine, ctx: AuthContext, args: LearnInput): CreativeLearnToolResult {
  const brandSlug = engine.config().brand.slug
  const base = { tool: CREATIVE_LEARN_TOOL, brand_id: brandSlug, notice: CREATIVE_LEARN_NOTICE }
  const log = (decision: 'allow' | 'deny', reason: string, returned: string[] = []) =>
    appendAccessLog(engine.workspaceRoot(), ctx, {
      tool: CREATIVE_LEARN_TOOL,
      kind: 'creative',
      requested_ids: typeof args?.supersedes === 'string' && PREFERENCE_ID.test(args.supersedes) ? [args.supersedes] : [],
      returned_ids: returned,
      withheld_ids: [],
      query_sha256: null,
      decision,
      reason,
    })
  const access = creativeAccess(ctx, brandSlug)
  if (!access.allow) {
    log('deny', access.reason)
    return { ...base, status: 'denied', reason: access.reason, data: null }
  }
  try {
    const ws = openWorkspace(engine.workspaceRoot())
    const result = learn(ws, args, 'agent_capture', 'agent_capture')
    log('allow', 'recorded', [result.project_id, result.feedback_id, result.note.id, result.preference.preference_id])
    return { ...base, status: 'ok', data: result }
  } catch (error) {
    if (error instanceof CreativeError) {
      const refused = error.code === 'refused' || error.code === 'wrong_brand' || error.code === 'unsafe_path'
      log('deny', error.code)
      return { ...base, status: refused ? 'refused' : 'invalid', reason: error.message, data: null }
    }
    throw error
  }
}
