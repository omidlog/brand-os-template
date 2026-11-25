import { appendAccessLog } from '../access-log.js'
import type { AgentProfile, AuthContext } from '../auth.js'
import type { InterviewEngine } from '../engine.js'
import { ruleText, socialKitText } from './i18n.js'
import {
  localize,
  SOCIAL_KIT_SCHEMA,
  SOCIAL_KIT_TOOL,
  SOCIAL_LANGS,
  SURFACE_SPECS,
  SURFACES,
  zoneRect,
  type Canvas,
  type ContentType,
  type LayerRole,
  type Rect,
  type SafeZone,
  type SocialFamily,
  type SocialLang,
  type SocialSurface,
} from './model.js'
import { evaluateKit, kitSafetyProblems, readKit, type StyleState } from './store.js'

/**
 * Read-only `social_style_kit` for MCP agents and `brand:query --tool social_style_kit`.
 *
 * - Answered for owner-issued tokens of this brand with the design, creative-read, content-read, internal-read or
 *   marketing profile. Guests, unprofiled agents, other profiles and other brands are denied. No argument selects a
 *   brand, role or profile.
 * - Only approved styles whose digest and seal verify are returned. Drafts, rejected styles and invalid approvals are
 *   counted under `withheld`, never shown, never named.
 * - The family is returned only when at least one style is approved (its approval covers the family).
 * - `authorizes: []`. One access-log line per call, ids only.
 */

export const SOCIAL_KIT_PROFILES: readonly AgentProfile[] = ['design', 'creative-read', 'content-read', 'internal-read', 'marketing']

export interface AgentLayer {
  role: LayerRole
  zone: Rect
  zone_name: string | null
  color: string | null
  font: string | null
  max_words: number | null
  max_lines: number | null
  rules: string[]
  optional: boolean
}

export interface AgentStyle {
  style_id: string
  surface: SocialSurface
  archetype: string
  name: string
  use_when: string
  content_types: ContentType[]
  pillar: string | null
  variation: string
  layers: AgentLayer[]
  caption_style: Record<string, unknown> | null
  do: string[]
  dont: string[]
  reference_assets: string[] | 'missing'
  approval: { digest: string; approved_at: string }
}

export interface AgentSurface {
  surface: SocialSurface
  label: string
  canvases: Canvas[]
  safe_zones: SafeZone[]
  styles: AgentStyle[]
}

export interface SocialKitView {
  schema: typeof SOCIAL_KIT_SCHEMA
  brand_id: string
  lang: SocialLang
  direction: 'ltr' | 'rtl'
  kit_state: 'ok' | 'missing' | 'invalid'
  notice: string[]
  family: SocialFamily | null
  surfaces: AgentSurface[]
  withheld: { draft: number; rejected: number; invalid_approval: number }
  missing: Array<{ surface: SocialSurface; reason: 'no_kit' | 'invalid_kit' | 'no_approved_style' }>
  authorizes: []
  permissions: { publish: false; schedule: false; spend: false; approve: false }
}

export interface SocialKitToolResult {
  tool: typeof SOCIAL_KIT_TOOL
  status: 'ok' | 'denied' | 'invalid'
  brand_id: string
  reason?: string
  data: SocialKitView | null
  authorizes: []
}

export interface SocialKitToolArgs {
  surface?: unknown
  lang?: unknown
}

export function socialKitAccess(ctx: AuthContext, brandSlug: string): { allow: boolean; reason: string } {
  if (ctx.brand_id !== brandSlug) return { allow: false, reason: 'cross-brand' }
  if (ctx.role !== 'agent' || ctx.profile === undefined || !SOCIAL_KIT_PROFILES.includes(ctx.profile)) {
    return { allow: false, reason: `social_style_kit needs an owner-issued token of this brand with one of these profiles: ${SOCIAL_KIT_PROFILES.join(', ')}` }
  }
  return { allow: true, reason: 'allowed' }
}

function agentStyle(state: StyleState, lang: SocialLang): AgentStyle {
  const style = state.style
  return {
    style_id: style.id,
    surface: style.surface,
    archetype: style.archetype,
    name: localize(style.name, lang),
    use_when: localize(style.intent.use_when, lang),
    content_types: [...style.intent.content_types],
    pillar: style.intent.pillar ?? null,
    variation: localize(style.variation, lang),
    layers: style.layers.map((layer) => ({
      role: layer.role,
      zone: zoneRect(layer.zone),
      zone_name: typeof layer.zone === 'string' ? layer.zone : null,
      color: layer.color ?? null,
      font: layer.font ?? null,
      max_words: layer.max_words ?? null,
      max_lines: layer.max_lines ?? null,
      rules: (layer.rules ?? []).map((rule) => ruleText(rule, lang)),
      optional: layer.optional === true,
    })),
    caption_style: style.caption_style ? { ...style.caption_style } : null,
    do: style.do.map((rule) => ruleText(rule, lang)),
    dont: style.dont.map((rule) => ruleText(rule, lang)),
    reference_assets: style.reference_assets === 'missing' ? 'missing' : [...style.reference_assets],
    approval: { digest: state.digest, approved_at: style.approval?.approved_at ?? '' },
  }
}

/**
 * The approved part of the kit, as an agent may see it. Pure over the evaluated states; tested with canaries.
 * `surfaces` limits the view (one surface, or the surfaces of a content format).
 */
export function socialKitView(root: string, brandSlug: string, options: { lang?: SocialLang; surfaces?: readonly SocialSurface[] } = {}): { view: SocialKitView; returned: string[]; withheld: string[] } {
  const lang = options.lang ?? 'en'
  const wanted = SURFACES.filter((surface) => !options.surfaces || options.surfaces.includes(surface))
  const text = socialKitText(lang)
  const base: SocialKitView = {
    schema: SOCIAL_KIT_SCHEMA,
    brand_id: brandSlug,
    lang,
    direction: lang === 'fa' ? 'rtl' : 'ltr',
    kit_state: 'ok',
    notice: [...text.notice],
    family: null,
    surfaces: [],
    withheld: { draft: 0, rejected: 0, invalid_approval: 0 },
    missing: [],
    authorizes: [],
    permissions: { publish: false, schedule: false, spend: false, approve: false },
  }
  const read = readKit(root, brandSlug)
  if (read.state !== 'ok') {
    const reason = read.state === 'missing' ? 'no_kit' : 'invalid_kit'
    return { view: { ...base, kit_state: read.state, missing: wanted.map((surface) => ({ surface, reason })) }, returned: [], withheld: [] }
  }
  // A kit holding credential-like text is not served at all, approved or not.
  if (kitSafetyProblems(read.kit).length) {
    return { view: { ...base, kit_state: 'invalid', missing: wanted.map((surface) => ({ surface, reason: 'invalid_kit' as const })) }, returned: [], withheld: [] }
  }
  const states = evaluateKit(root, read.kit).filter((state) => wanted.includes(state.style.surface))
  const returned: string[] = []
  const withheld: string[] = []
  for (const state of states) {
    if (state.status === 'approved') returned.push(state.style.id)
    else {
      base.withheld[state.status] += 1
      withheld.push(state.style.id)
    }
  }
  const approvedAnywhere = evaluateKit(root, read.kit).some((state) => state.status === 'approved')
  const surfaces: AgentSurface[] = []
  const missing: SocialKitView['missing'] = []
  for (const surface of wanted) {
    const styles = states.filter((state) => state.style.surface === surface && state.status === 'approved').map((state) => agentStyle(state, lang))
    if (styles.length === 0) {
      missing.push({ surface, reason: 'no_approved_style' })
      continue
    }
    const spec = SURFACE_SPECS[surface]
    surfaces.push({ surface, label: text.surfaces[surface], canvases: spec.canvases.map((canvas) => ({ ...canvas })), safe_zones: spec.safe_zones.map((zone) => ({ ...zone })), styles })
  }
  return { view: { ...base, family: approvedAnywhere ? read.kit.family : null, surfaces, missing }, returned, withheld }
}

export function runSocialKitTool(engine: InterviewEngine, ctx: AuthContext, args: SocialKitToolArgs = {}): SocialKitToolResult {
  const brandSlug = engine.config().brand.slug
  const root = engine.workspaceRoot()
  const base = { tool: SOCIAL_KIT_TOOL, brand_id: brandSlug, authorizes: [] as [] }
  const surface = args.surface === undefined || args.surface === null || args.surface === '' ? undefined : (SURFACES as readonly unknown[]).includes(args.surface) ? (args.surface as SocialSurface) : null
  const lang = args.lang === undefined || args.lang === null || args.lang === '' ? 'en' : (SOCIAL_LANGS as readonly unknown[]).includes(args.lang) ? (args.lang as SocialLang) : null
  const log = (decision: 'allow' | 'deny', reason: string, returned: string[] = [], withheld: string[] = []) =>
    appendAccessLog(root, ctx, { tool: SOCIAL_KIT_TOOL, kind: 'social_kit', requested_ids: surface ? [surface] : [], returned_ids: returned, withheld_ids: withheld, query_sha256: null, decision, reason })
  const access = socialKitAccess(ctx, brandSlug)
  if (!access.allow) {
    log('deny', access.reason)
    return { ...base, status: 'denied', reason: access.reason, data: null }
  }
  if (surface === null || lang === null) {
    log('deny', 'invalid')
    return { ...base, status: 'invalid', reason: `surface is one of ${SURFACES.join(', ')}; lang is en, fa or tr.`, data: null }
  }
  const { view, returned, withheld } = socialKitView(root, brandSlug, { lang, surfaces: surface ? [surface] : undefined })
  log('allow', view.kit_state, returned, withheld)
  return { ...base, status: 'ok', data: view }
}
