import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, BRAND_BOOK, BUSINESS_PLAN, ensureApprovalSecret, InterviewEngine, writeStarterWorkspace } from '@brand-os/brand-core'
import {
  BMC_ZONES,
  BOOK_CHAPTER_IDS,
  buildBook,
  buildBusinessModelCanvas,
  buildVisualIdentity,
  composeBook,
  FIXTURE_DRAFT_SENTINEL,
  FIXTURE_RESTRICTED_SENTINEL,
  FULL_BOOK_TEXT,
  illustrativeBook,
  printableEntry,
  VISUAL_LANGS,
  type BookDocument,
  type VisualEntry,
} from '@brand-os/brand-core/visual'

/**
 * Visual V4.2: the full Brand Book and Business Report model. Built from the existing truth path only; drafts lose
 * their value, recommendations are dropped, restricted values never leave in any edition, and every chapter that
 * has nothing approved (or is planned, or prints on its own) is an explicit "not yet available" chapter.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(): { root: string; engine: InterviewEngine; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-full-book-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Book Brand', slug: 'book-brand', industry: 'education', language: 'en', languages: ['en', 'fa', 'tr'], mascot: false, gamification: false, publish: 'public' })
  return { root, engine: new InterviewEngine(root), proof: ensureApprovalSecret(root) }
}

function answer(engine: InterviewEngine, id: string, value: string): void {
  const result = engine.answerQuestion(id, value)
  assert.equal(result.kind, 'recorded', `${id}: ${result.message}`)
}

function entries(book: BookDocument): VisualEntry[] {
  return book.chapters.flatMap((chapter) => (chapter.kind === 'facts' || chapter.kind === 'plate' ? chapter.entries : chapter.kind === 'canvas' ? chapter.zones.flatMap((zone) => zone.entries) : chapter.awaiting))
}

const entry = (id: string, state: VisualEntry['state'], value: string | null): VisualEntry => ({ id, label: id, state, value, sources: [], version: null, approved_at: null, review_due: null, note: null, missing_reason: state === 'missing' ? 'unanswered' : null })

test('printable entries: approved and stale keep the value, drafts lose it, recommendations are dropped', () => {
  assert.equal(printableEntry(entry('a', 'approved', 'yes'))?.value, 'yes')
  assert.equal(printableEntry(entry('a', 'stale', 'yes'))?.value, 'yes')
  assert.equal(printableEntry(entry('a', 'assumption', 'draft'))?.value, null)
  assert.equal(printableEntry(entry('a', 'withheld', 'secret'))?.value, null)
  assert.equal(printableEntry(entry('a', 'recommendation', 'advice')), null)
})

test('composeBook: chapter order, designed unavailable chapters, competitors only internal', () => {
  const sections = { overview: [entry('business.identity.trade_name', 'approved', 'X')], strategy: [entry('brand.strategy.purpose', 'assumption', 'draft')] }
  const internal = composeBook({ kind: 'brand_book', audience: 'internal', brand_id: 'b', brand_name: 'B', illustrative: false, sections, mascot: 'off' })
  assert.deepEqual(internal.chapters.map((chapter) => chapter.chapter_id), ['overview', 'strategy', 'verbal', 'color', 'type', 'logo', 'mascot', 'governance', 'motion', 'applications'])
  assert.equal(internal.chapters[0]!.kind, 'facts')
  const strategy = internal.chapters[1]!
  assert.ok(strategy.kind === 'unavailable' && strategy.reason === 'no_approved_facts' && strategy.awaiting.length === 1 && strategy.awaiting[0]!.value === null, 'a draft-only chapter is unavailable and lists the field without its value')
  assert.ok(internal.chapters.find((c) => c.chapter_id === 'mascot')?.kind === 'unavailable')
  const pub = composeBook({ kind: 'brand_book', audience: 'public', brand_id: 'b', brand_name: 'B', illustrative: false, sections, mascot: 'on' })
  for (const chapter of pub.chapters) if (chapter.kind === 'unavailable') assert.deepEqual(chapter.awaiting, [], 'public never lists what is awaited')
  const report = (audience: 'internal' | 'public') => composeBook({ kind: 'business_report', audience, brand_id: 'b', brand_name: 'B', illustrative: false, sections: {}, competitors: true })
  assert.deepEqual(report('internal').chapters.map((c) => c.chapter_id), ['executive_summary', 'customer_problem', 'business_model', 'business_model_canvas', 'competitors', 'product', 'financials', 'goals', 'risks'])
  assert.ok(!report('public').chapters.some((c) => c.chapter_id === 'competitors'), 'competitor data is internal only')
  assert.ok(report('internal').chapters.every((c) => c.kind === 'unavailable'), 'nothing approved: every chapter is a designed gap, nothing is filled')
})

test('fixtures: stamped illustrative, sentinels never carried, every page type present', () => {
  for (const kind of ['brand_book', 'business_report'] as const) {
    for (const lang of VISUAL_LANGS) {
      for (const audience of ['internal', 'public'] as const) {
        const book = illustrativeBook(kind, lang, audience)
        assert.equal(book.illustrative, true)
        assert.equal(book.origin, 'illustrative_fixture')
        const json = JSON.stringify(book)
        assert.equal(json.includes(FIXTURE_DRAFT_SENTINEL), false, `${kind} ${lang} ${audience}: draft value not carried`)
        assert.equal(json.includes(FIXTURE_RESTRICTED_SENTINEL), false, `${kind} ${lang} ${audience}: restricted value not carried`)
        if (audience === 'public') assert.ok(!entries(book).some((e) => e.state === 'assumption' || e.state === 'withheld'), 'public: no draft or restricted marks')
      }
    }
  }
  const kinds = new Set(illustrativeBook('brand_book').chapters.map((c) => c.kind))
  for (const kind of ['facts', 'plate', 'unavailable'] as const) assert.ok(kinds.has(kind), kind)
  assert.ok(illustrativeBook('business_report').chapters.some((c) => c.kind === 'canvas'))
})

test('en/fa/tr text is complete: chapters, reasons and every field label the books print', () => {
  const ids = new Set([...BRAND_BOOK.sections, ...BUSINESS_PLAN.sections].flatMap((section) => section.questions))
  for (const zone of BMC_ZONES) for (const id of zone.questions) ids.add(id)
  for (const lang of ['fa', 'tr'] as const) {
    const t = FULL_BOOK_TEXT[lang]
    for (const id of ids) assert.ok(t.labels[id], `${lang}: label for ${id}`)
  }
  for (const lang of VISUAL_LANGS) {
    const t = FULL_BOOK_TEXT[lang]
    for (const id of BOOK_CHAPTER_IDS) if (!['color', 'type', 'logo'].includes(id)) assert.ok(t.chapter[id as keyof typeof t.chapter]?.title, `${lang}: ${id}`)
    for (const value of Object.values(t.unavailable)) assert.ok(value.length > 10)
    if (lang !== 'en') assert.notEqual(t.book.brand_book.title, FULL_BOOK_TEXT.en.book.brand_book.title)
  }
})

test('buildBook on a brand: approved values only, drafts without value, restricted finance never carried', () => {
  const { engine, proof } = brand()
  answer(engine, 'business.offer.summary', 'Approved offer text')
  answer(engine, 'brand.strategy.purpose', 'CANARY-DRAFT-PURPOSE')
  answer(engine, 'business.finance.revenue_figure', 'CANARY-RESTRICTED-REVENUE 999')
  const approved = engine.approvals().approveBatch({ ids: ['business.offer.summary', 'business.finance.revenue_figure'] }, proof)
  assert.equal(approved.approved, 2, JSON.stringify(approved.results))
  for (const audience of ['internal', 'public'] as const) {
    const identity = buildVisualIdentity(engine, audience)
    const canvas = buildBusinessModelCanvas(engine, audience)
    for (const kind of ['brand_book', 'business_report'] as const) {
      const book = buildBook(engine, kind, audience, { identity, canvas })
      const json = JSON.stringify(book)
      assert.equal(json.includes('CANARY-DRAFT-PURPOSE'), false, `${kind} ${audience}: a draft value never reaches a book`)
      assert.equal(json.includes('CANARY-RESTRICTED-REVENUE'), false, `${kind} ${audience}: a restricted value never reaches a book`)
      assert.equal(book.origin, 'brand_repository')
    }
  }
  const report = buildBook(engine, 'business_report', 'internal', { canvas: buildBusinessModelCanvas(engine, 'internal') })
  const revenue = entries(report).find((e) => e.id === 'business.finance.revenue_figure')
  assert.ok(revenue && revenue.state === 'withheld' && revenue.value === null, 'internal: approved restricted figure is withheld')
  const summary = report.chapters.find((c) => c.chapter_id === 'executive_summary')
  assert.ok(summary?.kind === 'facts' && summary.entries.some((e) => e.value === 'Approved offer text'))
  const purpose = entries(buildBook(engine, 'brand_book', 'internal')).find((e) => e.id === 'brand.strategy.purpose')
  assert.ok(purpose && purpose.state === 'assumption' && purpose.value === null, 'internal: the draft keeps its state, not its value')
  const mascot = buildBook(engine, 'brand_book', 'internal').chapters.find((c) => c.chapter_id === 'mascot')
  assert.ok(mascot?.kind === 'unavailable' && mascot.reason === 'module_off')
})
