export interface AssetRecord {
  id: string
  name: string
  path: string
  status: string
  present: boolean
  visibility: string
  downloadable?: boolean
  missing_reason?: string
}

export interface CatalogState {
  id: string
  name: string
  category: string
  intent: string
  mvp: boolean
  status?: string
  preview?: string | null
}

export interface PublishedColor {
  id: string
  hex: string
  description: string
  theme: string
}

export interface ContrastPair {
  id: string
  ratio: number
  min: number
  pass: boolean
}

export function asColors(value: { colors: unknown }): PublishedColor[] {
  return value.colors as PublishedColor[]
}

export function asContrast(value: { contrast: unknown }): ContrastPair[] {
  return value.contrast as ContrastPair[]
}

export interface NextQuestion {
  id: string
  priority: string
  prompt: string
}

export function asAssets(value: { assets: unknown }): AssetRecord[] {
  return value.assets as AssetRecord[]
}

export function asStates(value: { states: unknown }): CatalogState[] {
  return value.states as CatalogState[]
}

export function asNext(value: { next: unknown }): NextQuestion[] {
  return value.next as NextQuestion[]
}

export type ItemTag = 'approved' | 'assumption' | 'recommendation' | 'missing'

export type BookStructured =
  | { type: 'color'; colors: Array<{ role: string; hex: string }> }
  | { type: 'font'; fonts: Array<{ role: string; family: string; fallback: string[]; size_px: number | null; line_height: number | null }> }
  | { type: 'logo_spec'; logo: { min_size_px: number; clear_space: { value: number; unit: 'px' | 'x' }; min_print_mm: number | null } }
  | { type: 'voice_pairs'; pairs: Array<{ do: string; dont: string }> }

export interface BookItem {
  id: string
  label: string
  tag: ItemTag
  kind: string
  value: string | number | boolean | null
  structured: BookStructured | null
  source_ids: string[]
  version: number | null
  withheld: boolean
  note: string | null
}

export interface BookSection {
  id: string
  title: string
  purpose: string
  status: 'complete' | 'partial' | 'missing'
  items: BookItem[]
}

export interface BrandBook {
  kind: string
  title: string
  audience: 'public' | 'internal'
  note: string
  counts: Record<ItemTag, number>
  sections: BookSection[]
}

/** The JSON is written by scripts/prepare-docs.ts from the brand-core document model. */
export function asBrandBook(value: unknown): BrandBook {
  return value as BrandBook
}
