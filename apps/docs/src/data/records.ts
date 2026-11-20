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
