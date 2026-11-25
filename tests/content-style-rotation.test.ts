import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderedSlots, slotStyleIndex } from '../packages/brand-core/src/content-bridge/agent.js'
import type { ContentSlot } from '../packages/brand-core/src/content-bridge/calendar-model.js'
import { rotateStyles } from '../packages/brand-core/src/social-kit/rotation.js'

const slot = (id: string, date: string, format = 'post', channel = 'instagram'): ContentSlot => ({ id, date, format, channel } as unknown as ContentSlot)

test('style rotation: consecutive slots of one format use different approved siblings, across weeks too', () => {
  const styles = ['post.a', 'post.b', 'post.c', 'post.d']
  const week1 = [slot('s01', '2026-11-30'), slot('s02', '2026-12-02'), slot('s03', '2026-12-04'), slot('s04', '2026-12-02', 'reel')]
  const week2 = [slot('s01', '2026-12-07'), slot('s02', '2026-12-09'), slot('s03', '2026-12-11')]
  const picked = [...week1.filter((s) => s.format === 'post').map((s) => rotateStyles(styles, slotStyleIndex(week1, s))), ...week2.map((s) => rotateStyles(styles, slotStyleIndex(week2, s)))]
  for (let i = 1; i < picked.length; i++) assert.notEqual(picked[i], picked[i - 1], `slot ${i} repeats the layout of slot ${i - 1}`)
  assert.equal(new Set(picked.slice(0, 4)).size, 4, 'four consecutive posts use all four siblings')
  // The reel in week 1 counts on its own: the first reel of the week starts the reel rotation for that week.
  assert.equal(slotStyleIndex(week1, week1[3]!) % 1, 0)
  assert.equal(rotateStyles([], 3), null, 'no approved style → null, never a guess')
})

test('style rotation across the approved calendar: uneven weeks never repeat a layout at the week boundary', () => {
  const styles = ['post.a', 'post.b', 'post.c', 'post.d']
  const weeks = [
    { week_id: 'wk-2026-11-30', slots: [slot('s01', '2026-11-30', 'reel'), slot('s03', '2026-12-01')] },
    { week_id: 'wk-2026-12-07', slots: [slot('s01', '2026-12-07'), slot('s02', '2026-12-09'), slot('s03', '2026-12-09', 'reel')] },
    { week_id: 'wk-2026-12-14', slots: [slot('s02', '2026-12-15')] },
  ]
  const order = orderedSlots(weeks, 'instagram', 'post')
  assert.deepEqual(order.map((item) => `${item.week_id}/${item.slot_id}`), ['wk-2026-11-30/s03', 'wk-2026-12-07/s01', 'wk-2026-12-07/s02', 'wk-2026-12-14/s02'])
  const picked = order.map((_, index) => rotateStyles(styles, index))
  assert.deepEqual(picked, styles, 'four consecutive posts over three weeks use the four siblings in order')
})
