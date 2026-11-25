import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import YAML from 'yaml'
import { ensureApprovalSecret, generateTokens, InterviewEngine, openWorkspace } from '@brand-os/brand-core'
import { approveKit, buildStudioSocialKit, initKit, reviewKit, SHARED_SOCIAL_APPROVALS_FILE, shareKitApprovals, SOCIAL_KIT_FILE } from '@brand-os/brand-core/social-kit'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { brandDir } from './helpers/knowledge.js'

/**
 * The read-only Studio "Social style kit" page. Studio reads the committed kit and the public approval summary the
 * owner wrote with `brand:social kit share` (never the private seals). A style shows as approved only when its content
 * digest matches that summary; a hand edit shows as not verified. Fonts name the brand family per page language.
 */

const SCALE = 'display-fa: Shams, Tahoma, sans-serif; body-fa: Yekan, Tahoma, sans-serif; display-en: Rajdhani, Arial, sans-serif; body-en: Inter, system-ui, sans-serif'

function kitBrand(slug: string) {
  const root = brandDir({ slug, mutate: (config) => ((config.brand as Record<string, unknown>).default_locale = 'fa') })
  const proof = ensureApprovalSecret(root)
  const engine = new InterviewEngine(root)
  assert.equal(engine.changeAnswer('brand.type.scale', SCALE).kind, 'recorded')
  assert.equal(engine.approve('brand.type.scale', 'owner', proof).kind, 'recorded')
  generateTokens(root, slug)
  const ws = openWorkspace(root)
  initKit(ws, { surfaces: ['post', 'reel_cover'] })
  const review = reviewKit(ws, { surface: 'post' })
  approveKit(ws, { surface: 'post', expected_sha256: review.expect_sha!, proof })
  return { root, ws, proof }
}

const read = (root: string, rel: string) => fs.readFileSync(path.join(root, rel))

test('kit share writes a public summary (ids, digests, times; no seals or secrets) and is owner only', () => {
  const s = kitBrand('kit-share')
  const preview = shareKitApprovals(s.ws, { dryRun: true })
  assert.equal(fs.existsSync(path.join(s.root, SHARED_SOCIAL_APPROVALS_FILE)), false, 'a dry run writes nothing')
  assert.equal(preview.summary.styles.length, 4)
  const result = shareKitApprovals(s.ws, { dryRun: false })
  const text = read(s.root, result.path).toString('utf8')
  const doc = JSON.parse(text) as Record<string, unknown>
  assert.deepEqual(Object.keys(doc).sort(), ['brand_slug', 'kind', 'schema_version', 'shared_at', 'styles'])
  assert.deepEqual(Object.keys((doc.styles as Array<Record<string, unknown>>)[0]!).sort(), ['approved_at', 'digest', 'style_id'])
  const seals = JSON.parse(read(s.root, 'brand/.private/social/approvals.json').toString('utf8')) as { approvals: Record<string, { seal: string; event_id: string }> }
  for (const record of Object.values(seals.approvals)) {
    assert.equal(text.includes(record.seal), false, 'no seal')
    assert.equal(text.includes(record.event_id), false, 'no event id')
  }
  assert.equal(text.includes(s.proof), false, 'no approval secret')
  assert.ok(!text.includes('reel_cover.'), 'drafts are not listed')

  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test'
  try {
    assert.throws(() => shareKitApprovals(s.ws, { dryRun: true }), /BRAND_OS_AGENT_TOKEN/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('buildStudioSocialKit: approved only with a matching shared digest; hand edits and unshared approvals are not verified', () => {
  assert.equal(studioPathAllowed('brand/social/style-kit.yaml'), true)
  assert.equal(studioPathAllowed('brand/social/shared/approvals.json'), true)
  for (const rel of ['brand/social/notes.md', 'brand/social/shared/other.json', 'brand/Social/style-kit.yaml', 'brand/.private/social/approvals.json']) assert.equal(studioPathAllowed(rel), false, rel)

  const s = kitBrand('kit-studio')
  const plain = brandDir({ slug: 'kit-none' })
  assert.equal(buildStudioSocialKit(plain, 'kit-none'), null, 'no kit, no summary: nothing to show')

  // Approved in the YAML but nothing shared yet: Studio cannot verify, so not approved.
  let p = buildStudioSocialKit(s.root, 'kit-studio')!
  assert.equal(p.state, 'ok')
  assert.deepEqual(p.counts, { approved: 0, not_verified: 4, draft: 4, rejected: 0 })
  assert.ok(p.styles.filter((item) => item.status === 'not_verified').every((item) => item.reason === 'not_shared'))

  shareKitApprovals(s.ws, { dryRun: false })
  p = buildStudioSocialKit(s.root, 'kit-studio')!
  assert.deepEqual(p.counts, { approved: 4, not_verified: 0, draft: 4, rejected: 0 })
  assert.equal(p.tokens?.fonts.fa['type.fontFamily.display']?.token, 'type.fontFamily.display-fa')
  assert.equal(p.tokens?.fonts.fa['type.fontFamily.display']?.family, 'Shams')
  assert.equal(p.tokens?.fonts.en['type.fontFamily.display']?.family, 'Rajdhani')
  assert.equal(p.tokens?.fonts.en['type.fontFamily.display']?.state, 'draft')

  // A hand edit of an approved style: its digest no longer matches the summary.
  const file = path.join(s.root, SOCIAL_KIT_FILE)
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
  doc.setIn(['styles', 0, 'layers', 2, 'max_words'], 40)
  fs.writeFileSync(file, doc.toString())
  p = buildStudioSocialKit(s.root, 'kit-studio')!
  const edited = p.styles.find((item) => item.style.id === 'post.bold-statement')!
  assert.equal(edited.status, 'not_verified')
  assert.equal(edited.reason, 'edited_after_approval')
  assert.equal(p.counts.approved, 3)

  // A summary from another brand is withheld, never used.
  const summary = JSON.parse(read(s.root, SHARED_SOCIAL_APPROVALS_FILE).toString('utf8')) as Record<string, unknown>
  fs.writeFileSync(path.join(s.root, SHARED_SOCIAL_APPROVALS_FILE), JSON.stringify({ ...summary, brand_slug: 'other' }))
  p = buildStudioSocialKit(s.root, 'kit-studio')!
  assert.deepEqual(p.withheld, [{ path: SHARED_SOCIAL_APPROVALS_FILE, reason: 'wrong_brand' }])
  assert.equal(p.counts.approved, 0)
  // An extra field (a seal pasted by hand) makes the summary invalid.
  fs.writeFileSync(path.join(s.root, SHARED_SOCIAL_APPROVALS_FILE), JSON.stringify({ ...summary, seal: 'x' }))
  assert.deepEqual(buildStudioSocialKit(s.root, 'kit-studio')!.withheld, [{ path: SHARED_SOCIAL_APPROVALS_FILE, reason: 'invalid_record' }])
})

test('Studio: the Social style kit page is hidden without a kit and shows wireframes, badges and fonts read-only in en and fa', async () => {
  const { startStudio, Client } = await import('./helpers/studio-server.js')
  const { OWNER } = await import('./helpers/studio.js')
  const source = kitBrand('acme-learning')
  shareKitApprovals(source.ws, { dryRun: false })
  const seals = read(source.root, 'brand/.private/social/approvals.json')
  const sealValues = Object.values((JSON.parse(seals.toString('utf8')) as { approvals: Record<string, { seal: string }> }).approvals).map((record) => record.seal)
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    const empty = await owner.page('/brands/acme-learning/market/social-style-kit')
    assert.equal(empty.res.status, 200)
    assert.match(empty.text, /No social style kit on this commit/)
    assert.equal((await owner.page('/brands/acme-learning')).text.includes('href="/brands/acme-learning/market/social-style-kit"'), false, 'no nav entry without a kit')

    s.github.pushEdit(OWNER, 'acme-learning', (tree) => {
      tree.set(SOCIAL_KIT_FILE, read(source.root, SOCIAL_KIT_FILE))
      tree.set(SHARED_SOCIAL_APPROVALS_FILE, read(source.root, SHARED_SOCIAL_APPROVALS_FILE))
      tree.set('brand/tokens/generated/typography.tokens.json', read(source.root, 'brand/tokens/generated/typography.tokens.json'))
      // Committed by mistake: never read by Studio.
      tree.set('brand/.private/social/approvals.json', seals)
      tree.set('brand/social/notes.md', Buffer.from('SOCIAL-NOTES-CANARY'))
    })
    await s.studio.sync.refresh('acme-learning')

    const page = await owner.page('/brands/acme-learning/market/social-style-kit')
    assert.equal(page.res.status, 200)
    assert.match(page.text, /4 approved · 4 draft · 0 not verified · 0 rejected/)
    assert.match(page.text, /data-style-id="post\.bold-statement"/, 'the core wireframe is inline')
    assert.match(page.text, /data-safe-zone="margin"/)
    assert.match(page.text, /Rajdhani/, 'English page: the en display family')
    assert.match(page.text, /draft token, not approved yet/, 'a draft font token says so')
    assert.doesNotMatch(page.text, /EXAMPLE Display/)
    assert.match(page.text, /authorizes no post/)
    assert.match((await owner.page('/brands/acme-learning')).text, /href="\/brands\/acme-learning\/market\/social-style-kit"/, 'nav entry once a kit exists')
    const state = fs.readFileSync(path.join(s.config.dataDir, 'cache', 'acme-learning', 'state.json'), 'utf8')
    for (const secret of [...sealValues, source.proof, 'SOCIAL-NOTES-CANARY']) assert.equal(`${page.text}\n${state}`.includes(secret), false, 'no seal, secret or unlisted file')
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form in the page body')
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await owner.request(method, '/brands/acme-learning/market/social-style-kit', { form: { _csrf: 'x' } })
      assert.ok([404, 405].includes(res.status), `${method} ${res.status}`)
    }

    await owner.get('/brands/acme-learning/market/social-style-kit?lang=fa')
    const fa = await owner.page('/brands/acme-learning/market/social-style-kit')
    assert.match(fa.text, /dir="rtl"/)
    assert.match(fa.text, /کیت سبک شبکه‌های اجتماعی/)
    assert.match(fa.text, /Shams/, 'Persian page: the fa display family')
    assert.match(fa.text, /<div class="kit-svg" dir="ltr">/, 'wireframes keep their geometry in RTL')
    await owner.get('/brands/acme-learning/market/social-style-kit?lang=en')

    // A hand edit of an approved style on the merged branch is shown as not verified, never approved.
    const doc = YAML.parseDocument(read(source.root, SOCIAL_KIT_FILE).toString('utf8'))
    doc.setIn(['styles', 0, 'layers', 2, 'max_words'], 40)
    s.github.pushEdit(OWNER, 'acme-learning', (tree) => tree.set(SOCIAL_KIT_FILE, Buffer.from(doc.toString())))
    await s.studio.sync.refresh('acme-learning')
    const edited = await owner.page('/brands/acme-learning/market/social-style-kit')
    assert.match(edited.text, /3 approved · 4 draft · 1 not verified · 0 rejected/)
    assert.match(edited.text, /Edited after approval/)
  } finally {
    await s.close()
  }
})
