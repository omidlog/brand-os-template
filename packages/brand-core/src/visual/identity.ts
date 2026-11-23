import { contrastRatio } from '@brand-os/design-tokens'
import { latestAnswers } from '../completeness.js'
import { itemFor, type DocumentAudience, type ItemContext } from '../documents/model.js'
import type { InterviewEngine } from '../engine.js'
import { readEvidence } from '../evidence.js'
import { readFacts, type CanonicalFact } from '../facts.js'
import type { StructuredValue } from '../structured.js'
import { entryFromItem } from './bmc.js'
import { frameworkRef } from './frameworks.js'
import {
  emptyStatusSummary,
  VISUAL_SCHEMA,
  type BlockBase,
  type CitationListBlock,
  type ColorPaletteBlock,
  type ContrastPair,
  type LogoConstructionBlock,
  type LogoMaster,
  type MissingReason,
  type TypeRole,
  type TypographySpecimenBlock,
  type VisualAudience,
  type VisualDocument,
  type VisualEntry,
} from './model.js'

/**
 * Brand Book "Visual identity" chapter (Visual Blueprint V2.1): colour palette, typography specimen and logo
 * construction. Built through the same truth path as the documents (`itemFor`), but stricter: a specimen is drawn
 * only from an approved fact (or an approved one past its review date, labelled stale) and the logo only from the
 * approved master asset. Drafts, withheld values and gaps leave the block empty; the renderer draws the designed
 * "awaiting approved asset" page instead. Contrast is computed here from the approved hex values, never claimed.
 */

export const IDENTITY_QUESTIONS = { color: 'brand.color.roles', type: 'brand.type.scale', logo: 'brand.logo.min_size' } as const

/** Above this many colours the all-pairs grid stops being legible; the declared combinations are still measured. */
export const CONTRAST_GRID_MAX = 10

/** A manifest asset the caller (Studio) offers as a possible logo master. The builder decides; it never guesses. */
export interface LogoMasterCandidate {
  asset_id: string
  name: string
  version: string | null
  approved: boolean
  /** Approved and listed in the publication policy: only these count in the public edition. */
  published: boolean
  tags: string[]
  /** Template placeholders (tag `example`, an EXAMPLE licence) are never a master. */
  example: boolean
  preview_key: string | null
  mime: string | null
  width: number | null
  height: number | null
}

export interface IdentityOptions {
  now?: Date
  masters?: LogoMasterCandidate[]
}

const ROUND = (ratio: number) => Math.floor(ratio * 100) / 100

export function measurePair(foreground: { role: string; hex: string }, background: { role: string; hex: string }): ContrastPair {
  const exact = contrastRatio(foreground.hex, background.hex)
  return { foreground: foreground.role, background: background.role, ratio: ROUND(exact), aa_normal: exact >= 4.5, aa_large: exact >= 3, aaa_normal: exact >= 7 }
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Combinations a palette declares by name: `onX` is the text colour for background `x`. Nothing else is inferred. */
export function declaredCombinations(colors: Array<{ role: string; hex: string }>): ContrastPair[] {
  const byRole = new Map(colors.map((color) => [color.role.toLowerCase(), color]))
  const pairs: ContrastPair[] = []
  for (const color of colors) {
    const match = color.role.match(/^on[-_]?([A-Za-z0-9].*)$/)
    if (!match) continue
    const background = byRole.get((match[1] ?? '').toLowerCase())
    if (background && background !== color) pairs.push(measurePair(color, background))
  }
  return pairs
}

export function contrastGrid(colors: Array<{ role: string; hex: string }>): ColorPaletteBlock['grid'] {
  if (colors.length < 2 || colors.length > CONTRAST_GRID_MAX) return null
  return { roles: colors.map((color) => color.role), ratios: colors.map((fg) => colors.map((bg) => ROUND(contrastRatio(fg.hex, bg.hex)))) }
}

function drawable(entry: VisualEntry): boolean {
  return entry.state === 'approved' || entry.state === 'stale'
}

/** Never carry a draft or withheld value into the identity document: it would be one renderer bug from the page. */
function strict(entry: VisualEntry): VisualEntry {
  return drawable(entry) ? entry : { ...entry, value: null }
}

function base(input: { block_id: string; framework_id: string | null; entry: VisualEntry; filled: boolean; audience: VisualAudience; variant: string }): BlockBase {
  return {
    block_id: input.block_id,
    framework_id: input.framework_id,
    data_state: input.filled ? (input.entry.state === 'approved' ? 'complete' : 'partial') : 'missing',
    sources: [...input.entry.sources],
    as_of: drawable(input.entry) ? input.entry.approved_at : null,
    computed_from: [input.entry.id],
    visibility: input.audience,
    renderer_variant: input.variant,
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
  }
}

/** Picks the master: approved, not an example, tagged `logo` and `master`, previewable; public needs it published. */
export function pickMaster(candidates: LogoMasterCandidate[], audience: VisualAudience): { master: LogoMaster | null; state: LogoConstructionBlock['master_state'] } {
  const logos = candidates.filter((asset) => asset.tags.includes('logo'))
  const real = logos.filter((asset) => !asset.example)
  const masters = real.filter((asset) => asset.approved && asset.tags.includes('master') && (audience === 'internal' || asset.published))
  const previewable = masters.filter((asset) => asset.preview_key && asset.mime).sort((a, b) => a.asset_id.localeCompare(b.asset_id))
  const chosen = previewable[0]
  if (chosen) {
    return {
      master: { asset_id: chosen.asset_id, name: chosen.name, version: chosen.version, preview_key: chosen.preview_key!, mime: chosen.mime!, width: chosen.width, height: chosen.height },
      state: 'approved',
    }
  }
  if (masters.length) return { master: null, state: 'not_previewable' }
  if (logos.length && !real.length) return { master: null, state: 'example_only' }
  return { master: null, state: 'missing' }
}

/** Assembles the chapter from three source entries; shared by the repository builder and the illustrative fixture. */
export function identityDocument(input: {
  brand_id: string
  brand_name: string
  audience: VisualAudience
  illustrative: boolean
  color: { entry: VisualEntry; structured: StructuredValue | null }
  type: { entry: VisualEntry; structured: StructuredValue | null }
  logo: { entry: VisualEntry; structured: StructuredValue | null }
  masters: LogoMasterCandidate[]
  scripts: Array<'en' | 'fa' | 'tr'>
}): VisualDocument {
  const guide = frameworkRef('BRAND-IDENTITY-GUIDE')
  const wcag = frameworkRef('WCAG-CONTRAST')
  const colorEntry = strict(input.color.entry)
  const colors = drawable(colorEntry) && input.color.structured?.type === 'color' ? input.color.structured.colors.map((color) => ({ role: color.role, hex: color.hex, rgb: rgb(color.hex) })) : []
  const palette: ColorPaletteBlock = {
    ...base({ block_id: 'color-palette', framework_id: wcag.framework_id, entry: colorEntry, filled: colors.length > 0, audience: input.audience, variant: 'palette.book.v1' }),
    type: 'color_palette',
    source: colorEntry,
    colors,
    combinations: declaredCombinations(colors),
    grid: contrastGrid(colors),
  }
  const typeEntry = strict(input.type.entry)
  const roles: TypeRole[] = drawable(typeEntry) && input.type.structured?.type === 'font' ? input.type.structured.fonts.map((font) => ({ role: font.role, family: font.family, fallback: [...font.fallback], size_px: font.size_px, line_height: font.line_height })) : []
  const specimen: TypographySpecimenBlock = {
    ...base({ block_id: 'typography', framework_id: guide.framework_id, entry: typeEntry, filled: roles.length > 0, audience: input.audience, variant: 'type.specimen.v1' }),
    type: 'typography_specimen',
    source: typeEntry,
    roles,
    scripts: input.scripts.length ? input.scripts : ['en'],
  }
  const logoEntry = strict(input.logo.entry)
  const spec = drawable(logoEntry) && input.logo.structured?.type === 'logo_spec' ? { min_size_px: input.logo.structured.logo.min_size_px, clear_space: { ...input.logo.structured.logo.clear_space }, min_print_mm: input.logo.structured.logo.min_print_mm } : null
  const { master, state } = pickMaster(input.masters, input.audience)
  const construction: LogoConstructionBlock = {
    ...base({ block_id: 'logo-construction', framework_id: guide.framework_id, entry: logoEntry, filled: spec !== null && master !== null, audience: input.audience, variant: 'logo.construction.v1' }),
    type: 'logo_construction',
    source: logoEntry,
    spec,
    master,
    master_state: state,
  }
  if (master) construction.sources = [...construction.sources, `asset:${master.asset_id}`]
  const entries = [colorEntry, typeEntry, logoEntry]
  const summary = emptyStatusSummary()
  for (const entry of entries) summary[entry.state] += 1
  const dates = entries.filter(drawable).map((entry) => entry.approved_at).filter((at): at is string => typeof at === 'string' && Number.isFinite(Date.parse(at)))
  const asOf = dates.length ? dates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest)) : null
  const sources = [...new Set([...palette.sources, ...specimen.sources, ...construction.sources])]
  const filled = [palette, specimen, construction].filter((block) => block.data_state !== 'missing').length
  const citations: CitationListBlock = {
    type: 'citation_list',
    block_id: 'identity-sources',
    framework_id: guide.framework_id,
    data_state: filled === 3 ? 'complete' : filled > 0 ? 'partial' : 'missing',
    sources,
    as_of: asOf,
    computed_from: ['color-palette', 'typography', 'logo-construction'],
    visibility: input.audience,
    renderer_variant: 'citations.table.v1',
    layout_constraints: { preserve_topology: false, min_print_pt: 7, print_profile: 'book_a4_portrait' },
    items: entries.map((entry) => ({ id: entry.id, label: entry.label, state: entry.state, version: entry.version, approved_at: entry.approved_at })),
  }
  return {
    schema: VISUAL_SCHEMA,
    schema_version: 1,
    document_kind: 'visual_identity',
    brand_id: input.brand_id,
    brand_name: input.brand_name,
    audience: input.audience,
    illustrative: input.illustrative,
    origin: input.illustrative ? 'illustrative_fixture' : 'brand_repository',
    as_of: asOf,
    classification: input.audience === 'public' ? 'public' : 'internal',
    print_profile: 'book_a4_portrait',
    status_summary: summary,
    framework_refs: [guide, wcag],
    blocks: [palette, specimen, construction, citations],
  }
}

function missingReason(audience: DocumentAudience, status: string | undefined): MissingReason {
  if (audience === 'public') return 'not_published'
  if (status === 'unknown' || status === 'skipped' || status === 'deprecated') return status
  return 'unanswered'
}

/** The chapter for one brand repository and audience. Reads only; writes nothing. */
export function buildVisualIdentity(engine: InterviewEngine, audience: DocumentAudience, options: IdentityOptions = {}): VisualDocument {
  const root = engine.workspaceRoot()
  const config = engine.config()
  const brandId = config.brand.slug
  const now = options.now ?? new Date()
  const facts = readFacts(root, 'approved', brandId)
  const answers = latestAnswers(engine.ledger().records)
  const context: ItemContext = { facts, answers, audience, root, brandId, evidence: readEvidence(root), now }
  const source = (id: string): { entry: VisualEntry; structured: StructuredValue | null } => {
    const question = engine.question(id)
    if (!question) {
      const entry: VisualEntry = { id, label: id, state: 'missing', value: null, sources: [], version: null, approved_at: null, review_due: null, note: null, missing_reason: 'unanswered' }
      return { entry, structured: null }
    }
    const item = itemFor(question, context)
    const fact: CanonicalFact | undefined = facts[id]
    const { approved: _approved, ...entry } = entryFromItem(item, fact, false, now, missingReason(audience, answers.get(id)?.status))
    void _approved
    return { entry, structured: item.structured }
  }
  const locales = (config.brand.supported_locales ?? []).filter((lang): lang is 'en' | 'fa' | 'tr' => lang === 'en' || lang === 'fa' || lang === 'tr')
  return identityDocument({
    brand_id: brandId,
    brand_name: String(config.brand.name ?? brandId),
    audience,
    illustrative: false,
    color: source(IDENTITY_QUESTIONS.color),
    type: source(IDENTITY_QUESTIONS.type),
    logo: source(IDENTITY_QUESTIONS.logo),
    masters: options.masters ?? [],
    scripts: locales,
  })
}

/**
 * Intrinsic size of an image file for the construction drawing: SVG viewBox (or width/height) and the PNG header.
 * Anything else returns null and the drawing uses a neutral frame with a note; nothing is guessed.
 */
export function imageSize(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === 'image/png' && bytes.length >= 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (mime === 'image/svg+xml') {
    const head = bytes.toString('utf8', 0, Math.min(bytes.length, 8192))
    const tag = head.match(/<svg\b[^>]*>/i)?.[0]
    if (!tag) return null
    const box = tag.match(/\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/i)
    if (box) {
      const width = Number(box[1])
      const height = Number(box[2])
      if (width > 0 && height > 0) return { width, height }
    }
    const w = tag.match(/\bwidth\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i)
    const h = tag.match(/\bheight\s*=\s*["']\s*([\d.]+)(?:px)?\s*["']/i)
    if (w && h && Number(w[1]) > 0 && Number(h[1]) > 0) return { width: Number(w[1]), height: Number(h[1]) }
  }
  return null
}
