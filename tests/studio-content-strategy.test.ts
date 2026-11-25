import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { buildContentStrategy, buildStudioStrategy, shareStrategy, type SharedContentStrategy } from '@brand-os/brand-core/content-bridge'
import { approveRevision, proposeRevision } from '@brand-os/brand-core/strategy'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { approveFacts, AUDIENCE, BUDGET_FACT_CANARY, OFFER, PROMISE, VOICE } from './helpers/content.js'
import { DRAFT_CANARY, strategyBrand, type StrategyBrand } from './helpers/strategy.js'
import { useTestKey } from './helpers/knowledge.js'

// Restricted fixture facts are encrypted at rest; the Studio CI job sets no data key of its own.
useTestKey()

/**
 * The read-only Studio "Content strategy" page. Only the approved, served content strategy revision the owner shared
 * with `brand:content share-strategy` and merged reaches Studio: channels (role, objective, audience, formats,
 * cadence, mix, KPIs, windows, rules), pillars, languages, validity and the revision pin. Never a draft, a restricted
 * value or a resolved fact value.
 */

const ROLE_CANARY = 'Short lessons <script>alert(1)</script> for beginners'

async function sharedStrategyBrand(slug: string): Promise<StrategyBrand> {
  const s = await strategyBrand(slug)
  approveFacts(s, [
    ['brand.verbal.voice', VOICE],
    ['brand.verbal.forbidden', 'Guaranteed fluency; Fake awards'],
    ['business.marketing.availability_claim', 'do-not-claim'],
    ['business.customer.primary_segment', AUDIENCE],
    ['brand.strategy.promise', PROMISE],
    ['business.offer.summary', OFFER],
    ['business.marketing.pillars', 'Learning stories; Product proof'],
    ['business.marketing.channels', 'Instagram and LinkedIn.'],
    ['business.marketing.budget', BUDGET_FACT_CANARY],
  ])
  const draft = buildContentStrategy(s.ws, {
    lang: 'en',
    channels: ['instagram', 'linkedin'],
    cadence: { instagram: { per: 'week', target: 3 } },
    formats: { instagram: ['reel', 'carousel'] },
    languages: ['en', 'fa'],
    playbook: true,
  })
  const block = { ...draft.block, channels: draft.block.channels.map((c) => (c.channel === 'instagram' ? { ...c, role: ROLE_CANARY, posting_windows: ['tue 19:00-21:00'], rules: ['One idea per reel'] } : c)) }
  const rev = proposeRevision(s.ws, { strategy_id: 'content-main', proposal: { ...draft.proposal, content_strategy: block } }).revision
  approveRevision(s.ws, { strategy_id: 'content-main', revision: rev.revision, expected_sha256: rev.content_sha256, proof: s.proof })
  // A later draft revision is never shared.
  proposeRevision(s.ws, { strategy_id: 'content-main', proposal: { ...draft.proposal, content_strategy: { ...block, channels: block.channels.map((c) => ({ ...c, role: DRAFT_CANARY })) } } })
  return s
}

test('share-strategy writes the approved served revision only: no drafts, restricted values or fact values; owner only', async () => {
  const s = await sharedStrategyBrand('acme-strategy')
  const preview = shareStrategy(s.ws, { strategy_id: 'content-main', dryRun: true })
  assert.equal(preview.written, false)
  assert.equal(fs.existsSync(path.join(s.root, preview.path)), false, 'a dry run writes nothing')
  const result = shareStrategy(s.ws, { strategy_id: 'content-main', dryRun: false })
  assert.equal(result.path, 'brand/content-strategy/shared/content-main.json')
  const text = fs.readFileSync(path.join(s.root, result.path), 'utf8')
  const doc = JSON.parse(text) as SharedContentStrategy
  assert.equal(doc.revision, 1)
  assert.match(doc.content_sha256, /^[0-9a-f]{64}$/)
  const instagram = doc.channels.find((c) => c.channel === 'instagram')!
  assert.equal(instagram.role, ROLE_CANARY)
  assert.deepEqual(instagram.cadence, { per: 'week', target: 3 })
  assert.ok(instagram.mix?.length && instagram.mix.reduce((sum, m) => sum + m.share, 0) === 100, 'the playbook mix is kept')
  assert.ok(instagram.kpis?.length)
  assert.deepEqual(instagram.posting_windows, ['tue 19:00-21:00'])
  for (const canary of [DRAFT_CANARY, BUDGET_FACT_CANARY, VOICE, PROMISE, OFFER, 'restricted', 'seal', 'event_id']) assert.equal(text.includes(canary), false, canary)

  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test'
  try {
    assert.throws(() => shareStrategy(s.ws, { strategy_id: 'content-main', dryRun: true }), /BRAND_OS_AGENT_TOKEN|owner/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.throws(() => shareStrategy(s.ws, { strategy_id: 'content-other', dryRun: true }), /No approved revision/)
})

test('Studio path filter and buildStudioStrategy: only valid, same-brand, safe shared strategies; the rest withheld by reason', async () => {
  assert.equal(studioPathAllowed('brand/content-strategy/shared/content-main.json'), true)
  for (const rel of ['brand/content-strategy/shared/README.md', 'brand/content-strategy/shared/a/content-main.json', 'brand/content-strategy/drafts/content-main.json', 'brand/Content-Strategy/shared/content-main.json', 'brand/.private/strategy/records/content-main.json']) {
    assert.equal(studioPathAllowed(rel), false, rel)
  }
  const s = await sharedStrategyBrand('acme-filter')
  const good = shareStrategy(s.ws, { strategy_id: 'content-main', dryRun: true }).strategy
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-studio-'))
  assert.deepEqual(buildStudioStrategy(root, 'acme-filter'), { strategies: [], withheld: [], total: 0 })
  const dir = path.join(root, 'brand/content-strategy/shared')
  fs.mkdirSync(dir, { recursive: true })
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))
  write('content-main.json', good)
  write('content-extra.json', { ...good, strategy_id: 'content-extra', EXTRA_FIELD_CANARY: 1 })
  write('content-beta.json', { ...good, strategy_id: 'content-beta', brand_slug: 'beta' })
  write('content-misnamed.json', { ...good, strategy_id: 'content-other' })
  write('content-broken.json', '{not json')
  write('content-unsafe.json', { ...good, strategy_id: 'content-unsafe', channels: [{ ...good.channels[0]!, role: `token ghp_${'A1b2C3d4E5'.repeat(4)}` }] })
  write('notes.md', 'x')
  fs.symlinkSync(path.join(dir, 'content-main.json'), path.join(dir, 'content-link.json'))
  const p = buildStudioStrategy(root, 'acme-filter')
  assert.deepEqual(p.strategies.map((item) => item.strategy_id), ['content-main'])
  assert.equal(JSON.stringify(p).includes('EXTRA_FIELD_CANARY'), false)
  assert.deepEqual(Object.fromEntries(p.withheld.map((w) => [path.basename(w.path), w.reason])), {
    'content-beta.json': 'wrong_brand',
    'content-broken.json': 'unreadable',
    'content-extra.json': 'invalid_record',
    'content-link.json': 'symlink',
    'content-misnamed.json': 'filename_mismatch',
    'content-unsafe.json': 'unsafe_text',
    'notes.md': 'unexpected_file',
  })
})

test('Studio: the Content strategy page is hidden without a shared strategy and shows it read-only in en and fa', async () => {
  const { startStudio, Client } = await import('./helpers/studio-server.js')
  const { OWNER } = await import('./helpers/studio.js')
  const source = await sharedStrategyBrand('acme-learning')
  const shared = Buffer.from(JSON.stringify(shareStrategy(source.ws, { strategy_id: 'content-main', dryRun: true }).strategy))
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    const empty = await owner.page('/brands/acme-learning/market/content-strategy')
    assert.equal(empty.res.status, 200)
    assert.match(empty.text, /No shared content strategy on this commit/)
    assert.equal((await owner.page('/brands/acme-learning')).text.includes('href="/brands/acme-learning/market/content-strategy"'), false, 'no nav entry before anything is shared')

    s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      tree.set('brand/content-strategy/shared/content-main.json', shared)
      tree.set('brand/.private/strategy/records/content-main.json', Buffer.from('{"PRIVATE-STRATEGY-CANARY":1}'))
      tree.set('brand/content-strategy/drafts/content-main.json', Buffer.from('{"DRAFT-STRATEGY-CANARY":1}'))
    })
    await s.studio.sync.refresh('acme-learning')

    const page = await owner.page('/brands/acme-learning/market/content-strategy')
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Owner-approved/)
    assert.match(page.text, /It authorizes nothing/)
    assert.match(page.text, /Short lessons &lt;script&gt;alert\(1\)&lt;\/script&gt; for beginners/)
    assert.equal(page.text.includes('<script>alert'), false, 'owner text is escaped')
    assert.match(page.text, /class="mix-bar"/, 'the mix is a bar')
    assert.match(page.text, /KPIs \(owner targets\)/)
    assert.match(page.text, /tue 19:00-21:00/)
    assert.match(page.text, /Learning stories/)
    assert.match(page.text, /r1 [0-9a-f]{12}/, 'the revision pin is shown')
    assert.match((await owner.page('/brands/acme-learning')).text, /href="\/brands\/acme-learning\/market\/content-strategy"/, 'nav entry once shared')
    const state = fs.readFileSync(path.join(s.config.dataDir, 'cache', 'acme-learning', 'state.json'), 'utf8')
    for (const canary of ['PRIVATE-STRATEGY-CANARY', 'DRAFT-STRATEGY-CANARY', DRAFT_CANARY, BUDGET_FACT_CANARY]) assert.equal(`${page.text}\n${state}`.includes(canary), false, canary)
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await owner.request(method, '/brands/acme-learning/market/content-strategy', { form: { _csrf: 'x' } })
      assert.ok([404, 405].includes(res.status), `${method} ${res.status}`)
    }
    await owner.get('/brands/acme-learning/market/content-strategy?lang=fa')
    const fa = await owner.page('/brands/acme-learning/market/content-strategy')
    assert.match(fa.text, /dir="rtl"/)
    assert.match(fa.text, /راهبرد محتوا/)
    assert.match(fa.text, /ترکیب محتوا/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the strategy and social kit projections existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: Record<string, unknown> }
  assert.ok(state.projection.strategy)
  delete state.projection.strategy
  delete state.projection.socialKit
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.strategy, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.deepEqual(after.projection!.strategy, { strategies: [], withheld: [], total: 0 })
  assert.equal(after.projection!.socialKit, null)
})
