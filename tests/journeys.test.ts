import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { allocateBudget as budget, applyInit as init, backupBrand, ensureApprovalSecret as proofOf, financeScenario, InterviewEngine as Engine, migrateBrand, restoreBrand, searchBrandDocs as search, writeStarterWorkspace as starter } from '@brand-os/brand-core'
import { prepareDocs } from '../scripts/prepare-docs.js'
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

function brand(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-journey-'))
  starter(dir)
  fs.cpSync(path.join(path.resolve(import.meta.dirname, '..'), 'brand/tokens'), path.join(dir, 'brand/tokens'), { recursive: true })
  return dir
}

test('journey A keeps a published name when a tagline change is only proposed', () => {
  const root = brand()
  init(root, {
    name: 'Sample Language',
    slug: 'sample-language-app',
    industry: 'education',
    language: 'fa',
    languages: ['fa', 'en'],
    mascot: true,
    gamification: true,
    publish: 'private',
  })
  const engine = new Engine(root)
  const note = engine.submit('note: مخاطب اصلی دانشجو است و یک ایده B2B بیزنس داریم ولی قیمت هنوز نیست')
  assert.match(note.message, /not approvals/i)
  assert.match(note.message, /business.customer.primary_segment/)
  assert.match(note.message, /business.sales.b2b_packaging/)
  assert.match(note.message, /business.sales.pricing/)
  engine.submit('accept proposal 1')
  const proof = proofOf(root)
  engine.submit('new')
  const trade = engine.submit('Sample Language')
  assert.equal(trade.kind, 'recorded')
  assert.equal(engine.approve('business.identity.trade_name', 'owner').kind, 'error')
  assert.equal(engine.approve('business.identity.trade_name', 'owner', proof).status, 'approved')
  assert.equal(engine.publishFact('business.identity.trade_name', proof).kind, 'recorded')
  const before = fs.readFileSync(path.join(root, 'brand/instance/approved-facts.yaml'), 'utf8')
  const changed = engine.changeAnswer('business.identity.trade_name', 'A forged public slogan', true, 'owner')
  assert.equal(changed.kind, 'impact')
  assert.equal(fs.readFileSync(path.join(root, 'brand/instance/approved-facts.yaml'), 'utf8'), before)
  assert.equal(engine.exportPublic().facts.length, 0) // private brands never emit a public projection
  assert.equal(engine.exportPublic().facts.some((fact) => String(fact.value).includes('forged')), false)
  const allocation = budget(100, { content: 1, paid: 1, community: 2 })
  assert.equal(allocation.status, 'computed')
  assert.equal(allocation.sum, 100)
  assert.equal(allocation.lines.reduce((sum, line) => sum + (line.amount ?? 0), 0), 100)
  assert.equal(budget(null, { content: 1 }).status, 'missing')
  assert.equal(financeScenario({ revenue: null, cost: 10, cash: 30 }).status, 'blocked_missing_inputs')
  assert.equal(financeScenario({ revenue: 100, cost: 40, cash: 80 }).runway_months, null)
  assert.equal(financeScenario({ revenue: 100, cost: 40, cash: 80, net_burn: 40 }).runway_months, 2)
  assert.equal(financeScenario({ revenue: 100, cost: 40, cash: 80 }).gross_margin_pct, 60)
  const saved = backupBrand(root)
  migrateBrand(root)
  fs.appendFileSync(path.join(root, 'brand/content/01-brand-strategy/overview.md'), '\nJOURNEY-A-EDIT\n')
  restoreBrand(root, saved.directory)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'brand/content/01-brand-strategy/overview.md'), 'utf8'), /JOURNEY-A-EDIT/)
})

test('journey B private brand does not leak into search and cannot build public docs', () => {
  const root = brand()
  init(root, {
    name: 'Sample B2B',
    slug: 'sample-b2b-saas',
    industry: 'software',
    language: 'en',
    languages: ['en', 'tr'],
    mascot: false,
    gamification: false,
    publish: 'private',
  })
  const engine = new Engine(root)
  const ids: string[] = []
  for (let step = 0; step < 30; step += 1) {
    const current = engine.current()
    if (!current) break
    ids.push(current.id)
    engine.submit('unknown')
  }
  assert.equal(ids.some((id) => id.startsWith('brand.mascot.')), false)
  fs.writeFileSync(
    path.join(root, 'brand/instance/approved-facts.yaml'),
    'schema_version: 1\nfacts:\n  business.finance.revenue_figure:\n    value: CANARY-B-RESTRICTED\n    visibility: restricted\n    publication: unpublished\n    status: approved\n',
  )
  assert.deepEqual((search(engine, 'CANARY-B-RESTRICTED').data as { hits: unknown[] }).hits, [])
  assert.throws(() => prepareDocs(root, { audience: 'public', rootIndex: false }), /private/)
  const other = brand()
  const foreign = new Engine(other)
  assert.deepEqual((search(foreign, 'CANARY-B-RESTRICTED').data as { hits: unknown[] }).hits, [])
})

test('journey C public build drops injected canaries and active svg', () => {
  const root = brand()
  init(root, {
    name: 'Threat Fixture',
    slug: 'threat-fixture',
    industry: 'education',
    language: 'en',
    languages: ['en'],
    mascot: false,
    gamification: false,
    publish: 'public',
  })
  const engine = new Engine(root)
  engine.submit('new')
  engine.submit('Threat Fixture </script>')
  const proof = proofOf(root)
  engine.approve('business.identity.trade_name', 'owner', proof)
  engine.publishFact('business.identity.trade_name', proof)
  const canary = 'CANARY-C-PUBLIC-DRAFT'
  fs.mkdirSync(path.join(root, 'brand/content/02-verbal-identity'), { recursive: true })
  fs.writeFileSync(path.join(root, 'brand/content/02-verbal-identity/draft-note.md'), `# Draft\n\n${canary}\n`)
  fs.writeFileSync(path.join(root, 'brand/assets/icons/evil.svg'), '<svg><script>alert(1)</script></svg>')
  const manifest = fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')
  fs.writeFileSync(
    path.join(root, 'brand/assets/asset-manifest.yaml'),
    `${manifest}  - id: asset.icon.evil\n    name: ${canary}\n    status: approved\n    visibility: public\n    path: brand/assets/icons/evil.svg\n    present: true\n    checksum_sha256: ${crypto.createHash('sha256').update('<svg><script>alert(1)</script></svg>').digest('hex')}\n`,
  )
  prepareDocs(root, { audience: 'internal', rootIndex: false })
  prepareDocs(root, { audience: 'public', rootIndex: false })
  const docs = path.join(root, 'apps/docs')
  const hits: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else {
        const text = fs.readFileSync(full, 'utf8')
        if (text.includes(canary) || text.includes('<script>alert')) hits.push(full)
      }
    }
  }
  walk(docs)
  assert.deepEqual(hits, [])
  const claims = fs.readFileSync(path.join(docs, 'docs/published/claims.md'), 'utf8')
  assert.match(claims, /Threat Fixture/)
  assert.match(claims, /&lt;\/script&gt;/)
})
