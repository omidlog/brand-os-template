/**
 * Semantic visual layer (Visual Blueprint P0, first slice).
 *
 * A `VisualDocument` is a versioned, renderer-neutral view model built from the same truth path as the document
 * model (`documents/model.ts` `itemFor`): approved facts, owner drafts, missing answers and withheld restricted
 * values. It is metadata and references, never a second fact store. The Studio page and the static print/PDF view
 * render the same document, so the screen and the export cannot disagree.
 *
 * The document is language-neutral. Values stay exactly as approved (never translated); every label, state name
 * and instruction comes from the renderer's en/fa/tr catalog (`visual/i18n.ts`).
 */

export const VISUAL_SCHEMA = 'brand-os.visual-document/1'

/** Every state is shown as text plus an icon plus a colour, never colour alone. */
export const DATA_STATES = ['approved', 'assumption', 'recommendation', 'missing', 'withheld', 'stale', 'conflicting', 'not_applicable'] as const
export type DataState = (typeof DATA_STATES)[number]

/** What a page may say about a framework or standard. Only `informed_by` is used until a reviewed mapping exists. */
export const PERMITTED_CLAIMS = ['informed_by', 'aligned_with', 'verified_against', 'externally_certified', 'original_professional_template'] as const
export type PermittedClaim = (typeof PERMITTED_CLAIMS)[number]

export const PRINT_PROFILES = ['web_interactive', 'book_a4_portrait', 'canvas_a3_landscape', 'deck_16_9'] as const
export type PrintProfile = (typeof PRINT_PROFILES)[number]

export type VisualAudience = 'internal' | 'public'

/**
 * Registry metadata for one framework. It describes the method and what may be claimed about it; it holds no
 * brand facts. `verified_on` is the date a person last checked the source page, or null when nobody has.
 */
export interface FrameworkRef {
  framework_id: string
  title: string
  kind: 'formal_standard' | 'professional_framework' | 'editorial_template'
  authority: string
  edition: string
  source_url: string
  license_status: string
  permitted_claim: PermittedClaim
  verified_on: string | null
  /** Plain statement of what this rendering is and is not, printed next to the visual. */
  usage_note: string
}

/** One value inside a block: an approved fact, an owner draft, or a named gap. */
export interface VisualEntry {
  /** The question id that owns the field. */
  id: string
  label: string
  state: DataState
  /** Null when missing or withheld. Never filled in. */
  value: string | null
  sources: string[]
  version: number | null
  approved_at: string | null
  review_due: string | null
  /** Why the entry is in this state (owner said unknown, restricted, draft …), in English from the core model. */
  note: string | null
  /** For `missing` entries: why there is no value, so the renderer never says "not answered" about a hidden draft. */
  missing_reason: MissingReason | null
  /**
   * Visual V3.1: a list question (repeating_entity) with a visible value carries its items here, in the owner's
   * order; `value` is then the item names joined, for tables. Absent for every other entry.
   */
  items?: VisualEntityItem[]
  /** Visual V3.1: a list question whose stored value is not a list. `value` is the text as written; flagged. */
  legacy?: true
}

/** One item of a list question, as drawn on the canvas. Choice values are option keys; renderers label them. */
export interface VisualEntityItem {
  id: string
  name: string
  detail: string | null
  /** Choice fields that are set, e.g. `{ field: 'priority', value: 'primary' }`. */
  tags: Array<{ field: string; value: string }>
  links: string[]
}

/**
 * A link between two items on the canvas (activity → segment, cost → resource …). `resolved` when the target item
 * is visible in this edition; `unresolved` when it is not (removed, not answered, or not published), so the
 * renderer shows the reference without inventing a target.
 */
export interface CanvasLink {
  from: string
  from_zone: BmcZoneId
  to: string
  to_zone: BmcZoneId | null
  state: 'resolved' | 'unresolved'
}

export const MISSING_REASONS = ['unanswered', 'unknown', 'skipped', 'deprecated', 'not_published'] as const
export type MissingReason = (typeof MISSING_REASONS)[number]

export interface NextQuestion {
  id: string
  /** `existing`: a question in the bank that is not answered or not approved. `proposed`: not in the bank yet. */
  kind: 'existing' | 'proposed'
}

/** Fields every block carries, whatever it draws. */
export interface BlockBase {
  block_id: string
  framework_id: string | null
  /** Aggregate state of the block's entries. */
  data_state: 'complete' | 'partial' | 'missing'
  sources: string[]
  /** Latest approval date among the approved entries, or null. */
  as_of: string | null
  computed_from: string[]
  visibility: VisualAudience
  renderer_variant: string
  layout_constraints: { preserve_topology: boolean; min_print_pt: number; print_profile: PrintProfile }
}

export const BMC_ZONE_IDS = [
  'key_partners',
  'key_activities',
  'key_resources',
  'value_propositions',
  'customer_relationships',
  'channels',
  'customer_segments',
  'cost_structure',
  'revenue_streams',
] as const
export type BmcZoneId = (typeof BMC_ZONE_IDS)[number]

export interface BmcZone {
  zone_id: BmcZoneId
  /** 1–9 in the canonical reading order. */
  order: number
  state: 'complete' | 'partial' | 'missing' | 'withheld' | 'not_applicable'
  entries: VisualEntry[]
  /** What the owner can answer next to fill this zone. Never a guessed value. */
  next_questions: NextQuestion[]
  /** Existing questions that may inform the zone but do not answer it. Ids only; values are not copied. */
  related: string[]
}

export interface BusinessModelCanvasBlock extends BlockBase {
  type: 'business_model_canvas'
  zones: BmcZone[]
  /**
   * Links between zones. Until V3.1 every zone was prose (`single_prose_answers`). With list questions the canvas
   * reads the links the owner recorded on items; with no visible list items yet the reason is `no_list_items`.
   * Offers, channels and revenue streams are still prose, so they are never linked; nothing is inferred.
   */
  relationships: { modeled: false; reason: 'single_prose_answers' | 'no_list_items' } | { modeled: true; links: CanvasLink[] }
}

export interface CitationListBlock extends BlockBase {
  type: 'citation_list'
  items: Array<{ id: string; label: string; state: DataState; version: number | null; approved_at: string | null }>
}

/** One measured foreground/background pair. Thresholds are compared with the exact ratio, never a rounded one. */
export interface ContrastPair {
  foreground: string
  background: string
  /** WCAG 2 contrast ratio rounded down to two decimals (display only). */
  ratio: number
  /** ≥ 4.5 (normal text), ≥ 3 (large text), ≥ 7 (enhanced). A measurement of two colours, not an audit. */
  aa_normal: boolean
  aa_large: boolean
  aaa_normal: boolean
}

/**
 * Brand Book "Visual identity": the colour palette. Drawn only from the approved `brand.color.roles` fact; a draft,
 * a withheld value or a gap leaves `colors` empty and the renderer shows the designed "awaiting" page.
 */
export interface ColorPaletteBlock extends BlockBase {
  type: 'color_palette'
  /** The fact the palette is drawn from. `value` is null unless approved (or approved and review overdue). */
  source: VisualEntry
  colors: Array<{ role: string; hex: string; rgb: [number, number, number] }>
  /** Combinations the roles declare by name (`onPrimary` on `primary`), measured. */
  combinations: ContrastPair[]
  /** Every ordered pair, for the contrast grid; null when there are too many colours to draw legibly. */
  grid: { roles: string[]; ratios: number[][] } | null
}

export interface TypeRole {
  role: string
  family: string
  fallback: string[]
  size_px: number | null
  line_height: number | null
}

/** Brand Book "Visual identity": type roles from the approved `brand.type.scale` fact, set in en/fa/tr specimens. */
export interface TypographySpecimenBlock extends BlockBase {
  type: 'typography_specimen'
  source: VisualEntry
  roles: TypeRole[]
  /** Languages the specimen is set in (the brand's supported locales among en/fa/tr). */
  scripts: Array<'en' | 'fa' | 'tr'>
}

/**
 * The approved master logo file: an approved, checksummed, non-example manifest asset tagged `logo`, resolved in this
 * order: named in the approved `brand.logo.masters` fact, tagged `master`, or the only approved previewable logo.
 */
export interface LogoMaster {
  asset_id: string
  name: string
  version: string | null
  /** Studio preview key (content hash). The file itself is served only by the existing asset route. */
  preview_key: string
  mime: string
  /** Intrinsic size when it could be read (SVG viewBox/width/height, PNG header); null otherwise. */
  width: number | null
  height: number | null
  /** How the master was found: named in `brand.logo.masters`, tagged `master`, or the only approved logo. */
  resolved_by: 'reference' | 'tag' | 'sole_logo'
  /** Internal edition only (always empty in public): the file still carries a `draft` tag, or it is not published. */
  badges: Array<'draft_tag' | 'internal_only'>
}

export interface LogoConstructionBlock extends BlockBase {
  type: 'logo_construction'
  /** `brand.logo.min_size` (structured logo_spec). Value null unless approved. */
  source: VisualEntry
  spec: { min_size_px: number; clear_space: { value: number; unit: 'px' | 'x' }; min_print_mm: number | null } | null
  master: LogoMaster | null
  /**
   * Why there is no master: none registered, only template examples, approved files that cannot be previewed, or
   * several approved logos and none named in `brand.logo.masters` (the builder never guesses between them).
   */
  master_state: 'approved' | 'missing' | 'example_only' | 'not_previewable' | 'ambiguous'
}

export type VisualBlock = BusinessModelCanvasBlock | CitationListBlock | ColorPaletteBlock | TypographySpecimenBlock | LogoConstructionBlock | CompetitorMatrixBlock | PriceStripBlock

export interface VisualDocument {
  schema: typeof VISUAL_SCHEMA
  schema_version: 1
  document_kind: 'business_model_canvas' | 'visual_identity' | 'competitor_comparison'
  brand_id: string
  brand_name: string
  audience: VisualAudience
  /** True only for golden examples built from fixtures. Renderers must stamp ILLUSTRATIVE / MOCK DATA. */
  illustrative: boolean
  origin: 'brand_repository' | 'illustrative_fixture'
  /** Latest approval date among cited facts. Not a render time, so the same commit renders the same document. */
  as_of: string | null
  classification: 'internal' | 'public'
  print_profile: PrintProfile
  status_summary: Record<DataState, number>
  framework_refs: FrameworkRef[]
  blocks: VisualBlock[]
}

export function emptyStatusSummary(): Record<DataState, number> {
  return Object.fromEntries(DATA_STATES.map((state) => [state, 0])) as Record<DataState, number>
}

// ---- Visual V2.2: competitor comparison matrix and price strip -------------------------------------------

/**
 * What a comparison cell may say. `present` and `unverified` come from a cited, current observation; `absent` only
 * when a source states it (the competitor index records no absence today, so the share path never emits it and
 * silence is never read as absence); `unknown` stays unknown.
 */
export const COMPARISON_STATES = ['present', 'unverified', 'historical', 'conflicting', 'needs_review', 'absent', 'unknown'] as const
export type ComparisonState = (typeof COMPARISON_STATES)[number]

/** One numbered source footnote: who is speaking, the public host for web sources, and when it was read. */
export interface ComparisonSource {
  n: number
  source_class: string | null
  host: string | null
  observed_on: string
}

export interface ComparisonCell {
  criterion: string
  state: ComparisonState
  /** Short recorder labels (competitors) or the approved value (own brand). Never a quote. */
  labels: string[]
  /** Approved colour swatches for the own brand's visual identity cell; empty otherwise. */
  swatches: string[]
  footnotes: number[]
  /** Own brand only: the approved fact the cell is drawn from (value null unless approved). */
  own: VisualEntry | null
}

export interface ComparisonRow {
  row_id: string
  kind: 'own_brand' | 'competitor'
  name: string
  relationship: string[]
  markets: string[]
  official_domain: string | null
  needs_refresh: boolean
  cells: ComparisonCell[]
}

export interface CompetitorMatrixBlock extends BlockBase {
  type: 'competitor_matrix'
  criteria: string[]
  rows: ComparisonRow[]
  footnotes: ComparisonSource[]
  /** Whether the owner shared a landscape on this commit, and whether Studio could show it. */
  share_state: 'not_shared' | 'shared' | 'withheld'
  withheld_reason: string | null
  not_shared: { candidates: number; disputed: number; archived: number } | null
  withheld_text: number
}

export interface PriceStripRow {
  competitor_id: string
  competitor_name: string
  offer_name: string
  amount: number
  currency: string
  market: string
  billing_period: string
  billing_commitment: string
  tax_inclusion: string
  promotion: string
  feature_scope: string | null
  rate_label: string
  state: string
  footnote: number
}

/** Published prices, grouped by currency in the order recorded. Never ranked, never converted. */
export interface PriceStripBlock extends BlockBase {
  type: 'price_strip'
  groups: Array<{ currency: string; rows: PriceStripRow[] }>
  /** Competitors with no shared public price: unknown stays unknown. */
  unpriced: string[]
  ranked: false
  currency_conversion: 'none'
}
