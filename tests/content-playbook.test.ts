import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext } from '@brand-os/brand-core'
import {
  batchConflicts,
  buildContentStrategy,
  CHANNEL_PLAYBOOK,
  deliverableSpec,
  FORMAT_DELIVERABLE,
  listWeeks,
  nextMonday,
  parseBatchItem,
  planBatch,
  playbookDocument,
  playbookProblems,
  runContentTool,
  storeBatch,
  verifyContentDocument,
  type ContentBriefDocument,
  type ScriptDeliverable,
} from '@brand-os/brand-core/content-bridge'
import { approveRevision, CONTENT_CHANNELS, CONTENT_FORMATS, contentDigest, parseProposal, proposeRevision, StrategyError } from '@brand-os/brand-core/strategy'
import { approvedWeek, approveFacts, contentBrand, plannedWeek } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NOW, strategyBrand } from './helpers/strategy.js'

/**
 * Content channel playbook: optional per-channel strategy fields (hash-stable), the general-practice playbook
 * (en/fa/tr) behind `brand:content strategy --playbook`, batch planning by channel and format, and the deliverable spec
 * (camera scripts, carousels, posts, stories, …) in every content brief.
 */
useTestKey()

const FIXTURE = path.resolve(import.meta.dirname, 'fixtures/content-strategy-v1-proposal.json')
/** contentDigest of the fixture, computed on main before the optional channel fields existed. */
const V1_SHA = 'd1cc44482e4583d38eb12bcce0a9a7250f217c8fcf0ac71dbbe0eed156e18c09'
const NEW_KEYS = ['objective', 'audience', 'mix', 'kpis', 'posting_windows', 'rules']

function code(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    if (error instanceof StrategyError) return `${error.code}: ${error.message}`
    throw error
  }
  return 'ok'
}

function raw(): Record<string, unknown> & { content_strategy: { channels: Array<Record<string, unknown>> } } {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
}

const digest = (content: unknown) => contentDigest({ strategy_id: 'content-main', brand_slug: 'pilito', revision: 1, supersedes_revision: null, content: content as never })

test('an approved revision written before the channel fields hashes exactly as before; unset fields stay absent', () => {
  const parsed = parseProposal(raw())
  assert.equal(digest(parsed), V1_SHA, 'old revisions keep their content_sha256')
  for (const channel of parsed.content_strategy!.channels) for (const key of NEW_KEYS) assert.ok(!(key in channel), `${channel.channel} has no ${key} key`)
  // null and empty lists are "not set": still absent, still the same hash.
  const empty = raw()
  Object.assign(empty.content_strategy.channels[0]!, { objective: null, audience: null, mix: [], kpis: [], posting_windows: [], rules: [] })
  assert.equal(digest(parseProposal(empty)), V1_SHA)
})

test('the optional channel fields parse strictly', () => {
  const doc = raw()
  Object.assign(doc.content_strategy.channels[0]!, {
    objective: 'awareness',
    audience: 'Adult beginners who scroll in the evening',
    mix: [
      { type: 'educate', share: 60 },
      { type: 'connect', share: 40 },
    ],
    kpis: [
      { metric: 'saves', target: 40, per: 'post' },
      { metric: 'follows', target: null, per: 'week' },
    ],
    posting_windows: ['tue 19:00-21:00', 'sat 10:00-12:00'],
    rules: ['Every reel has captions on.'],
  })
  const parsed = parseProposal(doc).content_strategy!.channels[0]!
  assert.equal(parsed.objective, 'awareness')
  assert.deepEqual(parsed.kpis, [
    { metric: 'saves', target: 40, per: 'post' },
    { metric: 'follows', target: null, per: 'week' },
  ])
  assert.deepEqual(parsed.posting_windows, ['tue 19:00-21:00', 'sat 10:00-12:00'])
  assert.notEqual(digest(parseProposal(doc)), V1_SHA, 'a set field is part of what the owner approves')

  const bad = (change: Record<string, unknown>) => {
    const d = raw()
    Object.assign(d.content_strategy.channels[0]!, change)
    return code(() => parseProposal(d))
  }
  assert.match(bad({ mix: [{ type: 'educate', share: 60 }, { type: 'promote', share: 30 }] }), /add up to 90/)
  assert.match(bad({ mix: [{ type: 'educate', share: 50 }, { type: 'educate', share: 50 }] }), /twice/)
  assert.match(bad({ mix: [{ type: 'educate', share: 100.5 }] }), /whole percent/)
  assert.match(bad({ objective: 'virality' }), /objective must be one of/)
  assert.match(bad({ kpis: [{ metric: 'likes', target: 1, per: 'post' }] }), /metric must be one of/)
  assert.match(bad({ kpis: [{ metric: 'reach', target: -1, per: 'post' }] }), /negative/)
  assert.match(bad({ kpis: [{ metric: 'reach', target: 1, per: 'day' }] }), /per must be one of/)
  assert.match(bad({ kpis: Array.from({ length: 7 }, (_, i) => ({ metric: ['reach', 'saves', 'shares', 'comments', 'follows', 'leads', 'replies'][i], target: null, per: 'post' })) }), /more than 6/)
  assert.match(bad({ kpis: [{ metric: 'reach', target: 1, per: 'post', source: 'x' }] }), /unknown field/)
  assert.match(bad({ posting_windows: Array.from({ length: 8 }, (_, i) => `day ${i}`) }), /more than 7/)
  assert.match(bad({ rules: Array.from({ length: 11 }, (_, i) => `Rule ${i}`) }), /more than 10/)
  assert.match(bad({ audience: 'x'.repeat(201) }), /longer than 200/)
  assert.match(bad({ rules: ['Spend 500 EUR on boosts'] }), /refused|restricted/)
  assert.match(bad({ cadence_note: 'often' }), /unknown field/)
})

test('the playbook is general practice in en, fa and tr, with no targets and no authority', () => {
  assert.deepEqual(playbookProblems(), [])
  for (const channel of ['instagram', 'linkedin', 'x', 'tiktok', 'youtube', 'threads', 'telegram', 'facebook', 'pinterest', 'newsletter', 'blog'] as const) {
    const entry = CHANNEL_PLAYBOOK[channel]
    assert.ok(entry, `${channel} has an entry`)
    assert.equal(entry.basis, 'general_practice')
    for (const text of [entry.role, entry.posting_windows_note, ...entry.craft]) {
      assert.ok(text.en && text.fa && text.tr, `${channel}: every text in en/fa/tr`)
      assert.notEqual(text.fa, text.en)
      assert.notEqual(text.tr, text.en)
      assert.match(text.fa, /[؀-ۿ]/, `${channel}: Persian is Persian`)
    }
    for (const format of entry.formats) assert.ok((CONTENT_FORMATS as readonly string[]).includes(format))
  }
  const doc = playbookDocument('fa', 'instagram')
  assert.deepEqual(doc.authorizes, [])
  assert.equal(doc.entries.length, 1)
  assert.ok(doc.entries[0]!.kpis.every((k) => k.target === null), 'the playbook never sets a target')
  assert.match(doc.notice[0]!, /اندازه‌گیری نشده/)
  assert.match(playbookDocument('en').notice[0]!, /not measured for this brand/)
  assert.match(playbookDocument('tr').notice[0]!, /ölçülmemiştir/)
  assert.match(code(() => playbookDocument('en', 'website')), /not_found: The playbook has no entry for website/)
})

test('strategy --playbook fills role, formats, cadence, objective, mix and KPI names; explicit values win; the owner still reviews', async () => {
  const s = await strategyBrand('pilito')
  approveFacts(s, [
    ['brand.verbal.voice', 'Warm and plain.'],
    ['business.marketing.pillars', 'Learning stories; Product proof'],
    ['business.marketing.channels', 'Instagram and LinkedIn'],
  ])
  const plain = buildContentStrategy(s.ws, { lang: 'en', channels: ['instagram', 'linkedin', 'website'] })
  assert.ok(plain.gaps.some((g) => g.field === 'channels[instagram].role'))
  assert.deepEqual(plain.proposal.assumptions, [])
  for (const channel of plain.block.channels) for (const key of NEW_KEYS) assert.ok(!(key in channel), 'no playbook, no new keys')

  const draft = buildContentStrategy(s.ws, { lang: 'fa', channels: ['instagram', 'linkedin', 'website'], playbook: true, formats: { linkedin: ['post'] } })
  const insta = draft.block.channels.find((c) => c.channel === 'instagram')!
  assert.equal(insta.role, CHANNEL_PLAYBOOK.instagram!.role.fa)
  assert.deepEqual(insta.formats, CHANNEL_PLAYBOOK.instagram!.formats)
  assert.deepEqual(insta.cadence, { per: 'week', target: 3 })
  assert.equal(insta.objective, 'awareness')
  assert.equal(insta.mix!.reduce((sum, m) => sum + m.share, 0), 100)
  assert.ok(insta.kpis!.every((k) => k.target === null))
  const linkedin = draft.block.channels.find((c) => c.channel === 'linkedin')!
  assert.deepEqual(linkedin.formats, ['post'], 'explicit --formats wins over the playbook')
  for (const field of ['role', 'formats', 'cadence']) {
    assert.ok(!draft.gaps.some((g) => g.field === `channels[instagram].${field}`), `instagram ${field} is no longer a gap`)
    assert.ok(draft.gaps.some((g) => g.field === `channels[website].${field}`), `website ${field} stays an owner decision`)
  }
  assert.ok(draft.notes.some((n) => n.startsWith('instagram:') && n.includes('راهنمای کانال‌ها')), 'notes say which values came from the playbook')
  assert.ok(draft.notes.some((n) => n.startsWith('linkedin:') && !n.includes('formats')))
  assert.ok(draft.notes.some((n) => n.startsWith('website:')))
  assert.equal((draft.proposal.assumptions as string[]).length, 1, 'the approved revision itself records that the plan starts from general practice')
  assert.doesNotThrow(() => parseProposal(draft.proposal))
  // The proposal is still only a proposal: stored as a draft, served only after the owner approves it.
  const rev = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: draft.proposal }).revision
  approveRevision(s.ws, { strategy_id: 'content-main', revision: rev.revision, expected_sha256: rev.content_sha256, proof: s.proof })
})

test('batch: N slots per channel and format, dated by the approved cadence, grouped into weeks, stored only into empty weeks', async () => {
  const s = await contentBrand()
  assert.equal(nextMonday(NOW), '2026-11-30', 'NOW is a Monday; the default is the next one')
  assert.deepEqual(parseBatchItem('instagram:reel:10'), { channel: 'instagram', format: 'reel', count: 10 })
  for (const bad of ['instagram:reel:51', 'instagram:reel:0', 'myspace:reel:2', 'instagram:gif:2', 'instagram:reel']) assert.match(code(() => parseBatchItem(bad)), /invalid_input/, bad)

  const result = planBatch(s.ws, {
    lang: 'en',
    items: [
      { channel: 'instagram', format: 'reel', count: 10 },
      { channel: 'instagram', format: 'carousel', count: 4 },
      { channel: 'newsletter', format: 'email', count: 2 },
    ],
  })
  assert.equal(result.from, '2026-11-30')
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content')), 'planning writes nothing')
  const slots = result.weeks.flatMap((w) => w.content.slots)
  const of = (channel: string, format: string) => slots.filter((slot) => slot.channel === channel && slot.format === format).length
  assert.deepEqual([of('instagram', 'reel'), of('instagram', 'carousel'), of('newsletter', 'email')], [10, 4, 2])
  assert.deepEqual(result.items.map((i) => i.planned), [10, 4, 2])
  // Instagram is 3/week, so 14 slots need 5 weeks; formats take turns while both have slots left.
  assert.equal(result.weeks.filter((w) => w.content.slots.some((slot) => slot.channel === 'instagram')).length, 5)
  for (const week of result.weeks) assert.ok(week.content.slots.filter((slot) => slot.channel === 'instagram').length <= 3)
  const instaFormats = slots.filter((slot) => slot.channel === 'instagram').map((slot) => slot.format)
  assert.deepEqual(instaFormats.slice(0, 8), ['reel', 'carousel', 'reel', 'carousel', 'reel', 'carousel', 'reel', 'carousel'])
  for (const week of result.weeks) {
    assert.ok(week.content.slots.every((slot) => slot.date >= week.content.week_start && slot.date <= week.content.week_end))
    assert.deepEqual(week.content.slots.map((slot) => slot.id), week.content.slots.map((_, i) => `s${String(i + 1).padStart(2, '0')}`))
    assert.ok(week.content.slots.every((slot) => slot.hook === null && slot.fact_refs.length + slot.objective.length > 0), 'no copy, every slot cites a fact')
  }
  assert.deepEqual(planBatch(s.ws, { lang: 'en', items: [{ channel: 'instagram', format: 'reel', count: 10 }, { channel: 'instagram', format: 'carousel', count: 4 }, { channel: 'newsletter', format: 'email', count: 2 }] }), result, 'deterministic')

  // --from mid-week drops earlier days; --pillar narrows every slot.
  const mid = planBatch(s.ws, { lang: 'en', from: '2026-12-02', pillar: 'p2', items: [{ channel: 'instagram', format: 'reel', count: 2 }] })
  assert.ok(mid.weeks[0]!.content.slots.every((slot) => slot.date >= '2026-12-02' && slot.pillar === 'p2'))

  // The batch never widens the approved strategy.
  assert.match(code(() => planBatch(s.ws, { lang: 'en', items: [{ channel: 'linkedin', format: 'post', count: 2 }] })), /no approved cadence/)
  assert.match(code(() => planBatch(s.ws, { lang: 'en', items: [{ channel: 'instagram', format: 'post', count: 2 }] })), /not an approved format for instagram/)
  assert.match(code(() => planBatch(s.ws, { lang: 'fa', items: [{ channel: 'x', format: 'post', count: 2 }] })), /در استراتژی محتوای تأییدشده نیست/)
  assert.match(code(() => planBatch(s.ws, { lang: 'en', pillar: 'p9', items: [{ channel: 'instagram', format: 'reel', count: 2 }] })), /Pillar p9/)
  assert.match(code(() => planBatch(s.ws, { lang: 'en', items: [{ channel: 'instagram', format: 'reel', count: 51 }] })), /1 to 50/)
  assert.match(code(() => planBatch(s.ws, { lang: 'en', items: [{ channel: 'instagram', format: 'reel', count: 1 }, { channel: 'instagram', format: 'reel', count: 2 }] })), /twice/)

  // Store: every week becomes a draft; a second batch into the same weeks is refused and writes nothing.
  const stored = storeBatch(s.ws, result, 'en')
  assert.equal(stored.length, result.weeks.length)
  assert.ok(stored.every((week) => week.revision === 1))
  const before = JSON.stringify(listWeeks(s.ws))
  assert.match(code(() => storeBatch(s.ws, result, 'en')), /^exists: Nothing was stored: wk-2026-11-30 \(r1 draft\)/)
  assert.equal(JSON.stringify(listWeeks(s.ws)), before, 'a refused batch writes nothing')
  assert.equal(batchConflicts(s.ws, ['wk-2027-06-07']).length, 0)
})

test('briefs carry a deliverable spec: camera script, carousel, post, story, thread, article, email; no copy', async () => {
  for (const format of CONTENT_FORMATS) {
    const spec = deliverableSpec({ format, channel: 'instagram', language: 'en', lang: 'en' })!
    assert.equal(spec.kind, FORMAT_DELIVERABLE[format])
    assert.equal(spec.basis, 'general_practice')
    assert.match(spec.notice, /not measured for this brand/)
    const values = JSON.stringify(spec.template).match(/:"[^"]+"/g) ?? []
    assert.ok(values.every((v) => /^:"(hook|value|recap|cta|context|interaction|first|point)"$/.test(v)), `${format}: the template holds roles only, no copy (${values.join(' ')})`)
  }
  assert.equal(deliverableSpec({ format: null, channel: 'instagram', language: 'en', lang: 'en' }), null)
  const reel = deliverableSpec({ format: 'reel', channel: 'instagram', language: 'fa', lang: 'fa' }) as ScriptDeliverable
  assert.deepEqual(reel.parts.map((p) => p.id), ['hook', 'setup', 'beats', 'payoff', 'cta', 'caption'])
  assert.deepEqual(reel.parts[0]!.seconds, { from: 0, to: 3 })
  assert.deepEqual(reel.parts[2]!.count, { min: 3, max: 5 })
  assert.deepEqual(reel.production_options, ['talking_head', 'voiceover', 'text_on_screen'])
  assert.equal(reel.captions_on, true)
  assert.equal(reel.read_aloud.words_per_second, 2.2)
  assert.ok(reel.read_aloud.words.max > reel.read_aloud.words.min)
  assert.equal(reel.parts[0]!.label, 'قلاب')
  assert.ok(reel.delivery_notes.some((n) => n.includes('لنز')))
  const tr = deliverableSpec({ format: 'video', channel: 'youtube', language: 'tr', lang: 'tr' }) as ScriptDeliverable
  assert.deepEqual(tr.duration_seconds, { min: 300, max: 900 })
  assert.equal(tr.read_aloud.words_per_second, 1.9)
  assert.equal(tr.parts[0]!.label, 'Kanca')
  const story = deliverableSpec({ format: 'story', channel: 'instagram', language: 'en', lang: 'en' })!
  assert.ok(story.kind === 'story' && story.frames.min === 3 && story.frames.max === 7 && story.interaction_options.includes('poll'))

  // Through the real agent tool: the brief carries the spec and its digest still verifies.
  const s = await contentBrand()
  const week = plannedWeek(s, '2026-11-23')
  const pin = approvedWeek(s, week)
  const reelSlot = week.slots.find((slot) => slot.format === 'reel')!
  const got = runContentTool(s.root, s.ws.brandSlug, agentTokenContext('pilito', 'agt_content', 'content-read'), 'content_brief', { week_id: week.week_id, slot_id: reelSlot.id, pin: { revision: pin.revision, content_sha256: pin.sha }, lang: 'fa' }, NOW)
  assert.equal(got.status, 'ok')
  const brief = got.data as ContentBriefDocument
  assert.equal(brief.deliverable!.kind, 'script')
  assert.equal((brief.deliverable as ScriptDeliverable).read_aloud.language, reelSlot.language)
  assert.ok(verifyContentDocument(brief))
  assert.deepEqual(brief.authorizes, [])
  assert.deepEqual(Object.keys(brief.channel_plan!).sort(), ['cadence', 'formats', 'role'], 'a strategy without channel extras adds no keys to the plan')
  assert.ok(CONTENT_CHANNELS.length > 0)
})

const repo = path.resolve(import.meta.dirname, '..')

function cli(root: string, script: 'content' | 'strategy', args: string[], env: Record<string, string | undefined> = {}) {
  const merged: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off', BRAND_OS_AGENT_TOKEN: undefined, BRAND_OS_APPROVAL_PROOF: undefined, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(path.join(repo, 'node_modules/.bin/tsx'), [path.join(repo, 'scripts', `${script}.ts`), ...args], { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

test('CLI: playbook in en/fa/tr, strategy --playbook, batch preview, store, and a refused second store', async () => {
  const s = await strategyBrand('pilito', new Date())
  const fa = cli(s.root, 'content', ['playbook', '--channel', 'instagram', '--lang', 'fa'])
  assert.equal(fa.status, 0, fa.stderr)
  assert.match(fa.stdout, /راهنمای کانال‌ها/)
  assert.match(cli(s.root, 'content', ['playbook', '--lang', 'tr']).stdout, /Kanal rehberi/)
  const all = cli(s.root, 'content', ['playbook', '--json'])
  assert.equal((all.json.entries as unknown[]).length, 11)
  assert.deepEqual(all.json.authorizes, [])
  assert.equal(cli(s.root, 'content', ['playbook', '--channel', 'website']).status, 1)

  approveFacts(s, [
    ['brand.verbal.voice', 'Warm and plain.'],
    ['brand.strategy.promise', 'Speak from day one'],
    ['business.marketing.pillars', 'Learning stories; Product proof'],
    ['business.marketing.channels', 'Instagram and LinkedIn'],
  ])
  const strategy = cli(s.root, 'content', ['strategy', '--playbook', '--cadence', 'linkedin=2/week', '--store', '--json'])
  assert.equal(strategy.status, 0, strategy.stdout + strategy.stderr)
  const proposal = strategy.json.proposal as { content_strategy: { channels: Array<{ channel: string; cadence: unknown; objective?: string }> } }
  assert.deepEqual(proposal.content_strategy.channels.find((c) => c.channel === 'linkedin')!.cadence, { per: 'week', target: 2 })
  assert.equal(proposal.content_strategy.channels.find((c) => c.channel === 'instagram')!.objective, 'awareness')
  const sha = (strategy.json.stored as { content_sha256: string }).content_sha256
  // Not served until the owner approves it.
  assert.equal(cli(s.root, 'content', ['batch', '--channel', 'instagram', '--format', 'reel', '--count', '4']).status, 1)
  assert.equal(cli(s.root, 'strategy', ['approve', '--id', 'content-main', '--revision', '1', '--expect-sha', sha], { BRAND_OS_APPROVAL_PROOF: s.proof }).status, 0)

  const preview = cli(s.root, 'content', ['batch', '--item', 'instagram:reel:4', '--item', 'linkedin:post:3', '--lang', 'fa'])
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /دستهٔ پیش‌نویس/)
  assert.ok(!fs.existsSync(path.join(s.root, 'brand/.private/content')), 'a preview writes nothing')
  assert.equal(cli(s.root, 'content', ['batch', '--channel', 'instagram', '--count', '4']).status, 2, '--channel without --format is a usage error')

  const stored = cli(s.root, 'content', ['batch', '--item', 'instagram:reel:4', '--item', 'linkedin:post:3', '--store', '--json'])
  assert.equal(stored.status, 0, stored.stdout + stored.stderr)
  assert.ok((stored.json.stored as unknown[]).length >= 2)
  const again = cli(s.root, 'content', ['batch', '--item', 'instagram:reel:4', '--store'])
  assert.equal(again.status, 1)
  assert.match(again.stderr, /exists: Nothing was stored/)
  assert.match(cli(s.root, 'content', ['batch', '--item', 'instagram:reel:4']).stdout, /--store would refuse/)
})
