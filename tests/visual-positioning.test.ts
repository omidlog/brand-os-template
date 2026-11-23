import assert from 'node:assert/strict'
import { test } from 'node:test'
import { POSITION_BANDS, type SharedLandscapeRead } from '@brand-os/brand-core/competitive'
import {
  comparisonDocument,
  illustrativeCompetitorComparison,
  illustrativeLandscape,
  illustrativePositioning,
  POSITIONING_TEXT,
  VISUAL_LANGS,
  type CompetitorMatrixBlock,
  type PositioningMapBlock,
  type VisualDocument,
} from '@brand-os/brand-core/visual'

/**
 * Visual V2.3 (owner decision D2): the positioning map block. Axes are the owner's own words from the shared file;
 * a subject is plotted only when both axes have a dated source; unknown stays in the margin; stale and conflicting are
 * marked, never resolved; nothing is a number.
 */
const map = (doc: VisualDocument) => doc.blocks.find((b): b is PositioningMapBlock => b.type === 'positioning_map')!
const matrix = (doc: VisualDocument) => doc.blocks.find((b): b is CompetitorMatrixBlock => b.type === 'competitor_matrix')!

function docFor(read: SharedLandscapeRead): VisualDocument {
  const base = illustrativeCompetitorComparison('complete')
  // Reuse the fixture's own-brand sources through the public builder.
  return comparisonDocument({ brand_id: base.brand_id, brand_name: base.brand_name, illustrative: true, read, own: {} })
}

test('fixture: evidenced, stale and conflicting are plotted; unknown on one axis goes to the margin', () => {
  const doc = illustrativeCompetitorComparison('complete')
  const m = map(doc)
  assert.equal(doc.illustrative, true)
  assert.equal(m.type, 'positioning_map')
  assert.equal(m.visibility, 'internal')
  assert.equal(m.renderer_variant, 'positioning.map.v1')
  assert.equal(m.data_state, 'partial')
  assert.deepEqual(m.axes?.x.label, { en: 'Guidance', fa: 'میزان راهنمایی', tr: 'Rehberlik' })
  assert.deepEqual(m.bands, [...POSITION_BANDS])
  assert.equal(m.stale_after_days, 90)
  // Own brand first, then competitors in shared order, numbered 1…n only when plotted.
  assert.deepEqual(m.points.map((p) => [p.kind, p.name, p.n]), [
    ['own_brand', doc.brand_name, null],
    ['competitor', 'Avenra (fictional)', 1],
    ['competitor', 'Kestrel Learn (fictional)', 2],
  ])
  assert.deepEqual(m.unplotted.map((p) => [p.name, p.x.state, p.y.state, p.n]), [['Moraq Studio (fictional)', 'evidenced', 'unknown', null]])
  assert.deepEqual(m.unplotted[0]!.footnotes, [], 'a subject not drawn carries no source numbers')
  const avenra = m.points[1]!
  assert.equal(avenra.y.state, 'conflicting')
  assert.deepEqual(avenra.y.bands, ['lower_mid', 'mid'], 'a conflict keeps both readings as a range')
  assert.equal(m.points[2]!.y.state, 'stale')
})

test('footnotes join the matrix numbering: one list of sources for the whole page', () => {
  const doc = illustrativeCompetitorComparison('complete')
  const notes = matrix(doc).footnotes
  for (const point of map(doc).points) {
    assert.ok(point.footnotes.length > 0, point.name)
    for (const n of point.footnotes) assert.ok(notes.some((note) => note.n === n), `${point.name} cites ${n}`)
  }
  // The owner statement behind the own-brand position is listed without a host.
  assert.ok(notes.some((note) => note.source_class === 'owner_statement' && note.host === null))
  // Numbers are unique.
  assert.equal(new Set(notes.map((note) => note.n)).size, notes.length)
})

test('no axes shared: the map has no axes, no points and is missing (designed empty state)', () => {
  for (const doc of [illustrativeCompetitorComparison('no_axes'), illustrativeCompetitorComparison('empty')]) {
    const m = map(doc)
    assert.equal(m.axes, null)
    assert.deepEqual(m.points, [])
    assert.deepEqual(m.unplotted, [])
    assert.equal(m.data_state, 'missing')
  }
  assert.equal(map(illustrativeCompetitorComparison('empty')).share_state, 'not_shared')
})

test('withheld file: nothing is drawn, the state is carried', () => {
  const m = map(docFor({ state: 'withheld', reason: 'invalid_record' }))
  assert.equal(m.share_state, 'withheld')
  assert.equal(m.axes, null)
  assert.deepEqual(m.points, [])
})

test('needs review and unknown are never drawn, even for the own brand', () => {
  const landscape = illustrativeLandscape()
  const pos = illustrativePositioning()
  pos.own = { x: { state: 'needs_review', bands: [], sources: [] }, y: pos.own.y }
  pos.competitors = pos.competitors.map((c) => ({ ...c, x: { state: 'unknown', bands: [], sources: [] } }))
  landscape.positioning = pos
  const m = map(docFor({ state: 'shared', landscape }))
  assert.deepEqual(m.points, [])
  assert.equal(m.data_state, 'missing')
  assert.deepEqual(m.unplotted.map((p) => p.kind), ['own_brand', 'competitor', 'competitor', 'competitor'])
  assert.equal(m.unplotted[0]!.x.state, 'needs_review')
})

test('no number is fabricated and no private field travels into the block', () => {
  const m = map(illustrativeCompetitorComparison('complete'))
  for (const point of [...m.points, ...m.unplotted]) {
    for (const placement of [point.x, point.y]) {
      for (const band of placement.bands) assert.ok((POSITION_BANDS as readonly string[]).includes(band), band)
      assert.deepEqual(Object.keys(placement).sort(), ['bands', 'state'])
    }
  }
  const json = JSON.stringify(m)
  assert.doesNotMatch(json, /axis_id|rationale|note_id|claim_key|knowledge:|"score"|"value":\s*\d/)
  assert.doesNotMatch(json, /certified|compliant|conformant|\bISO\b/i)
})

test('positioning catalogs: fa and tr define every key, arrays match, placeholders survive', () => {
  const en = POSITIONING_TEXT.en as unknown as Record<string, unknown>
  for (const lang of VISUAL_LANGS) {
    const cat = POSITIONING_TEXT[lang] as unknown as Record<string, unknown>
    assert.deepEqual(Object.keys(cat).sort(), Object.keys(en).sort(), lang)
    for (const [key, value] of Object.entries(en)) {
      const other = cat[key]
      if (Array.isArray(value)) assert.equal((other as unknown[]).length, value.length, `${lang}.${key}`)
      else if (typeof value === 'string') {
        for (const ph of value.match(/\{[a-z]+\}/g) ?? []) assert.ok((other as string).includes(ph), `${lang}.${key} keeps ${ph}`)
      } else assert.deepEqual(Object.keys(other as object).sort(), Object.keys(value as object).sort(), `${lang}.${key}`)
    }
  }
  assert.equal(POSITIONING_TEXT.fa.title, 'نقشهٔ جایگاه‌یابی')
  assert.equal(POSITIONING_TEXT.en.title, 'Positioning map')
})
