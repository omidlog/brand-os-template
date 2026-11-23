import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import { agentTokenContext, operatorContext, type AuthContext } from '@brand-os/brand-core'
import { runVisualDnaTool, type VisualDnaResult, type VisualReference } from '@brand-os/brand-core/visual-dna'
import { useTestKey } from './helpers/knowledge.js'
import { editAssets, fixture, IDS, sha, SLUG, SVG, SVG_B } from './helpers/visual-dna.js'

/**
 * Visual DNA owner policy decisions (2026-11-23), on the synthetic fixture only:
 * 1. the brand's own logo/marks need no recorded licence; third-party assets still do;
 * 2. internal-scope rights cover internal use of a portrait, never public use;
 * 3. manifest status `published` counts as approved, with every other check still applied.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const validate = new Ajv({ allErrors: true, strict: false }).compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas/visual-dna.schema.json'), 'utf8')) as object)
const design = (): AuthContext => agentTokenContext(SLUG, 'agt_design', 'design')
const owner = (): AuthContext => operatorContext(SLUG)

function valid(result: VisualDnaResult): VisualDnaResult {
  assert.equal(validate(result), true, JSON.stringify(validate.errors))
  assert.equal(result.status, 'ok', result.reason ?? '')
  assert.deepEqual(result.authorizes, [])
  assert.ok(Object.values(result.permissions).every((flag) => flag === false))
  return result
}

const only = (result: VisualDnaResult): VisualReference => {
  assert.equal(result.references.length, 1)
  return result.references[0]!
}

function setAsset(root: string, id: string, patch: Record<string, unknown>): void {
  editAssets(root, (assets) => {
    const row = assets.find((asset) => asset.id === id)
    assert.ok(row, id)
    Object.assign(row, patch)
  })
}

test('published manifest status is approved-equivalent for an agent and the owner', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.logo, { status: 'published' })
  for (const ctx of [design(), owner()]) {
    const entry = only(valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.logo] })))
    assert.equal(entry.state, 'approved', ctx.role)
    assert.equal(entry.reason, null)
    assert.equal(entry.asset?.checksum_sha256, sha(SVG))
  }
})

test('published status is still subject to the byte checks: replaced bytes and an approval for other bytes are changed', () => {
  const { root, engine } = fixture()
  setAsset(root, IDS.changed, { status: 'published' })
  setAsset(root, IDS.reapproved, { status: 'published' })
  for (const ctx of [design(), owner()]) {
    const result = valid(runVisualDnaTool(engine, ctx, { asset_ids: [IDS.changed, IDS.reapproved] }))
    const [changed, reapproved] = result.references
    assert.deepEqual([changed?.state, changed?.reason], ['changed', 'checksum_mismatch'], ctx.role)
    assert.deepEqual([reapproved?.state, reapproved?.reason], ['changed', 'approved_bytes_differ'], ctx.role)
    assert.equal(changed?.asset, null)
    assert.equal(reapproved?.asset, null)
  }
  // A published asset whose file is replaced after it resolved becomes changed on the next call.
  setAsset(root, IDS.logo, { status: 'published' })
  assert.equal(only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo] }))).state, 'approved')
  fs.writeFileSync(path.join(root, 'brand/assets/logo/synthetic-primary.svg'), SVG_B)
  assert.deepEqual(
    (({ state, reason }) => [state, reason])(only(valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.logo] })))),
    ['changed', 'checksum_mismatch'],
  )
})

test('draft and other non-approved statuses stay missing; only approved and published count', () => {
  const { root, engine } = fixture()
  for (const status of ['draft', 'review', 'retired', 'Published', 'PUBLISHED']) {
    setAsset(root, IDS.logo, { status })
    assert.deepEqual(
      (({ state, reason }) => [state, reason])(only(valid(runVisualDnaTool(engine, design(), { asset_ids: [IDS.logo] })))),
      ['missing', 'not_found'],
      status,
    )
    assert.equal(only(valid(runVisualDnaTool(engine, owner(), { asset_ids: [IDS.logo] }))).reason, 'not_approved', status)
  }
})
