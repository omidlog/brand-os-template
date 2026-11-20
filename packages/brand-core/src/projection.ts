import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { InterviewEngine } from './engine.js'

export interface PublicFact {
  id: string
  value: string
  status: 'approved'
  visibility: 'public'
  publication: 'published'
  version: number
  revision_hash: string
  source_id: string
}

export interface PublicBrandProjection {
  schema_version: 1
  brand_id: string
  display_name: string | null
  release: { version: string; content_hash: string }
  facts: PublicFact[]
}

interface ApprovedFact {
  value?: unknown
  visibility?: string
  publication?: string
  status?: string
  approved_by?: string
  updated?: string
  answer_id?: string
  version?: number
}

export function exportPublic(engine: InterviewEngine): PublicBrandProjection {
  const facts = publishedFacts(engine)
  const brandId = engine.config().brand.slug
  const display = facts.find((fact) => fact.id === 'business.identity.trade_name')?.value ?? null
  const body = facts.map((fact) => `${fact.id}:${fact.revision_hash}`).join('|')
  return {
    schema_version: 1,
    brand_id: brandId,
    display_name: display,
    release: { version: engine.config().brand.version, content_hash: crypto.createHash('sha256').update(body).digest('hex') },
    facts,
  }
}

export function publishedFacts(engine: InterviewEngine): PublicFact[] {
  const fileFacts = readApproved(engine)
  const facts: PublicFact[] = []
  for (const [id, fact] of Object.entries(fileFacts)) {
    if (fact.visibility !== 'public') continue
    if (fact.publication !== 'published') continue
    if (fact.value === null || fact.value === undefined) continue
    const value = String(fact.value)
    facts.push({
      id,
      value,
      status: 'approved',
      visibility: 'public',
      publication: 'published',
      version: fact.version ?? 1,
      revision_hash: crypto.createHash('sha256').update(`${id}:${value}`).digest('hex'),
      source_id: fact.answer_id ?? id,
    })
  }
  return facts.sort((a, b) => a.id.localeCompare(b.id))
}

function readApproved(engine: InterviewEngine): Record<string, ApprovedFact> {
  const file = path.join(engine.workspaceRoot(), 'brand', 'instance', 'approved-facts.yaml')
  if (!fs.existsSync(file)) return {}
  const doc = parse(fs.readFileSync(file, 'utf8')) as { facts?: Record<string, ApprovedFact> }
  return doc.facts ?? {}
}
