import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import crypto from 'node:crypto'
import { applyInit, authorize, agentContext, backupBrand, ensureApprovalSecret, getBrandTokens, guestContext, InterviewEngine, migrateBrand, resetInterviewState, restoreBrand, searchBrandDocs, writeStarterWorkspace } from '@brand-os/brand-core'
import { inspectAssetForPublication } from '@brand-os/asset-catalog'
import { prepareDocs } from '../scripts/prepare-docs.js'

function fresh(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sec-'))
  writeStarterWorkspace(dir)
  return dir
}

test('public export is an allowlist and confirm cannot withdraw an approval', () => {
  const root = fresh()
  applyInit(root, {
    name: 'Gate Brand',
    slug: 'gate-brand',
    industry: 'education',
    language: 'en',
    languages: ['en'],
    mascot: false,
    gamification: false,
    publish: 'public',
  })
  const engine = new InterviewEngine(root)
  engine.submit('new')
  engine.submit('Gate Brand')
  const proof = ensureApprovalSecret(root)
  engine.approve('business.identity.trade_name', 'owner', proof)
  const unpublished = JSON.stringify(engine.exportPublic())
  assert.equal(unpublished.includes('Gate Brand'), false)
  engine.publishFact('business.identity.trade_name', proof)
  const published = engine.exportPublic()
  assert.equal(published.facts.some((fact) => fact.id === 'business.identity.trade_name' && fact.value === 'Gate Brand'), true)
  assert.equal(JSON.stringify(published).includes('session'), false)
  const blocked = engine.changeAnswer('business.identity.trade_name', 'Forged Name', true, 'owner')
  assert.equal(blocked.kind, 'impact')
  assert.equal(engine.exportPublic().facts.some((fact) => fact.value === 'Gate Brand'), true)
  assert.equal(engine.exportPublic().facts.some((fact) => fact.value === 'Forged Name'), false)
  assert.equal(engine.approve('business.identity.trade_name', 'owner').kind, 'error')
  const session = engine.session()
  session.history.push('CANARY-SESSION')
  fs.writeFileSync(path.join(root, 'brand/interview/session-state.yaml'), `session_id: ses-0001\nstatus: active\nlocale: en\nhistory: ["CANARY-SESSION"]\ndeferred: []\npending_suggestions: []\ncursor_question_id: null\npending_proposals: []\nstarted_at: null\nupdated_at: null\nlast_answer_id: null\n`)
  assert.equal(JSON.stringify(new InterviewEngine(root).exportPublic()).includes('CANARY-SESSION'), false)
})

test('guest cannot read an internal canary by passing include_unapproved', () => {
  const root = fresh()
  const engine = new InterviewEngine(root)
  fs.writeFileSync(
    path.join(root, 'brand/instance/approved-facts.yaml'),
    'schema_version: 1\nfacts:\n  brand.secret.internal:\n    value: CANARY-INTERNAL\n    visibility: internal\n    publication: published\n    status: approved\n',
  )
  const result = searchBrandDocs(engine, 'CANARY-INTERNAL', true)
  const hits = (result.data as { hits: unknown[] }).hits
  assert.deepEqual(hits, [])
})

test('symlink, traversal, and active SVG are rejected', () => {
  const root = fresh()
  const outside = path.join(root, 'outside-canary.txt')
  fs.writeFileSync(outside, 'CANARY-OUTSIDE')
  const link = path.join(root, 'brand/assets/logo/escape.svg')
  fs.symlinkSync(outside, link)
  assert.equal(inspectAssetForPublication(root, 'brand/assets/logo/escape.svg').ok, false)
  assert.equal(inspectAssetForPublication(root, '../outside-canary.txt').ok, false)
  assert.equal(inspectAssetForPublication(root, 'brand/assets/%2e%2e/%2e%2e/outside-canary.txt').ok, false)
  assert.equal(inspectAssetForPublication(root, '/tmp/outside-canary.txt').ok, false)
  const evil = path.join(root, 'brand/assets/icons/evil.svg')
  fs.writeFileSync(evil, '<svg><script>alert(1)</script></svg>')
  assert.equal(inspectAssetForPublication(root, 'brand/assets/icons/evil.svg').ok, false)
})

test('checksum mismatch is rejected and a safe svg is copied', () => {
  const root = fresh()
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>'
  const file = path.join(root, 'brand/assets/icons/safe.svg')
  fs.writeFileSync(file, svg)
  const hash = crypto.createHash('sha256').update(svg).digest('hex')
  assert.equal(inspectAssetForPublication(root, 'brand/assets/icons/safe.svg', '0'.repeat(64)).ok, false)
  assert.equal(inspectAssetForPublication(root, 'brand/assets/icons/safe.svg', hash).ok, true)
})

test('backup refuses overwrite and restore returns the previous bytes', () => {
  const root = fresh()
  const overview = path.join(root, 'brand/content/04-color-system/overview.md')
  fs.appendFileSync(overview, '\nKEEP-THIS-SENTENCE\n')
  const saved = backupBrand(root)
  assert.throws(() => backupBrand(root, saved.directory), /overwrite/)
  fs.appendFileSync(overview, 'CHANGED\n')
  restoreBrand(root, saved.directory)
  assert.match(fs.readFileSync(overview, 'utf8'), /KEEP-THIS-SENTENCE/)
  assert.doesNotMatch(fs.readFileSync(overview, 'utf8'), /CHANGED/)
  const again = migrateBrand(root)
  migrateBrand(root)
  assert.equal(again.content_rewritten, false)
  assert.throws(() => resetInterviewState(root, 'no'), /confirmation/)
  resetInterviewState(root, 'I understand this deletes interview state')
  assert.match(fs.readFileSync(overview, 'utf8'), /KEEP-THIS-SENTENCE/)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'brand/interview/answer-ledger.yaml'), 'utf8'), /KEEP-THIS-SENTENCE/)
})

test('an approved token hash does not survive a changed value', () => {
  const root = fresh()
  fs.cpSync(path.join(path.resolve(import.meta.dirname, '..'), 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  const engine = new InterviewEngine(root)
  const current = getBrandTokens(engine, true)
  assert.equal((current.data as { tokens: unknown[] }).tokens.length, 0)
  const compiled = JSON.parse(fs.readFileSync(path.join(root, 'brand/tokens/color.tokens.json'), 'utf8')) as {
    color: { brand: { primary: { $value: { hex: string } } } }
  }
  const hex = compiled.color.brand.primary.$value.hex
  const digest = crypto.createHash('sha256').update(hex).digest('hex')
  fs.writeFileSync(path.join(root, 'brand/tokens/approvals.yaml'), `approved:\n  color.brand.primary:\n    approved_by: human\n    value_sha256: ${digest}\n`)
  const matched = getBrandTokens(engine, true)
  assert.equal((matched.data as { tokens: Array<{ id: string }> }).tokens[0]?.id, 'color.brand.primary')
  compiled.color.brand.primary.$value.hex = '#000000'
  fs.writeFileSync(path.join(root, 'brand/tokens/color.tokens.json'), `${JSON.stringify(compiled, null, 2)}\n`)
  const drifted = getBrandTokens(engine, true)
  assert.deepEqual((drifted.data as { tokens: unknown[] }).tokens, [])
})

test('authorization matrix denies guests, agents, and other brands', () => {
  const guest = guestContext('alpha')
  const agent = agentContext('alpha')
  const published = { brand_id: 'alpha', classification: 'public' as const, status: 'approved', publication: 'published' as const }
  const internal = { brand_id: 'alpha', classification: 'internal' as const, status: 'approved', publication: 'published' as const }
  assert.equal(authorize(guest, published, 'read').allow, true)
  assert.equal(authorize(guest, internal, 'read').allow, false)
  assert.equal(authorize(agent, { ...published, brand_id: 'beta' }, 'read').allow, false)
  assert.equal(authorize(agent, published, 'approve').allow, false)
  assert.equal(authorize({ principal_id: 'owner', role: 'owner', brand_id: 'alpha', audience: 'internal', scopes: ['approve', 'write'] }, internal, 'approve').allow, true)
})

test('a private brand cannot be publicly built', () => {
  const root = fresh()
  applyInit(root, {
    name: 'Private Co',
    slug: 'private-co',
    industry: 'software',
    language: 'en',
    languages: ['en'],
    mascot: false,
    gamification: false,
    publish: 'private',
  })
  assert.throws(() => prepareDocs(root, { audience: 'public', rootIndex: false }), /private/)
})
