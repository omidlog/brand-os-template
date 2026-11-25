import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { approvalProofMatches, readKeychainProof, rotateApprovalSecret, ROTATION_LOG, type KeychainRunner } from '@brand-os/brand-core'
import { evaluateWeek, loadWeekRecord } from '@brand-os/brand-core/content-bridge'
import { approveKit, evaluateKit, initKit, readKit, reviewKit } from '@brand-os/brand-core/social-kit'
import { approveRevision, evaluate, loadRecord, proposeRevision } from '@brand-os/brand-core/strategy'
import { approvedWeek, contentBrand, plannedWeek } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NOW, seoProposal } from './helpers/strategy.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/** `brand:doctor --rotate-approval-secret`: re-seal what verified under the old secret, and nothing else. */
useTestKey()

const PRIVATE = (root: string) => path.join(root, 'brand', '.private')

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else out[path.relative(dir, full)] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')
    }
  }
  walk(dir)
  return out
}

/** Approved: a content strategy, an SEO strategy, a calendar week and the social styles of `post`; one strategy tampered. */
async function sealedBrand() {
  const s = await contentBrand('rotate-brand')
  const seo = proposeRevision(s.ws, { strategy_id: 'seo-main', proposal: seoProposal(s.research) }).revision
  approveRevision(s.ws, { strategy_id: 'seo-main', revision: 1, expected_sha256: seo.content_sha256, proof: s.proof })
  const ads = proposeRevision(s.ws, { strategy_id: 'ads-main', proposal: seoProposal(s.research, { type: 'paid_media', title: 'Paid test', recommendations: [{ id: 'p1', priority: 'high', action: 'Test reels', rationale: 'Learn first.', agent_kinds: ['ads'], evidence_refs: [], fact_refs: ['business.marketing.objective'] }], evidence_refs: [] }) }).revision
  approveRevision(s.ws, { strategy_id: 'ads-main', revision: 1, expected_sha256: ads.content_sha256, proof: s.proof })
  const week = approvedWeek(s, plannedWeek(s, '2026-11-23'))
  initKit(s.ws, { surfaces: ['post'], styles: 2 })
  approveKit(s.ws, { surface: 'post', expected_sha256: reviewKit(s.ws, { surface: 'post' }).expect_sha!, proof: s.proof })
  // Tamper: the ads approval seal is edited by hand. It is invalid before rotation and must stay invalid after.
  const adsFile = path.join(s.root, 'brand/.private/strategy/records/ads-main/record.json')
  const doc = JSON.parse(fs.readFileSync(adsFile, 'utf8')) as { revisions: Array<{ approval: { seal: string } }> }
  doc.revisions[0]!.approval.seal = '0'.repeat(64)
  fs.writeFileSync(adsFile, `${JSON.stringify(doc, null, 2)}\n`, { mode: 0o600 })
  return { ...s, week }
}

function statuses(s: Awaited<ReturnType<typeof sealedBrand>>) {
  const strategy = (id: string) => {
    const record = loadRecord(s.ws, id)
    return evaluate(s.ws, record, record.revisions[0]!, NOW).status
  }
  const weekRecord = loadWeekRecord(s.ws, 'wk-2026-11-23')
  const kit = readKit(s.root, s.ws.brandSlug)
  assert.equal(kit.state, 'ok')
  return {
    content: strategy('content-main'),
    seo: strategy('seo-main'),
    ads: strategy('ads-main'),
    week: evaluateWeek(s.ws, weekRecord, weekRecord.revisions[0]!, NOW).status,
    social: kit.state === 'ok' ? evaluateKit(s.root, kit.kit).filter((state) => state.style.surface === 'post').map((state) => state.status) : [],
  }
}

test('rotation re-seals every verifying approval; the new proof works, the old one does not, a tampered seal stays invalid', async () => {
  const s = await sealedBrand()
  const before = statuses(s)
  assert.deepEqual(before, { content: 'current', seo: 'current', ads: 'integrity_failed', week: 'current', social: ['approved', 'approved'] })
  const result = rotateApprovalSecret(s.root, s.proof)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.outcome, 'rotated')
  assert.deepEqual(result.resealed.map((ref) => `${ref.kind}:${ref.id}`).sort(), ['social_style:post.bold-statement', 'social_style:post.photo-headline', 'strategy:content-main', 'strategy:seo-main', 'week:wk-2026-11-23'].sort())
  assert.deepEqual(result.not_resealed, [{ kind: 'strategy', id: 'ads-main', revision: 1 }])
  assert.ok(result.new_proof && /^[0-9a-f]{48}$/.test(result.new_proof))
  assert.equal(result.keychain, 'not_checked')
  assert.deepEqual(statuses(s), before, 'everything served before is served after; the tampered seal is still invalid')
  assert.equal(approvalProofMatches(s.root, s.proof), false, 'the old proof is refused')
  assert.equal(approvalProofMatches(s.root, result.new_proof!), true)
  assert.equal(fs.statSync(path.join(PRIVATE(s.root), 'approval-secret')).mode & 0o777, 0o600)
  // The audit line names counts and ids only, never secret material.
  const log = fs.readFileSync(path.join(s.root, ROTATION_LOG), 'utf8')
  assert.match(log, /approval_secret_rotated/)
  assert.ok(!log.includes(result.new_proof!) && !log.includes(s.proof))
  assert.deepEqual(fs.readdirSync(PRIVATE(s.root), { recursive: true }).filter((name) => /\.rotate-/.test(String(name))), [], 'no staged files left')
  // The old proof cannot rotate again.
  assert.equal(rotateApprovalSecret(s.root, s.proof).outcome, 'refused')
})

test('a failure mid-way restores every file: the old proof and every seal still work', async () => {
  const s = await sealedBrand()
  const before = snapshot(PRIVATE(s.root))
  const result = rotateApprovalSecret(s.root, s.proof, {
    beforeSwap: (index) => {
      if (index === 2) throw new Error('disk full (simulated)')
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.outcome, 'failed')
  assert.match(result.message, /restored/)
  assert.equal(result.new_proof, null)
  assert.deepEqual(snapshot(PRIVATE(s.root)), before, 'byte-identical, no staged files left')
  assert.equal(approvalProofMatches(s.root, s.proof), true)
  assert.equal(statuses(s).week, 'current')
})

test('a wrong proof or an agent token changes nothing', async () => {
  const s = await sealedBrand()
  const before = snapshot(PRIVATE(s.root))
  assert.equal(rotateApprovalSecret(s.root, 'wrong').outcome, 'refused')
  assert.equal(rotateApprovalSecret(s.root, undefined).outcome, 'refused')
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_agent'
  try {
    const refused = rotateApprovalSecret(s.root, s.proof)
    assert.equal(refused.outcome, 'refused')
    assert.match(refused.message, /BRAND_OS_AGENT_TOKEN/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.deepEqual(snapshot(PRIVATE(s.root)), before)
})

test('a stored Keychain entry is replaced and the new proof is not returned for printing', async () => {
  const s = await sealedBrand()
  const store = new Map<string, string>([['rotate-brand', s.proof]])
  const runner: KeychainRunner = (args, stdin) => {
    if (args[0] === 'find-generic-password') {
      const value = store.get(args[args.indexOf('-a') + 1]!)
      return value ? { status: 0, stdout: `${value}\n` } : { status: 44, stdout: '' }
    }
    if (args[0] === '-i') {
      const match = /-a (\S+) .* -w "([^"]+)"/.exec(stdin ?? '')
      if (match) store.set(match[1]!, match[2]!)
      return { status: 0, stdout: '' }
    }
    return { status: 1, stdout: '' }
  }
  const result = rotateApprovalSecret(s.root, s.proof, { keychain: { slug: 'rotate-brand', runner, platform: 'darwin', env: {} } })
  assert.equal(result.ok, true, result.message)
  assert.equal(result.keychain, 'updated')
  assert.equal(result.new_proof, null)
  const stored = readKeychainProof('rotate-brand', { runner, platform: 'darwin', env: {} })
  assert.ok(stored && stored !== s.proof)
  assert.equal(approvalProofMatches(s.root, stored), true)
})

test('CLI: --rotate-approval-secret is owner-only, takes the current proof on stdin, never from argv', async () => {
  const s = await sealedBrand()
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') base[key] = value
  const run = (args: string[], env: Record<string, string> = {}, input = '') =>
    spawnSync(NODE, tsxArgs('scripts/brand.ts', ['doctor', ...args]), { cwd: s.root, env: { ...base, BRAND_OS_KEYCHAIN: 'off', BRAND_OS_DATA_KEY: TEST_DATA_KEY, ...env }, input, encoding: 'utf8', timeout: 60_000 })
  const argv = run(['--rotate-approval-secret', '--proof', s.proof])
  assert.equal(argv.status, 2)
  assert.ok(!argv.stderr.includes(s.proof))
  assert.equal(run(['--rotate-approval-secret'], { BRAND_OS_AGENT_TOKEN: 'bos_at_agent' }, `${s.proof}\n`).status, 2)
  assert.equal(approvalProofMatches(s.root, s.proof), true, 'nothing rotated yet')
  const ok = run(['--rotate-approval-secret'], {}, `${s.proof}\n`)
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /Rotated the approval secret\. Re-sealed 5 approval/)
  assert.match(ok.stdout, /strategy ads-main@1/)
  const printed = /New approval proof[^\n]*\n([0-9a-f]{48})/.exec(ok.stderr)?.[1]
  assert.ok(printed, ok.stderr)
  assert.equal(approvalProofMatches(s.root, printed), true)
  assert.match(ok.stderr, /Agent tokens stay valid/)
})
