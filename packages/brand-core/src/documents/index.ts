import type { InterviewEngine } from '../engine.js'
import { buildBrandBook } from './brand-book.js'
import { buildBusinessPlan } from './business-plan.js'
import { buildMarketingPlan } from './marketing-plan.js'
import type { DocumentAudience, DocumentKind, DocumentModel } from './model.js'

export { BRAND_BOOK, buildBrandBook } from './brand-book.js'
export { BUSINESS_PLAN, buildBusinessPlan } from './business-plan.js'
export { MARKETING_PLAN, buildMarketingPlan } from './marketing-plan.js'
export { buildDocument, ITEM_TAGS, itemFor } from './model.js'
export type { DocumentAudience, DocumentItem, DocumentKind, DocumentModel, DocumentSection, DocumentSpec, ItemTag, SectionSpec } from './model.js'
export { renderDocumentMarkdown } from './markdown.js'

export const DOCUMENT_KINDS: readonly DocumentKind[] = ['brand-book', 'business-plan', 'marketing-plan']

export function buildNamedDocument(engine: InterviewEngine, kind: DocumentKind, audience: DocumentAudience): DocumentModel {
  if (kind === 'brand-book') return buildBrandBook(engine, audience)
  if (kind === 'business-plan') return buildBusinessPlan(engine, audience)
  return buildMarketingPlan(engine, audience)
}
