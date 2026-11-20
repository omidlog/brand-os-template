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
