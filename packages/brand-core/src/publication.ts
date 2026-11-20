import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { CanonicalFact } from './facts.js'

/** Publication requires an explicit human-maintained allowlist; approval is not publication. */
export interface PublicationPolicy {
  approved_fact_ids: string[]
  approved_page_ids: string[]
  approved_asset_ids: string[]
  approved_token_ids: string[]
}

export function readPublicationPolicy(root: string): PublicationPolicy {
  const file = path.join(root, 'brand', 'publication-policy.yaml')
  const empty: PublicationPolicy = { approved_fact_ids: [], approved_page_ids: [], approved_asset_ids: [], approved_token_ids: [] }
  if (!fs.existsSync(file)) return empty
  const parsed = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid publication policy: expected mapping')
  const brandConfigFile = path.join(root, 'brand', 'brand.config.yaml')
  if (fs.existsSync(brandConfigFile)) {
    const config = parse(fs.readFileSync(brandConfigFile, 'utf8')) as { brand?: { slug?: string } } | null
    if (typeof parsed.brand_id !== 'string' || parsed.brand_id !== config?.brand?.slug) {
      throw new Error('Publication policy belongs to another brand. Public release refused.')
    }
  }
  const list = (key: keyof PublicationPolicy): string[] => {
    const value = parsed[key]
    if (value === undefined) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      throw new Error(`Invalid publication policy: ${key} must be a list of identifiers`)
    }
    return value as string[]
  }
  return {
    approved_fact_ids: list('approved_fact_ids'),
    approved_page_ids: list('approved_page_ids'),
    approved_asset_ids: list('approved_asset_ids'),
    approved_token_ids: list('approved_token_ids'),
  }
}

export function factIsPublic(root: string, id: string, fact: CanonicalFact | undefined, brandId: string): boolean {
  if (!fact || fact.id !== id || fact.brand_id !== brandId) return false
  return fact.status === 'approved' && fact.classification === 'public' && fact.publication === 'published' &&
    fact.value !== null && fact.value !== undefined && readPublicationPolicy(root).approved_fact_ids.includes(id)
}

export function assetIsPublic(root: string, asset: { id?: unknown; status?: unknown; visibility?: unknown }): boolean {
  return typeof asset.id === 'string' && asset.status === 'approved' && asset.visibility === 'public' &&
    readPublicationPolicy(root).approved_asset_ids.includes(asset.id)
}

export function pageIsPublic(root: string, page: string): boolean {
  return readPublicationPolicy(root).approved_page_ids.includes(page)
}
