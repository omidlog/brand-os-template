import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { BRAND_TOPIC, isUpdatePull, TemplateUpdateService } from '../apps/studio/src/template-update.js'
import { harness, OWNER, provisioned, TEMPLATE, type Harness } from './helpers/studio.js'
import { Client, startStudio } from './helpers/studio-server.js'

/**
 * Engine updates in Studio (engine + data): Studio compares a brand's `.brand-os/engine/VERSION` with the template's
 * newest `engine-v…` release and starts the template's engine-release workflow; that workflow, not Studio, opens the
 * pull request in the brand repository. Everything runs against the in-memory GitHub; nothing reaches the network.
 */
function service(h: Harness, allowedOwners = [OWNER]): TemplateUpdateService {
  return new TemplateUpdateService({ registry: h.registry, github: h.provisionClient, templateOwner: TEMPLATE.owner, templateRepo: TEMPLATE.repo, allowedOwners, dataDir: h.dataDir })
}

test('engine update: status compares the brand engine with the newest release; a template copy is "untracked"', () => {
  const h = harness()
  const updates = service(h)
  const pull = { number: 3, title: 'Update Brand OS engine', html_url: 'https://github.com/o/r/pull/3', head_ref: 'engine-update/0.3.0-abc1234', draft: false, updated_at: null }
  assert.equal(updates.status(null, '0.3.0-abc1234').state, 'unknown')
  assert.equal(updates.status({ engine: null } as never, '0.3.0-abc1234').state, 'untracked', 'still a template copy: the next update converts it')
  assert.equal(updates.status({ engine: { version: '0.3.0-abc1234' } } as never, '0.3.0-abc1234').state, 'current')
  assert.deepEqual(updates.status({ engine: { version: '0.2.0-0000000' } } as never, '0.3.0-abc1234'), { state: 'available', from: '0.2.0-0000000', to: '0.3.0-abc1234', pull: null })
  assert.equal(updates.status({ engine: { version: '0.2.0-0000000' } } as never, null).state, 'unknown')
  assert.equal(updates.status({ engine: { version: '0.2.0-0000000' } } as never, '0.3.0-abc1234', [pull]).pull?.number, 3)
  assert.equal(isUpdatePull(pull), true)
  assert.equal(isUpdatePull({ ...pull, head_ref: 'feature/x' }), false)
})

test('engine update: the newest release is read from engine-v tags, cached, and a failure degrades to unknown', async () => {
  const h = harness()
  h.github.engineReleases = ['v9.9.9', 'engine-v0.3.0-abc1234', 'engine-v0.2.0-0000000']
  const updates = service(h)
  assert.equal(await updates.templateHead({ force: true }), '0.3.0-abc1234')
  const reads = h.github.callsTo('GET', /\/releases/).length
  assert.equal(await updates.templateHead(), '0.3.0-abc1234')
  assert.equal(h.github.callsTo('GET', /\/releases/).length, reads, 'cached')
  h.github.fail('GET', /\/releases/, 500, 5)
  assert.equal(await updates.templateHead({ force: true }), '0.3.0-abc1234', 'the last good value is kept')
  assert.ok(updates.headError.error)
})

test('engine update: Update starts the template workflow for one brand, Update all for every brand; Studio writes nothing to a brand', async () => {
  const h = harness()
  const req = await provisioned(h)
  const updates = service(h)
  const brandHead = h.github.repo(OWNER, req.repo)!.head
  const one = await updates.openUpdatePull('acme-learning', 'owner')
  assert.deepEqual(one, { ok: true, code: 'dispatched' })
  const all = await updates.updateAll('owner')
  assert.deepEqual(all, { ok: true, code: 'dispatched' })
  assert.deepEqual(h.github.dispatches.map((entry) => [entry.repo, entry.workflow, entry.ref, entry.inputs.repos]), [
    [`${TEMPLATE.owner}/${TEMPLATE.repo}`.toLowerCase(), 'engine-release.yml', 'main', `${OWNER}/${req.repo}`],
    [`${TEMPLATE.owner}/${TEMPLATE.repo}`.toLowerCase(), 'engine-release.yml', 'main', ''],
  ])
  assert.equal(h.github.repo(OWNER, req.repo)!.head, brandHead, 'no commit in the brand repository')
  assert.equal(h.github.repo(OWNER, req.repo)!.pulls.length, 0, 'Studio opens no pull request itself')
  const audit = fs.readFileSync(path.join(h.dataDir, 'audit.jsonl'), 'utf8')
  assert.match(audit, /"action":"engine_update_dispatch".*"result":"dispatched"/)
  // Outside the allowed accounts nothing is dispatched.
  const refused = await service(h, ['someone-else']).openUpdatePull('acme-learning', 'owner')
  assert.deepEqual(refused, { ok: false, code: 'not_configured' })
  assert.equal(h.github.dispatches.length, 2)
})

test('engine update: a newly provisioned brand gets the brand-os-brand topic and its first (converting) update', async () => {
  const h = harness()
  const req = await provisioned(h)
  const updates = service(h)
  await updates.enrollNewBrand(h.registry.get('acme-learning')!, 'provisioning')
  assert.deepEqual(h.github.topics.get(`${OWNER}/${req.repo}`.toLowerCase()), [BRAND_TOPIC])
  assert.equal(h.github.dispatches.at(-1)?.inputs.repos, `${OWNER}/${req.repo}`)
})

test('Studio routes: the engine panel on overview, Update and Update all are owner-only, CSRF-protected and start the workflow', async () => {
  const s = await startStudio()
  try {
    s.github.engineReleases = ['engine-v0.3.0-abc1234']
    const client = new Client(s.url)
    await client.login()
    const csrf = await client.csrf('/brands/new')
    await client.request('POST', '/brands/new', { form: { _csrf: csrf, name: 'Acme Learning', slug: 'acme-learning', profile: 'business', default_locale: 'en', locales: ['en'], owner: 'brand-owner', repo: 'acme-learning' } })
    await s.studio.provisioning.settled()
    await s.studio.sync.settled()
    await s.studio.templateUpdates.templateHead({ force: true })
    // Provisioning enrolled the brand: topic set and the first update started.
    assert.ok(s.github.dispatches.some((entry) => entry.inputs.repos === 'brand-owner/acme-learning'))
    const dispatchedBefore = s.github.dispatches.length

    let page = await client.page('/brands/acme-learning')
    assert.match(page.text, /data-update-state="untracked"/)
    assert.match(page.text, /Not on the engine yet/)
    assert.match(page.text, /action="\/brands\/acme-learning\/template-update"/)
    const list = await client.page('/brands')
    assert.match(list.text, /action="\/brands\/update-all"/)
    for (const lang of ['fa', 'tr']) {
      await client.get(`/brands?lang=${lang}`)
      const localized = await client.page('/brands/acme-learning')
      assert.match(localized.text, lang === 'fa' ? /هنوز روی موتور نیست/ : /Henüz motorda değil/)
    }
    await client.get('/brands?lang=en')

    // Guests, a missing CSRF token and a foreign Origin are refused before anything reaches GitHub.
    const guest = new Client(s.url)
    assert.equal((await guest.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: 'x' } })).status, 401)
    assert.equal((await guest.request('POST', '/brands/update-all', { form: { _csrf: 'x' } })).status, 401)
    const token = await client.csrf('/brands/acme-learning')
    assert.equal((await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: 'forged' } })).status, 403)
    assert.equal((await client.request('POST', '/brands/update-all', { form: { _csrf: token }, origin: 'https://evil.example' })).status, 403)
    assert.equal(s.github.dispatches.length, dispatchedBefore)

    const one = await client.request('POST', '/brands/acme-learning/template-update', { form: { _csrf: token } })
    assert.equal(one.headers.get('location'), '/brands/acme-learning?update=dispatched#template-update')
    assert.match((await client.page('/brands/acme-learning?update=dispatched')).text, /The engine update has started/)
    const all = await client.request('POST', '/brands/update-all', { form: { _csrf: await client.csrf('/brands') } })
    assert.equal(all.headers.get('location'), '/brands?update=dispatched')
    assert.equal(s.github.dispatches.length, dispatchedBefore + 2)
    assert.equal(s.github.repo('brand-owner', 'acme-learning')!.pulls.length, 0, 'Studio itself opens no pull request')

    // A brand on the current engine shows "up to date" and no button.
    s.github.pushEdit('brand-owner', 'acme-learning', (tree) => tree.set('.brand-os/engine/VERSION', Buffer.from('0.3.0-abc1234\n')))
    await s.studio.sync.refresh('acme-learning')
    page = await client.page('/brands/acme-learning')
    assert.match(page.text, /data-update-state="current"/)
    assert.equal(page.text.includes('action="/brands/acme-learning/template-update"'), false)
  } finally {
    await s.close()
  }
})
