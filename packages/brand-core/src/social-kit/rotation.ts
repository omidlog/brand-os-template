import type { ContentChannel, ContentFormat } from '../strategy/model.js'
import type { SocialSurface } from './model.js'
import { evaluateKit, kitSafetyProblems, readKit } from './store.js'

/**
 * Style rotation helpers for the content brief. Pure and small on purpose: the integrator wires them into the
 * planner / brief; nothing here writes a slot or a week.
 */

/** Content-calendar format → kit surfaces. LinkedIn has its own surfaces; formats with no visual canvas map to none. */
export function surfacesForFormat(format: ContentFormat | string, channel?: ContentChannel | string | null): SocialSurface[] {
  if (channel === 'linkedin') {
    if (format === 'post') return ['linkedin_post']
    if (format === 'carousel') return ['linkedin_document']
    return []
  }
  switch (format) {
    case 'reel':
    case 'short_video':
      return ['reel', 'reel_cover']
    case 'post':
      return ['post']
    case 'carousel':
      return ['carousel']
    case 'story':
      return ['story']
    case 'video':
      return ['thumbnail']
    default:
      return []
  }
}

/**
 * The style for slot `slotIndex` (0-based) when slots of one format rotate through the approved styles in order, so
 * consecutive deliverables never repeat a layout while another approved sibling exists. `null` when none is approved.
 */
export function rotateStyles(approvedStyleIds: readonly string[], slotIndex: number): string | null {
  if (approvedStyleIds.length === 0) return null
  const index = Number.isInteger(slotIndex) && slotIndex >= 0 ? slotIndex : 0
  return approvedStyleIds[index % approvedStyleIds.length] ?? null
}

export interface FormatStyles {
  format: string
  channel: string | null
  surfaces: SocialSurface[]
  /** Approved, verified style ids per surface, in kit order. Empty when the kit is missing or nothing is approved. */
  styles: Partial<Record<SocialSurface, string[]>>
  state: 'ok' | 'missing' | 'invalid' | 'not_applicable'
}

/**
 * Approved style ids for a content format (owner-local read of brand/social/style-kit.yaml and the sealed approvals).
 * Drafts, rejected and invalid approvals are never listed. For an agent, serve the result through a gate that already
 * authorized it (the content brief), never directly.
 */
export function stylesForFormat(root: string, format: ContentFormat | string, channel?: ContentChannel | string | null, brandSlug?: string): FormatStyles {
  const surfaces = surfacesForFormat(format, channel)
  const base = { format, channel: channel ?? null, surfaces }
  if (surfaces.length === 0) return { ...base, styles: {}, state: 'not_applicable' }
  const read = readKit(root, brandSlug)
  if (read.state !== 'ok') return { ...base, styles: {}, state: read.state }
  if (kitSafetyProblems(read.kit).length) return { ...base, styles: {}, state: 'invalid' }
  const states = evaluateKit(root, read.kit)
  const styles: Partial<Record<SocialSurface, string[]>> = {}
  for (const surface of surfaces) styles[surface] = states.filter((state) => state.style.surface === surface && state.status === 'approved').map((state) => state.style.id)
  return { ...base, styles, state: 'ok' }
}
