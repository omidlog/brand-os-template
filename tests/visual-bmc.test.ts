import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, ensureApprovalSecret, InterviewEngine, writeStarterWorkspace, type DocumentItem } from '@brand-os/brand-core'
import {
  BMC_FRAMEWORK,
  BMC_ZONE_IDS,
  BMC_ZONES,
  buildBusinessModelCanvas,
  canvasApplies,
  DATA_STATES,
  entryFromItem,
  illustrativeBusinessModelCanvas,
  MISSING_REASONS,
  VISUAL_LANGS,
  VISUAL_SCHEMA,
  visualCatalog,
  type BmcZone,
  type BusinessModelCanvasBlock,
  type CitationListBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual Blueprint P0: the semantic business model canvas. It must reuse the document model's truth path
 * (approved, draft, restricted, published), keep the nine canonical zones, and never fill a gap.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(extra: Record<string, unknown> = {}): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-visual-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Canvas Brand', slug: 'canvas-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public', ...extra })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function answer(engine: InterviewEngine, id: string, value: string): void {
  const result = engine.answerQuestion(id, value)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

function approve(engine: InterviewEngine, proof: string, ids: string[]): void {
  const result = engine.approvals().approveBatch({ ids }, proof)
  assert.equal(result.approved, ids.length, JSON.stringify(result.results))
}

function canvas(doc: VisualDocument): BusinessModelCanvasBlock {
  const block = doc.blocks.find((item): item is BusinessModelCanvasBlock => item.type === 'business_model_canvas')
  assert.ok(block)
  return block
}

function zone(doc: VisualDocument, id: BmcZone['zone_id']): BmcZone {
  const found = canvas(doc).zones.find((item) => item.zone_id === id)
  assert.ok(found, id)
  return found
}

function entry(doc: VisualDocument, id: string) {
  return canvas(doc).zones.flatMap((item) => item.entries).find((item) => item.id === id)
}

test('every zone maps to questions that exist in the bank, and gap zones only to proposed ones', () => {
  const { engine } = brand()
  const bank = new Set(engine.questions().map((question) => question.id))
  assert.deepEqual(BMC_ZONES.map((spec) => spec.zone), [...BMC_ZONE_IDS])
  for (const spec of BMC_ZONES) {
    for (const id of [...spec.questions, ...spec.related]) assert.ok(bank.has(id), `${spec.zone}: ${id} is a real question`)
    for (const id of spec.proposed) assert.equal(bank.has(id), false, `${id} is proposed, not yet in the bank`)
  }
  const used = BMC_ZONES.flatMap((spec) => spec.questions)
  assert.equal(new Set(used).size, used.length, 'a question owns at most one zone')
})

test('a fresh brand: nine canonical zones in order, everything missing, nothing invented', () => {
  const { engine } = brand()
  for (const audience of ['internal', 'public'] as const) {
    const doc = buildBusinessModelCanvas(engine, audience, { now: new Date('2026-11-23T00:00:00Z') })
    assert.equal(doc.schema, VISUAL_SCHEMA)
    assert.equal(doc.illustrative, false)
    assert.equal(doc.origin, 'brand_repository')
    assert.equal(doc.as_of, null)
    assert.equal(doc.audience, audience)
    const block = canvas(doc)
    assert.deepEqual(block.zones.map((item) => [item.order, item.zone_id]), BMC_ZONE_IDS.map((id, index) => [index + 1, id]))
    assert.equal(block.layout_constraints.preserve_topology, true)
    assert.equal(block.relationships.modeled, false, 'no invented links between zones')
    for (const item of block.zones) {
      assert.equal(item.state, 'missing', `${audience} ${item.zone_id}`)
      for (const value of item.entries) {
        assert.equal(value.state, 'missing')
        assert.equal(value.value, null)
        assert.ok(value.sources.includes(value.id))
      }
    }
    for (const gap of ['key_activities', 'key_resources'] as const) {
      const item = zone(doc, gap)
      assert.equal(item.entries.length, 0)
      assert.deepEqual(item.next_questions, [{ id: `business.model.${gap}`, kind: 'proposed' }])
    }
  }
})

test('approved, draft, not applicable and restricted entries keep their states; restricted values never leave', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.offer.value_proposition', 'Fluent in ten minutes a day.')
  answer(engine, 'business.model.revenue', 'Subscriptions.')
  answer(engine, 'business.finance.costs', 'CANARY-RESTRICTED-COSTS 42000 per month')
  approve(engine, proof, ['business.offer.value_proposition', 'business.model.revenue', 'business.finance.costs'])
  answer(engine, 'business.sales.pricing', 'DRAFT-PRICING one tier')
  answer(engine, 'business.sales.consumer_path', 'not relevant')
  answer(engine, 'business.ops.vendors', 'unknown')

  const internal = buildBusinessModelCanvas(engine, 'internal')
  assert.equal(entry(internal, 'business.offer.value_proposition')?.state, 'approved')
  assert.equal(entry(internal, 'business.offer.value_proposition')?.value, 'Fluent in ten minutes a day.')
  assert.equal(entry(internal, 'business.offer.value_proposition')?.version, 1)
  assert.ok(entry(internal, 'business.offer.value_proposition')?.approved_at)
  assert.equal(entry(internal, 'business.sales.pricing')?.state, 'assumption')
  assert.equal(entry(internal, 'business.sales.pricing')?.value, 'DRAFT-PRICING one tier')
  assert.equal(entry(internal, 'business.sales.consumer_path')?.state, 'not_applicable')
  assert.equal(entry(internal, 'business.ops.vendors')?.missing_reason, 'unknown')
  const costs = entry(internal, 'business.finance.costs')
  assert.equal(costs?.state, 'withheld')
  assert.equal(costs?.value, null)
  assert.equal(zone(internal, 'revenue_streams').state, 'partial')
  assert.deepEqual(zone(internal, 'revenue_streams').next_questions, [{ id: 'business.sales.pricing', kind: 'existing' }])
  assert.equal(zone(internal, 'value_propositions').state, 'partial', 'offer summary is still missing')
  assert.equal(internal.status_summary.approved, 2)
  assert.equal(internal.status_summary.withheld, 1)
  assert.equal(internal.status_summary.assumption, 1)
  assert.equal(internal.status_summary.not_applicable, 1)
  assert.ok(internal.as_of)
  const citations = internal.blocks.find((block): block is CitationListBlock => block.type === 'citation_list')
  assert.equal(citations?.items.length, canvas(internal).zones.reduce((sum, item) => sum + item.entries.length, 0))

  // Public: only approved, public, published facts. Business facts are internal, so the public canvas is empty and
  // says "not published", never "not answered", about a hidden draft.
  const pub = buildBusinessModelCanvas(engine, 'public')
  assert.equal(entry(pub, 'business.sales.pricing')?.state, 'missing')
  assert.equal(entry(pub, 'business.sales.pricing')?.missing_reason, 'not_published')
  assert.equal(entry(pub, 'business.offer.value_proposition')?.value, null)
  for (const doc of [internal, pub]) {
    const text = JSON.stringify(doc)
    assert.equal(text.includes('CANARY-RESTRICTED-COSTS'), false, `${doc.audience}: restricted value stays out`)
    assert.equal(text.includes('42000'), false)
  }
  assert.equal(JSON.stringify(pub).includes('DRAFT-PRICING'), false, 'drafts are not in the public edition')
})

test('a zone whose every question is approved is complete; the canvas is deterministic for the same inputs', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.customer.primary_segment', 'Adults learning for work.')
  answer(engine, 'business.sales.buyer', 'The learner buys.')
  approve(engine, proof, ['business.customer.primary_segment', 'business.sales.buyer'])
  const now = new Date('2026-11-23T00:00:00Z')
  const first = buildBusinessModelCanvas(engine, 'internal', { now })
  assert.equal(zone(first, 'customer_segments').state, 'complete')
  assert.deepEqual(zone(first, 'customer_segments').next_questions, [{ id: 'business.model.segments', kind: 'proposed' }], 'multi-segment capture is still proposed')
  assert.deepEqual(buildBusinessModelCanvas(engine, 'internal', { now }), first)
})

test('an approved fact past its review date is stale, never shown as current', () => {
  const item: DocumentItem = { id: 'business.model.revenue', label: 'Revenue model', tag: 'approved', kind: 'text', value: 'Subscriptions', structured: null, source_ids: ['business.model.revenue'], version: 2, withheld: false, note: null, verification: null }
  const fact = { approved_at: '2026-01-01T00:00:00Z', review_due: '2026-06-01' } as Parameters<typeof entryFromItem>[1]
  assert.equal(entryFromItem(item, fact, false, new Date('2026-11-23T00:00:00Z')).state, 'stale')
  assert.equal(entryFromItem(item, fact, false, new Date('2026-05-01T00:00:00Z')).state, 'approved')
})

test('a personal brand gets a canvas only with a business facet', () => {
  assert.equal(canvasApplies(brand().engine), true)
  assert.equal(canvasApplies(brand({ profile: 'personal-brand', facets: ['speaker-author'] }).engine), false)
  assert.equal(canvasApplies(brand({ profile: 'personal-brand', facets: ['consultant-expert'] }).engine), true)
})

test('framework claim is "informed by" with a licence status; no conformance language anywhere', () => {
  assert.equal(BMC_FRAMEWORK.permitted_claim, 'informed_by')
  assert.equal(BMC_FRAMEWORK.verified_on, null, 'nobody has re-checked the source page in this slice')
  assert.match(BMC_FRAMEWORK.license_status, /review/)
  for (const lang of VISUAL_LANGS) {
    const text = JSON.stringify(visualCatalog(lang))
    assert.equal(/certified|compliant|ISO\s?\d|conform/i.test(text.replace(/externally_certified|Externally certified|دارای گواهی مستقل|Bağımsız sertifikalı/g, '')), false, `${lang}: no compliance claims`)
  }
})

test('renderer catalogs: fa and tr define every key, every state, zone and proposed question', () => {
  const en = visualCatalog('en')
  const keys = (value: unknown, prefix = ''): string[] =>
    value && typeof value === 'object' ? Object.entries(value).flatMap(([key, inner]) => (inner && typeof inner === 'object' ? keys(inner, `${prefix}${key}.`) : [`${prefix}${key}`])) : []
  for (const lang of VISUAL_LANGS) {
    const cat = visualCatalog(lang)
    assert.deepEqual(keys(cat).sort(), keys(en).sort(), lang)
    for (const state of DATA_STATES) assert.ok(cat.state[state], `${lang} ${state}`)
    for (const reason of MISSING_REASONS) assert.ok(cat.missingReason[reason], `${lang} ${reason}`)
    for (const id of BMC_ZONE_IDS) assert.ok(cat.zone[id].title && cat.zone[id].prompt, `${lang} ${id}`)
    for (const id of BMC_ZONES.flatMap((spec) => spec.proposed)) assert.ok(cat.proposed[id], `${lang} ${id}`)
  }
  assert.equal(visualCatalog('fa').dir, 'rtl')
  assert.equal(visualCatalog('tr').dir, 'ltr')
})

test('the golden example is marked illustrative, covers every state and drops drafts from its public edition', () => {
  const internal = illustrativeBusinessModelCanvas('en', 'internal')
  assert.equal(internal.illustrative, true)
  assert.equal(internal.origin, 'illustrative_fixture')
  assert.match(internal.brand_name, /fictional/)
  const states = new Set(canvas(internal).zones.flatMap((item) => item.entries.map((value) => value.state)))
  for (const state of ['approved', 'stale', 'assumption', 'missing', 'withheld', 'not_applicable']) assert.ok(states.has(state as never), state)
  assert.ok(canvas(internal).zones.some((item) => item.entries.length === 0), 'a designed gap zone')
  const pub = illustrativeBusinessModelCanvas('en', 'public')
  assert.equal(canvas(pub).zones.flatMap((item) => item.entries).some((value) => value.state === 'assumption'), false)
  assert.equal(JSON.stringify(pub).includes('Cloud hosting'), false, 'a fixture draft is not in the public edition')
  assert.match(illustrativeBusinessModelCanvas('fa').blocks.length ? JSON.stringify(illustrativeBusinessModelCanvas('fa')) : '', /[؀-ۿ]/)
})
