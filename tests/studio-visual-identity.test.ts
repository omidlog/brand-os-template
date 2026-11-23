import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { addApprovedAsset, approve, editOutsideStudio } from './helpers/edits.js'
import { Client, startStudio } from './helpers/studio-server.js'
import { OWNER } from './helpers/studio.js'

/**
 * Visual Blueprint V2.1 in Studio: the Brand Book "Visual identity" chapter and its print view are GET-only, drawn
 * from approved facts and the approved master asset only, show designed "awaiting" pages otherwise, keep ids out
 * of the main view, escape every value and work in en/fa/tr.
 */
const SLUG = 'acme-identity'
const MARK = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><rect width="300" height="100" fill="#123A73"/></svg>')

function mainView(text: string): string {
  const body = text.split('<main')[1] ?? ''
  return body.split('<details class="vz-details"')[0] ?? body
}

test('Studio: the Visual identity chapter is read-only, approved-only, designed when waiting, and localized', async () => {
  const s = await startStudio()
  try {
    const owner = new Client(s.url)
    await owner.login()
    const csrf = await owner.csrf('/brands/new')
    await owner.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Identity', slug: SLUG, profile: 'business', default_locale: 'en', locales: ['en', 'fa', 'tr'], owner: OWNER, repo: SLUG } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()

    // 1. Nothing approved: three designed awaiting plates; the Brand Book page links to the chapter.
    const book = await owner.page(`/brands/${SLUG}/brand-book`)
    assert.match(book.text, new RegExp(`href="/brands/${SLUG}/visual/identity"`))
    let page = await owner.page(`/brands/${SLUG}/visual/identity`)
    assert.equal(page.res.status, 200)
    assert.match(page.text, /Visual identity/)
    assert.equal((page.text.match(/class="vz-await"/g) ?? []).length, 3, 'three awaiting plates')
    assert.match(page.text, /vz-gap--swatches/)
    assert.match(page.text, /vz-gap--specimen/)
    assert.match(page.text, /vz-gap--mark/)
    assert.match(page.text, /Only template example placeholders/, 'the template example logo is never a master')
    assert.equal(page.text.includes('<image'), false, 'no logo drawn')

    // 2. A draft palette stays a draft; approved type and logo rule plus an approved master are drawn.
    editOutsideStudio(s, SLUG, (engine, root) => {
      engine.answerQuestion('brand.color.roles', 'primary #ABCDEF; onPrimary #000000')
      approve(engine, root, {
        'brand.type.scale': 'body: Inter, system-ui, sans-serif @ 16px/1.5',
        'brand.logo.min_size': 'min-size: 24px; clear-space: 0.5x',
      })
      addApprovedAsset(root, { id: 'asset.logo.master', name: 'Master <b>mark</b>', file: 'brand/assets/logo/master.svg', data: MARK })
      const file = path.join(root, 'brand/assets/asset-manifest.yaml')
      const manifest = parse(fs.readFileSync(file, 'utf8')) as { assets: Array<Record<string, unknown>> }
      const master = manifest.assets.find((asset) => asset.id === 'asset.logo.master')!
      master.tags = ['logo', 'master']
      master.mime = 'image/svg+xml'
      fs.writeFileSync(file, stringify(manifest))
    })
    await s.studio.sync.refresh(SLUG)
    page = await owner.page(`/brands/${SLUG}/visual/identity`)
    assert.equal(page.res.status, 200)
    assert.equal(page.text.includes('#ABCDEF'), false, 'a draft palette is never drawn')
    assert.match(page.text, /A draft exists and is waiting for review/)
    assert.match(page.text, /font-family="&#39;Studio Inter&#39;, Inter, system-ui, sans-serif"/, 'the bundled face draws a family of the same name')
    assert.match(page.text, /&#39;Studio Vazirmatn&#39;, Vazirmatn, system-ui/, 'Persian lines fall back to Vazirmatn')
    assert.match(page.text, /<image href="\/brands\/acme-identity\/assets\/file\/[0-9a-f]{64}"/, 'the master is served by the existing asset route')
    assert.match(page.text, /0\.5 × mark height/)
    assert.match(page.text, /Master &lt;b&gt;mark&lt;\/b&gt;/, 'asset names are escaped')
    assert.equal(page.text.includes('<b>mark</b>'), false)
    const main = mainView(page.text)
    assert.doesNotMatch(main, /brand\.(color|type|logo)\.[a-z_]+/, 'no question id in the main view')
    assert.doesNotMatch(main, /asset\.logo\.master/, 'no asset id in the main view')
    assert.match(page.text, /<details class="vz-details"[\s\S]*brand\.type\.scale[\s\S]*asset\.logo\.master/, 'ids live in the details')
    assert.match(page.text, /Informed by/)
    assert.doesNotMatch(page.text, /certified|compliant/i)
    assert.equal(/\sstyle="/.test(page.text), false, 'no inline style')
    assert.equal(/\son[a-z]+="/.test(page.text), false, 'no inline handler')
    assert.equal(/<form[^>]*method="post"/i.test(page.text.split('<main')[1] ?? ''), false, 'no write form')

    // 3. Print view (print engine V1.2, book_a4_portrait: cover, imprint, contents, plates, appendix) and the public edition.
    const print = await owner.page(`/brands/${SLUG}/visual/identity/print`)
    assert.equal(print.res.status, 200)
    assert.match(print.text, /vz-book-body/)
    assert.match(print.text, /<link rel="stylesheet" href="\/static\/visual-book\.css\?v=[A-Za-z0-9_-]+">/)
    for (const kind of ['cover', 'imprint', 'contents', 'plate', 'appendix']) assert.match(print.text, new RegExp(`class="bk-sheet bk-(recto|verso) bk-sheet--${kind}"`), kind)
    assert.ok((print.text.match(/class="bk-sheet /g) ?? []).length >= 7, 'front matter, three plates, appendix')
    assert.equal((await owner.get('/static/visual-book.css')).status, 200)
    assert.equal(/\sstyle="/.test(print.text), false)
    assert.equal(/<script(?![^>]*src="\/static\/visual\.js\?v=[A-Za-z0-9_-]+")/.test(print.text), false)
    const pub = await owner.page(`/brands/${SLUG}/visual/identity/print?edition=public`)
    assert.equal(pub.res.status, 200)
    assert.match(pub.text, /Public edition/)
    assert.equal(pub.text.includes('<image'), false, 'an unpublished master stays out of the public edition')

    // 4. Read-only: no other method, no other path.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const pathname of [`/brands/${SLUG}/visual/identity`, `/brands/${SLUG}/visual/identity/print`]) {
        const res = await owner.request(method, pathname, { form: { _csrf: 'x' } })
        assert.ok([404, 405].includes(res.status), `${method} ${pathname} ${res.status}`)
      }
    }
    assert.equal((await owner.get(`/brands/${SLUG}/visual/identity/edit`)).status, 404)
    const guest = new Client(s.url)
    assert.equal((await guest.get(`/brands/${SLUG}/visual/identity`)).status, 302)

    // 5. The canvas page is untouched by the new route.
    assert.equal((await owner.page(`/brands/${SLUG}/visual`)).res.status, 200)

    // 6. Persian and Turkish.
    await owner.get(`/brands/${SLUG}/visual/identity?lang=fa`)
    const fa = await owner.page(`/brands/${SLUG}/visual/identity`)
    assert.match(fa.text, /<html lang="fa" dir="rtl">/)
    assert.match(fa.text, /هویت بصری/)
    assert.match(fa.text, /class="vz-construct" viewBox="[^"]+" role="img" aria-label="[^"]+" dir="ltr"/, 'the construction drawing keeps its geometry')
    await owner.get(`/brands/${SLUG}/visual/identity?lang=tr`)
    assert.match((await owner.page(`/brands/${SLUG}/visual/identity`)).text, /Görsel kimlik/)
  } finally {
    await s.close()
  }
})

test('sync: a cache written before the identity chapter existed is rebuilt at the same commit', async () => {
  const { harness, provisioned } = await import('./helpers/studio.js')
  const h = harness()
  const req = await provisioned(h)
  const file = path.join(h.dataDir, 'cache', req.slug, 'state.json')
  const state = JSON.parse(fs.readFileSync(file, 'utf8')) as { projection: { visual: Record<string, unknown> } }
  assert.ok(state.projection.visual.identity)
  delete state.projection.visual.identity
  fs.writeFileSync(file, JSON.stringify(state))
  assert.equal(h.sync.get(req.slug).projection!.visual?.identity, undefined)
  const after = await h.sync.refresh(req.slug)
  assert.equal(after.projection!.visual?.identity?.internal.document_kind, 'visual_identity')
  assert.equal(after.projection!.visual?.identity?.public.audience, 'public')
})
