import type { Contradiction } from '../types.js'
import type { CoachContext } from './context.js'
import { COACH_LIMITS, type CoachConsistencyVerdict, type CoachSourceRef } from './model.js'

/**
 * `consistency_review` — the confirmed-conflict part: an **adapter** over the interview's existing deterministic rules.
 *
 * `findContradictions` stays the only implementation of those rules; this file reports what it returns and
 * adds nothing. That is what keeps the acceptance promise "existing deterministic contradictions remain
 * identical" true by construction rather than by comparison.
 *
 * Verdicts in this version:
 * - `confirmed_conflict` — an open rule hit from `findContradictions`. Evidence-supported and logical.
 * - `potential_tension` and `needs_verification` are **not** produced here. They come only from the narrow
 *   registry in `rules.ts` (PR 2), which also reports `not_tested` per rule, so a reader never mistakes
 *   silence for "no strategic tension exists".
 *
 * A restricted field never reaches a finding: restricted answers hold no value in the ledger, and the
 * fields a contradiction names are reported as ids only.
 */

export interface ConsistencyFinding {
  contradiction: Contradiction
  verdict: CoachConsistencyVerdict
  /** The other fields the rule names, as ids. Never values. */
  relatedIds: string[]
  sourceRefs: CoachSourceRef[]
}

/** Open deterministic conflicts, worst first, bounded by `COACH_LIMITS.maxConsistencyFindings`. */
export function consistencyFindings(ctx: CoachContext): ConsistencyFinding[] {
  const rank = { high: 0, medium: 1, low: 2 } as const
  return ctx.contradictions
    .filter((item) => item.status === 'open')
    .sort((a, b) => rank[a.severity] - rank[b.severity] || a.id.localeCompare(b.id))
    .slice(0, COACH_LIMITS.maxConsistencyFindings)
    .map((contradiction) => ({
      contradiction,
      verdict: 'confirmed_conflict' as const,
      relatedIds: [...contradiction.fields].sort(),
      sourceRefs: [
        { kind: 'contradiction' as const, id: contradiction.id },
        ...contradiction.fields.filter((id) => ctx.byId.has(id)).map((id): CoachSourceRef => ({ kind: 'question', id })),
      ],
    }))
}

/** Question ids that currently hold a live answer: what a consistency review actually read. */
export function answeredIds(ctx: CoachContext): string[] {
  return [...ctx.answers.keys()].filter((id) => ctx.byId.get(id)?.sensitivity !== 'restricted').sort()
}
