import { canonicalJson, sha256Hex } from '../strategy/model.js'

/**
 * Social style kit (docs-internal/SOCIAL_STYLE_KIT.md): per social surface, a small set of sibling styles that share
 * one brand family and differ in layout. Each style is an explicit layer stack in z-order, with zones in % of the
 * canvas and colour/type as design-token references (never raw values).
 *
 * The kit is design guidance, committed at `brand/social/style-kit.yaml`. It never holds a restricted value. Approval
 * is the owner's: a style is served to agents only when its content still hashes to its approval digest and that
 * digest carries the owner's HMAC seal (brand/.private/social/approvals.json).
 */

export const SOCIAL_KIT_SCHEMA = 'brand-os/social-style-kit/v1' as const
export const SOCIAL_KIT_TOOL = 'social_style_kit' as const
export const SOCIAL_KIT_FILE = 'brand/social/style-kit.yaml'
export const SOCIAL_APPROVALS_FILE = 'brand/.private/social/approvals.json'
export const SOCIAL_APPROVAL_DOMAIN = 'brand-os/social-style-approval/v1'
export const SOCIAL_KIT_VERSION = 1

export const SOCIAL_LANGS = ['en', 'fa', 'tr'] as const
export type SocialLang = (typeof SOCIAL_LANGS)[number]

export const SURFACES = ['post', 'carousel', 'story', 'reel', 'reel_cover', 'thumbnail', 'linkedin_post', 'linkedin_document'] as const
export type SocialSurface = (typeof SURFACES)[number]

export const DEFAULT_STYLES_PER_SURFACE = 4
export const MAX_STYLES_PER_SURFACE = 12

export class SocialKitError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'invalid_kit' | 'not_found' | 'exists' | 'refused' | 'proof' | 'stale' | 'unsafe',
    message: string,
  ) {
    super(message)
    this.name = 'SocialKitError'
  }
}

// ---- canvases and safe zones ---------------------------------------------------------------------------

export interface Canvas {
  id: string
  width: number
  height: number
}

export interface SafeZone {
  id: string
  /** `ui_overlap`: platform UI covers it; `crop`: the area that survives a grid or feed crop; `margin`: keep text in. */
  kind: 'ui_overlap' | 'crop' | 'margin'
  /** Pixels on the surface's primary canvas. */
  x: number
  y: number
  w: number
  h: number
}

export interface SurfaceSpec {
  surface: SocialSurface
  canvases: Canvas[]
  safe_zones: SafeZone[]
  /** Reels carry text on screen plus a caption style. */
  caption_style: boolean
}

/**
 * Canvas sizes and safe zones. The safe zones are general practice (the area a platform's own buttons, captions and
 * grid crop usually cover), not a platform specification: check the current app before a launch.
 */
export const SURFACE_SPECS: Record<SocialSurface, SurfaceSpec> = {
  post: {
    surface: 'post',
    canvases: [
      { id: '4x5', width: 1080, height: 1350 },
      { id: '1x1', width: 1080, height: 1080 },
    ],
    safe_zones: [
      { id: 'margin', kind: 'margin', x: 64, y: 64, w: 952, h: 1222 },
      { id: 'grid_crop_1x1', kind: 'crop', x: 0, y: 135, w: 1080, h: 1080 },
    ],
    caption_style: false,
  },
  carousel: {
    surface: 'carousel',
    canvases: [{ id: '4x5', width: 1080, height: 1350 }],
    safe_zones: [
      { id: 'margin', kind: 'margin', x: 64, y: 64, w: 952, h: 1222 },
      { id: 'dots_overlap', kind: 'ui_overlap', x: 0, y: 1290, w: 1080, h: 60 },
    ],
    caption_style: false,
  },
  story: {
    surface: 'story',
    canvases: [{ id: '9x16', width: 1080, height: 1920 }],
    safe_zones: [
      { id: 'top_ui', kind: 'ui_overlap', x: 0, y: 0, w: 1080, h: 250 },
      { id: 'bottom_ui', kind: 'ui_overlap', x: 0, y: 1580, w: 1080, h: 340 },
      { id: 'margin', kind: 'margin', x: 64, y: 250, w: 952, h: 1330 },
    ],
    caption_style: false,
  },
  reel: {
    surface: 'reel',
    canvases: [{ id: '9x16', width: 1080, height: 1920 }],
    safe_zones: [
      { id: 'top_ui', kind: 'ui_overlap', x: 0, y: 0, w: 1080, h: 250 },
      { id: 'bottom_ui', kind: 'ui_overlap', x: 0, y: 1580, w: 1080, h: 340 },
      { id: 'right_actions', kind: 'ui_overlap', x: 940, y: 900, w: 140, h: 680 },
      { id: 'margin', kind: 'margin', x: 64, y: 250, w: 876, h: 1330 },
    ],
    caption_style: true,
  },
  reel_cover: {
    surface: 'reel_cover',
    canvases: [{ id: '9x16', width: 1080, height: 1920 }],
    safe_zones: [
      { id: 'grid_crop_4x5', kind: 'crop', x: 0, y: 285, w: 1080, h: 1350 },
      { id: 'grid_crop_1x1', kind: 'crop', x: 0, y: 420, w: 1080, h: 1080 },
      { id: 'top_ui', kind: 'ui_overlap', x: 0, y: 0, w: 1080, h: 250 },
      { id: 'bottom_ui', kind: 'ui_overlap', x: 0, y: 1580, w: 1080, h: 340 },
    ],
    caption_style: false,
  },
  thumbnail: {
    surface: 'thumbnail',
    canvases: [{ id: '16x9', width: 1280, height: 720 }],
    safe_zones: [
      { id: 'margin', kind: 'margin', x: 48, y: 40, w: 1184, h: 640 },
      { id: 'timestamp', kind: 'ui_overlap', x: 1080, y: 630, w: 200, h: 90 },
    ],
    caption_style: false,
  },
  linkedin_post: {
    surface: 'linkedin_post',
    canvases: [
      { id: '4x5', width: 1200, height: 1500 },
      { id: 'link_1.91x1', width: 1200, height: 627 },
    ],
    safe_zones: [{ id: 'margin', kind: 'margin', x: 72, y: 72, w: 1056, h: 1356 }],
    caption_style: false,
  },
  linkedin_document: {
    surface: 'linkedin_document',
    canvases: [{ id: '4x5', width: 1080, height: 1350 }],
    safe_zones: [
      { id: 'margin', kind: 'margin', x: 72, y: 72, w: 936, h: 1206 },
      { id: 'page_controls', kind: 'ui_overlap', x: 0, y: 1270, w: 1080, h: 80 },
    ],
    caption_style: false,
  },
}

// ---- layers --------------------------------------------------------------------------------------------

export const LAYER_ROLES = ['background', 'media', 'overlay', 'shape', 'headline', 'subhead', 'body', 'data', 'quote', 'mascot', 'brand_mark', 'cta', 'caption_bar', 'progress', 'handle'] as const
export type LayerRole = (typeof LAYER_ROLES)[number]
/** Roles that carry words: they take a font token and a text limit. */
export const TEXT_ROLES: readonly LayerRole[] = ['headline', 'subhead', 'body', 'data', 'quote', 'cta', 'caption_bar', 'handle']

/** Named grid areas, in % of the canvas. A layer zone is one of these or an explicit {x, y, w, h} in %. */
export const NAMED_ZONES = {
  full: { x: 0, y: 0, w: 100, h: 100 },
  safe: { x: 6, y: 6, w: 88, h: 88 },
  top_band: { x: 0, y: 0, w: 100, h: 18 },
  bottom_band: { x: 0, y: 82, w: 100, h: 18 },
  upper_half: { x: 0, y: 0, w: 100, h: 50 },
  lower_half: { x: 0, y: 50, w: 100, h: 50 },
  left_half: { x: 0, y: 0, w: 50, h: 100 },
  right_half: { x: 50, y: 0, w: 50, h: 100 },
  center: { x: 15, y: 30, w: 70, h: 40 },
} as const
export type NamedZone = keyof typeof NAMED_ZONES

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Zone = NamedZone | Rect

export interface Layer {
  role: LayerRole
  zone: Zone
  /** Fill for shapes and backgrounds, text colour for text roles. A colour token id. */
  color?: string | null
  /** Font family token id, text roles only. */
  font?: string | null
  max_words?: number | null
  max_lines?: number | null
  /** Rule codes (see RULE_CODES) or short owner text. */
  rules?: string[]
  optional?: boolean
}

export type Localized = Partial<Record<SocialLang, string>> & { en: string }

export const CONTENT_TYPES = ['educate', 'inspire', 'entertain', 'promote', 'proof', 'community', 'announce', 'behind_the_scenes', 'personal'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

export const STYLE_STATUSES = ['draft', 'approved', 'rejected'] as const
export type StyleStatus = (typeof STYLE_STATUSES)[number]
/** What a reader sees: an approved style whose digest or seal does not verify is `invalid_approval`, never served. */
export type EffectiveStatus = 'draft' | 'approved' | 'rejected' | 'invalid_approval'

export interface StyleApprovalRef {
  event_id: string
  approved_at: string
  digest: string
}

export interface SocialStyle {
  id: string
  surface: SocialSurface
  archetype: string
  name: Localized
  intent: { use_when: Localized; content_types: ContentType[]; pillar?: string | null }
  layers: Layer[]
  variation: Localized
  do: string[]
  dont: string[]
  /** Asset-manifest ids, or the word `missing`. */
  reference_assets: string[] | 'missing'
  caption_style?: { font: string; color: string; background: string | null; max_words_per_line: number; position: 'lower_third' | 'center' | 'upper_third' } | null
  status: StyleStatus
  approval?: StyleApprovalRef | null
}

export interface SocialFamily {
  type: { headline: string; body: string; accent?: string | null }
  palette: Record<string, string>
  logo: { placement: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right' | 'top_center' | 'bottom_center' | 'none'; size_pct: number; asset: string; rule_refs: string[] }
  photo_direction: { fact_refs: string[] }
  corner_radius: string
  grid: { margin_pct: number; columns: number; gutter_pct: number }
  notes?: string[]
}

export interface SocialKit {
  schema_version: 1
  kind: 'social_style_kit'
  brand_slug: string
  family: SocialFamily
  styles: SocialStyle[]
}

// ---- rule codes ---------------------------------------------------------------------------------------

/** Closed vocabulary for do / dont / layer rules. Anything else is the owner's own short text, shown as written. */
export const RULE_CODES = [
  'one_message',
  'high_contrast',
  'keep_in_safe_zone',
  'logo_once',
  'brand_mark_small',
  'no_stock_cliche',
  'real_people_only_with_rights',
  'cite_data_source',
  'approved_numbers_only',
  'quote_verbatim_with_permission',
  'one_cta',
  'no_text_over_face',
  'readable_at_thumb_size',
  'max_two_type_sizes',
  'consistent_slide_numbering',
  'hook_on_first_slide',
  'cta_on_last_slide',
  'captions_always_on',
  'no_dense_paragraphs',
  'left_align_ltr_right_align_rtl',
  'mascot_approved_pose_only',
  'no_fake_ui',
  'no_clickbait',
  'face_left_text_right',
  'no_more_than_three_colors',
  'progress_visible',
  'link_sticker_space',
  'before_after_same_framing',
  'question_open_ended',
] as const
export type RuleCode = (typeof RULE_CODES)[number]

// ---- validation ---------------------------------------------------------------------------------------

export const STYLE_ID = /^(post|carousel|story|reel|reel_cover|thumbnail|linkedin_post|linkedin_document)\.[a-z0-9][a-z0-9-]{1,39}$/
export const ARCHETYPE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/
export const ASSET_ID = /^[a-z0-9][a-z0-9._-]{0,119}$/
/** A design-token id: a dotted path, never a value. */
export const TOKEN_REF = /^(color|type|radius|space)\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){0,4}$/
const FACT_REF = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,4}$/
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/
const SAFE_TEXT_MAX = 280

function fail(path: string, message: string): never {
  throw new SocialKitError('invalid_kit', `${path}: ${message}`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, path: string, max = SAFE_TEXT_MAX): string {
  if (typeof value !== 'string' || value.trim() === '') fail(path, 'must be a non-empty text.')
  if (value.length > max) fail(path, `is longer than ${max} characters.`)
  if (RAW_COLOR.test(value)) fail(path, 'holds a raw colour value. Use a colour token id (color.…).')
  return value
}

function tokenRef(value: unknown, path: string, prefix: 'color' | 'type' | 'radius' | 'any'): string {
  if (typeof value !== 'string' || !TOKEN_REF.test(value)) fail(path, 'must be a design-token id such as color.brand.primary or type.fontFamily.display, never a raw value.')
  if (prefix !== 'any' && !value.startsWith(`${prefix}.`)) fail(path, `must be a ${prefix}.… token id.`)
  return value
}

function optionalToken(value: unknown, path: string, prefix: 'color' | 'type'): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return tokenRef(value, path, prefix)
}

function localized(value: unknown, path: string): Localized {
  if (typeof value === 'string') return { en: text(value, path) }
  if (!isObject(value)) fail(path, 'must be a text or {en, fa, tr}.')
  for (const key of Object.keys(value)) if (!(SOCIAL_LANGS as readonly string[]).includes(key)) fail(`${path}.${key}`, 'is not en, fa or tr.')
  const out: Localized = { en: text(value.en, `${path}.en`) }
  for (const lang of ['fa', 'tr'] as const) if (value[lang] !== undefined) out[lang] = text(value[lang], `${path}.${lang}`)
  return out
}

function percent(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) fail(path, 'must be a number from 0 to 100 (% of the canvas).')
  return Math.round(value * 100) / 100
}

function zone(value: unknown, path: string): Zone {
  if (typeof value === 'string') {
    if (!Object.prototype.hasOwnProperty.call(NAMED_ZONES, value)) fail(path, `must be one of ${Object.keys(NAMED_ZONES).join(', ')} or {x, y, w, h} in %.`)
    return value as NamedZone
  }
  if (!isObject(value)) fail(path, 'must be a named zone or {x, y, w, h} in %.')
  const rect = { x: percent(value.x, `${path}.x`), y: percent(value.y, `${path}.y`), w: percent(value.w, `${path}.w`), h: percent(value.h, `${path}.h`) }
  if (rect.w === 0 || rect.h === 0) fail(path, 'has no area.')
  if (rect.x + rect.w > 100.001 || rect.y + rect.h > 100.001) fail(path, 'goes past the canvas edge.')
  return rect
}

export function zoneRect(value: Zone): Rect {
  return typeof value === 'string' ? { ...NAMED_ZONES[value] } : value
}

function count(value: unknown, path: string, max: number): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max) fail(path, `must be a whole number from 1 to ${max}.`)
  return value
}

function rules(value: unknown, path: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > 12) fail(path, 'must be a list of at most 12 rule codes or short texts.')
  return value.map((item, index) => text(item, `${path}[${index}]`, 160))
}

function layer(value: unknown, path: string): Layer {
  if (!isObject(value)) fail(path, 'must be a layer object.')
  const allowed = ['role', 'zone', 'color', 'font', 'max_words', 'max_lines', 'rules', 'optional']
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'is not a layer field.')
  if (typeof value.role !== 'string' || !(LAYER_ROLES as readonly string[]).includes(value.role)) fail(`${path}.role`, `must be one of ${LAYER_ROLES.join(', ')}.`)
  const role = value.role as LayerRole
  const out: Layer = { role, zone: zone(value.zone, `${path}.zone`) }
  const color = optionalToken(value.color, `${path}.color`, 'color')
  if (color !== undefined) out.color = color
  const font = optionalToken(value.font, `${path}.font`, 'type')
  if (font !== undefined) {
    if (font !== null && !TEXT_ROLES.includes(role)) fail(`${path}.font`, `a ${role} layer carries no text.`)
    out.font = font
  }
  const words = count(value.max_words, `${path}.max_words`, 200)
  if (words !== undefined) out.max_words = words
  const lines = count(value.max_lines, `${path}.max_lines`, 30)
  if (lines !== undefined) out.max_lines = lines
  const list = rules(value.rules, `${path}.rules`)
  if (list.length) out.rules = list
  if (value.optional !== undefined) {
    if (typeof value.optional !== 'boolean') fail(`${path}.optional`, 'must be true or false.')
    if (value.optional) out.optional = true
  }
  return out
}

function captionStyle(value: unknown, path: string): SocialStyle['caption_style'] {
  if (value === undefined || value === null) return value === null ? null : undefined
  if (!isObject(value)) fail(path, 'must be an object.')
  const position = value.position
  if (position !== 'lower_third' && position !== 'center' && position !== 'upper_third') fail(`${path}.position`, 'must be lower_third, center or upper_third.')
  const perLine = count(value.max_words_per_line, `${path}.max_words_per_line`, 12)
  if (!perLine) fail(`${path}.max_words_per_line`, 'is required.')
  return {
    font: tokenRef(value.font, `${path}.font`, 'type'),
    color: tokenRef(value.color, `${path}.color`, 'color'),
    background: value.background === null || value.background === undefined ? null : tokenRef(value.background, `${path}.background`, 'color'),
    max_words_per_line: perLine,
    position,
  }
}

function approvalRef(value: unknown, path: string): StyleApprovalRef | null {
  if (value === undefined || value === null) return null
  if (!isObject(value)) fail(path, 'must be an object written by kit approve.')
  if (typeof value.event_id !== 'string' || !/^apv_[0-9a-f-]{36}$/.test(value.event_id)) fail(`${path}.event_id`, 'is not an approval event id.')
  if (typeof value.approved_at !== 'string' || Number.isNaN(Date.parse(value.approved_at))) fail(`${path}.approved_at`, 'is not a date.')
  if (typeof value.digest !== 'string' || !/^[0-9a-f]{64}$/.test(value.digest)) fail(`${path}.digest`, 'is not a sha256 digest.')
  return { event_id: value.event_id, approved_at: value.approved_at, digest: value.digest }
}

export function parseStyle(value: unknown, path: string): SocialStyle {
  if (!isObject(value)) fail(path, 'must be a style object.')
  const allowed = ['id', 'surface', 'archetype', 'name', 'intent', 'layers', 'variation', 'do', 'dont', 'reference_assets', 'caption_style', 'status', 'approval']
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, 'is not a style field.')
  if (typeof value.id !== 'string' || !STYLE_ID.test(value.id)) fail(`${path}.id`, 'must be <surface>.<slug>, for example post.bold-statement.')
  if (typeof value.surface !== 'string' || !(SURFACES as readonly string[]).includes(value.surface)) fail(`${path}.surface`, `must be one of ${SURFACES.join(', ')}.`)
  const surface = value.surface as SocialSurface
  if (!value.id.startsWith(`${surface}.`)) fail(`${path}.id`, `must start with ${surface}.`)
  if (typeof value.archetype !== 'string' || !ARCHETYPE_ID.test(value.archetype)) fail(`${path}.archetype`, 'must be a short slug.')
  if (!isObject(value.intent)) fail(`${path}.intent`, 'must be {use_when, content_types}.')
  const types = value.intent.content_types
  if (!Array.isArray(types) || types.length === 0 || types.some((item) => !(CONTENT_TYPES as readonly unknown[]).includes(item))) fail(`${path}.intent.content_types`, `must list one or more of ${CONTENT_TYPES.join(', ')}.`)
  const pillar = value.intent.pillar
  if (pillar !== undefined && pillar !== null && (typeof pillar !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(pillar))) fail(`${path}.intent.pillar`, 'must be a short slug or null.')
  if (!Array.isArray(value.layers) || value.layers.length < 2 || value.layers.length > 16) fail(`${path}.layers`, 'must list 2 to 16 layers in z-order (first is the back).')
  const layers = value.layers.map((item, index) => layer(item, `${path}.layers[${index}]`))
  if (layers[0]?.role !== 'background' && layers[0]?.role !== 'media') fail(`${path}.layers[0]`, 'the back layer must be a background or media layer.')
  if (!['draft', 'approved', 'rejected'].includes(value.status as string)) fail(`${path}.status`, 'must be draft, approved or rejected.')
  let reference: SocialStyle['reference_assets']
  if (value.reference_assets === 'missing' || value.reference_assets === undefined) reference = 'missing'
  else if (Array.isArray(value.reference_assets) && value.reference_assets.length > 0 && value.reference_assets.length <= 12 && value.reference_assets.every((id) => typeof id === 'string' && ASSET_ID.test(id))) reference = [...(value.reference_assets as string[])]
  else fail(`${path}.reference_assets`, 'must be asset-manifest ids or the word missing (never a path or URL).')
  const style: SocialStyle = {
    id: value.id,
    surface,
    archetype: value.archetype,
    name: localized(value.name, `${path}.name`),
    intent: { use_when: localized(value.intent.use_when, `${path}.intent.use_when`), content_types: [...(types as ContentType[])], pillar: (pillar as string | null | undefined) ?? null },
    layers,
    variation: localized(value.variation, `${path}.variation`),
    do: rules(value.do, `${path}.do`),
    dont: rules(value.dont, `${path}.dont`),
    reference_assets: reference,
    status: value.status as StyleStatus,
  }
  const caption = captionStyle(value.caption_style, `${path}.caption_style`)
  if (caption !== undefined) style.caption_style = caption
  const approval = approvalRef(value.approval, `${path}.approval`)
  if (approval) style.approval = approval
  if (style.status === 'approved' && !approval) fail(`${path}.approval`, 'an approved style needs the approval written by kit approve.')
  return style
}

export function parseFamily(value: unknown): SocialFamily {
  const path = 'family'
  if (!isObject(value)) fail(path, 'must be an object.')
  if (!isObject(value.type)) fail(`${path}.type`, 'must be {headline, body}.')
  if (!isObject(value.palette) || Object.keys(value.palette).length === 0 || Object.keys(value.palette).length > 16) fail(`${path}.palette`, 'must map 1 to 16 palette roles to colour token ids.')
  const palette: Record<string, string> = {}
  for (const [role, ref] of Object.entries(value.palette)) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(role)) fail(`${path}.palette.${role}`, 'a palette role is a short snake_case name.')
    palette[role] = tokenRef(ref, `${path}.palette.${role}`, 'color')
  }
  if (!isObject(value.logo)) fail(`${path}.logo`, 'must be {placement, size_pct, asset, rule_refs}.')
  const placements = ['top_left', 'top_right', 'bottom_left', 'bottom_right', 'top_center', 'bottom_center', 'none']
  if (!placements.includes(value.logo.placement as string)) fail(`${path}.logo.placement`, `must be one of ${placements.join(', ')}.`)
  const size = value.logo.size_pct
  if (typeof size !== 'number' || size < 0 || size > 40) fail(`${path}.logo.size_pct`, 'must be 0 to 40 (% of the canvas width).')
  const asset = value.logo.asset
  if (typeof asset !== 'string' || (asset !== 'missing' && !ASSET_ID.test(asset))) fail(`${path}.logo.asset`, 'must be an asset-manifest id or the word missing.')
  const factRefs = (list: unknown, at: string): string[] => {
    if (list === undefined || list === null) return []
    if (!Array.isArray(list) || list.length > 12 || list.some((item) => typeof item !== 'string' || !FACT_REF.test(item))) fail(at, 'must list question ids of approved facts, for example brand.photo.direction.')
    return [...(list as string[])]
  }
  if (!isObject(value.photo_direction)) fail(`${path}.photo_direction`, 'must be {fact_refs}.')
  if (!isObject(value.grid)) fail(`${path}.grid`, 'must be {margin_pct, columns, gutter_pct}.')
  const columns = value.grid.columns
  if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 24) fail(`${path}.grid.columns`, 'must be 1 to 24.')
  const marginPct = value.grid.margin_pct
  const gutterPct = value.grid.gutter_pct
  if (typeof marginPct !== 'number' || marginPct < 0 || marginPct > 25) fail(`${path}.grid.margin_pct`, 'must be 0 to 25.')
  if (typeof gutterPct !== 'number' || gutterPct < 0 || gutterPct > 10) fail(`${path}.grid.gutter_pct`, 'must be 0 to 10.')
  const family: SocialFamily = {
    type: {
      headline: tokenRef(value.type.headline, `${path}.type.headline`, 'type'),
      body: tokenRef(value.type.body, `${path}.type.body`, 'type'),
      accent: value.type.accent === undefined || value.type.accent === null ? null : tokenRef(value.type.accent, `${path}.type.accent`, 'type'),
    },
    palette,
    logo: { placement: value.logo.placement as SocialFamily['logo']['placement'], size_pct: size, asset, rule_refs: factRefs(value.logo.rule_refs, `${path}.logo.rule_refs`) },
    photo_direction: { fact_refs: factRefs(value.photo_direction.fact_refs, `${path}.photo_direction.fact_refs`) },
    corner_radius: tokenRef(value.corner_radius, `${path}.corner_radius`, 'radius'),
    grid: { margin_pct: marginPct, columns, gutter_pct: gutterPct },
  }
  const notes = rules(value.notes, `${path}.notes`)
  if (notes.length) family.notes = notes
  return family
}

/** Parses and checks a kit document. Throws SocialKitError('invalid_kit') with the first problem. */
export function parseKit(doc: unknown, brandSlug?: string): SocialKit {
  if (!isObject(doc)) fail('kit', 'must be a YAML mapping.')
  for (const key of Object.keys(doc)) if (!['schema_version', 'kind', 'brand_slug', 'family', 'styles'].includes(key)) fail(key, 'is not a kit field.')
  if (doc.schema_version !== SOCIAL_KIT_VERSION) fail('schema_version', `must be ${SOCIAL_KIT_VERSION}.`)
  if (doc.kind !== 'social_style_kit') fail('kind', 'must be social_style_kit.')
  if (typeof doc.brand_slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(doc.brand_slug)) fail('brand_slug', 'must be the brand slug.')
  if (brandSlug !== undefined && doc.brand_slug !== brandSlug) fail('brand_slug', `belongs to ${doc.brand_slug}, not ${brandSlug}.`)
  if (!Array.isArray(doc.styles) || doc.styles.length > SURFACES.length * MAX_STYLES_PER_SURFACE) fail('styles', 'must be a list.')
  const styles = doc.styles.map((item, index) => parseStyle(item, `styles[${index}]`))
  const seen = new Set<string>()
  for (const style of styles) {
    if (seen.has(style.id)) fail(`styles.${style.id}`, 'is listed twice.')
    seen.add(style.id)
  }
  for (const surface of SURFACES) {
    if (styles.filter((style) => style.surface === surface).length > MAX_STYLES_PER_SURFACE) fail(`styles.${surface}`, `has more than ${MAX_STYLES_PER_SURFACE} styles.`)
  }
  return { schema_version: 1, kind: 'social_style_kit', brand_slug: doc.brand_slug, family: parseFamily(doc.family), styles }
}

// ---- digests --------------------------------------------------------------------------------------------

/** The style as it is approved: everything but its status and approval, plus the family it renders with. */
export function styleContent(style: SocialStyle): Omit<SocialStyle, 'status' | 'approval'> {
  const { status: _status, approval: _approval, ...content } = style
  return content
}

/**
 * The digest the owner reviews and approves (`--expect-sha`). It covers the style and the family, so a later family
 * edit (type, palette, logo rule) also needs the owner again.
 */
export function styleDigest(brandSlug: string, family: SocialFamily, style: SocialStyle): string {
  return sha256Hex(canonicalJson({ domain: SOCIAL_APPROVAL_DOMAIN, brand_slug: brandSlug, family, style: styleContent(style) }))
}

/** One digest over several style digests, for approving a whole surface at once. */
export function batchDigest(items: Array<{ id: string; digest: string }>): string {
  return sha256Hex(canonicalJson([...items].sort((a, b) => (a.id < b.id ? -1 : 1)).map((item) => [item.id, item.digest])))
}

export function approvalEventDigest(input: { brand_slug: string; style_id: string; digest: string; event_id: string; approved_at: string }): string {
  return sha256Hex(canonicalJson(input))
}

export function localize(value: Localized, lang: SocialLang): string {
  return value[lang] ?? value.en
}
