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
   * Segment ↔ offer ↔ channel ↔ revenue links. The question bank stores one prose answer per field, so no link
   * can be resolved yet; the renderer says so instead of drawing invented connectors.
   */
  relationships: { modeled: false; reason: 'single_prose_answers' }
}

export interface CitationListBlock extends BlockBase {
  type: 'citation_list'
  items: Array<{ id: string; label: string; state: DataState; version: number | null; approved_at: string | null }>
}

export type VisualBlock = BusinessModelCanvasBlock | CitationListBlock

export interface VisualDocument {
  schema: typeof VISUAL_SCHEMA
  schema_version: 1
  document_kind: 'business_model_canvas'
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

/**
 * Business Model Canvas registry entry. The nine-zone logic is drawn as an original layout; Strategyzer's own
 * artwork is not copied and no licence is implied. Claim: informed by, never "official" or "certified".
 */
export const BMC_FRAMEWORK: FrameworkRef = {
  framework_id: 'BMC',
  title: 'Business Model Canvas',
  kind: 'professional_framework',
  authority: 'Alexander Osterwalder / Strategyzer',
  edition: 'Strategyzer original (2010)',
  source_url: 'https://www.strategyzer.com/library/the-business-model-canvas',
  license_status: 'attribution-and-software-use-review',
  permitted_claim: 'informed_by',
  verified_on: null,
  usage_note: 'Original Brand OS layout of the nine business model components. Not Strategyzer artwork; commercial embedding terms are under review.',
}
