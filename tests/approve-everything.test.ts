import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { ensureApprovalSecret, InterviewEngine, openWorkspace } from '@brand-os/brand-core'
import { loadWeekRecord, proposeWeek, reviewWeek } from '@brand-os/brand-core/content-bridge'
import { addVariant, createProject, listAspectProposals, readPreference, recordFeedback, suggestAspects, suggestPreference } from '@brand-os/brand-core/creative'
import { approveEverything, everythingDryRun, formatPending, parseOnlyKinds, planEverything } from '@brand-os/brand-core/pending'
import { evaluateKit, initKit, readKit, reviewKit } from '@brand-os/brand-core/social-kit'
import { loadRecord, proposeRevision, reviewRevision } from '@brand-os/brand-core/strategy'
import { contentBrand, plannedWeek } from './helpers/content.js'
import { brandDir, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NOW, seoProposal } from './helpers/strategy.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * One review, one approval: `brand:approve --all-pending` also approves strategy drafts, calendar weeks, social style
 * kit styles, creative preferences and aspect proposals, each through its own store with the digest its review shows.
 */
useTestKey()
const now = () => NOW

/** Hash of every file under brand/ (including brand/.private) so a dry run or refusal can be shown to write nothing. */
function snapshot(root: string): string {
  const hash = crypto.createHash('sha256')
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else hash.update(`${path.relative(root, full)}\0`).update(fs.readFileSync(full))
    }
  }
  walk(path.join(root, 'brand'))
  return hash.digest('hex')
}

function cli(root: string, args: string[], env: Record<string, string> = {}, input = '') {
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') base[key] = value
  }
  return spawnSync(NODE, tsxArgs('scripts/brand.ts', args), { cwd: root, env: { ...base, BRAND_OS_KEYCHAIN: 'off', BRAND_OS_DATA_KEY: TEST_DATA_KEY, ...env }, input, encoding: 'utf8', timeout: 120_000 })
}

/** A creative project with one feedback note, a draft preference and a pending aspect proposal. */
function creativeDrafts(ws: ReturnType<typeof openWorkspace>): void {
  createProject(ws, { project_id: 'launch-reel', title: 'Launch reels', surface: 'reel', series: 'launch', language: 'en' })
  addVariant(ws, { project_id: 'launch-reel', variant_id: 'A', asset: 'missing' })
  const fb = recordFeedback(ws, { project_id: 'launch-reel', variant_id: 'A', text: 'The lighting is great but there is too much text.', verdict: 'change_request' })
  suggestPreference(ws, { project_id: 'launch-reel', statement: 'Keep the lighting soft and the text short.', sources: [fb.note.id] })
  assert.equal(suggestAspects(ws, { project_id: 'launch-reel' }).created.length, 1)
}

/** Facts, an SEO strategy draft, a calendar week draft, social kit drafts and creative drafts, all pending at once. */
async function mixedBrand() {
  const s = await contentBrand('mixed-pending')
  assert.equal(s.engine.changeAnswer('brand.strategy.vision', 'A pending vision for the bulk run.').kind, 'recorded')
  const seo = proposeRevision(s.ws, { strategy_id: 'seo-main', proposal: seoProposal(s.research) }).revision
  const week = plannedWeek(s, '2026-11-23')
  const wk = proposeWeek(s.ws, { week }).revision
  initKit(s.ws, { surfaces: ['post', 'story'], styles: 2 })
  creativeDrafts(s.ws)
  return { ...s, seo, week, wk }
}

test('the plan lists every kind, with the same digest each kind\'s own review shows', async () => {
  const s = await mixedBrand()
  const plan = planEverything(s.engine.approvals(), s.root, { now })
  const kinds = new Set([...plan.base.entries.map((entry) => entry.kind), ...plan.extras.map((entry) => entry.kind)])
  for (const kind of ['fact', 'strategy', 'week', 'social_style', 'creative_preference', 'aspect_proposal']) assert.ok(kinds.has(kind as never), `${kind} is listed`)
  const strategy = plan.extras.find((entry) => entry.kind === 'strategy' && entry.id === 'seo-main')!
  assert.equal(strategy.decision, 'approve', strategy.reason)
  assert.equal(strategy.digest, reviewRevision(s.ws, { strategy_id: 'seo-main', revision: 1 }).content_sha256)
  assert.ok(strategy.look_first)
  const week = plan.extras.find((entry) => entry.kind === 'week')!
  assert.equal(week.decision, 'approve', week.reason)
  assert.equal(week.digest, reviewWeek(s.ws, { week_id: s.week.week_id, revision: 1 }).content_sha256)
  for (const surface of ['post', 'story']) {
    const entry = plan.extras.find((item) => item.kind === 'social_style' && item.id === surface)!
    assert.equal(entry.digest, reviewKit(s.ws, { surface }).expect_sha, `${surface} digest`)
    assert.equal(entry.styles?.length, 2)
  }
  // The approved content strategy is not pending; only the newest draft revision of a strategy is.
  assert.ok(!plan.extras.some((entry) => entry.id === 'content-main'))
  const fa = planEverything(s.engine.approvals(), s.root, { now, lang: 'fa' })
  assert.match(fa.extras.find((entry) => entry.kind === 'week')!.summary, /هفتهٔ/)
  const text = formatPending(everythingDryRun(plan), 'en')
  assert.match(text, /npm run brand:approve -- --all-pending$/m)
  assert.match(text, /npm run brand:strategy -- review --id seo-main --revision 1/)
  const narrowed = planEverything(s.engine.approvals(), s.root, { now, only: parseOnlyKinds('strategy,weeks') })
  assert.deepEqual([...new Set(narrowed.extras.map((entry) => entry.kind))].sort(), ['strategy', 'week'])
  assert.equal(narrowed.base.entries.length, 0)
  assert.throws(() => parseOnlyKinds('posts'), /does not know "posts"/)
})

test('a mixed pending set is approved in one run with one proof, each through its own store', async () => {
  const s = await mixedBrand()
  const approvals = s.engine.approvals()
  const plan = planEverything(approvals, s.root, { now, exclude: ['story', 'nothing-like-this'] })
  assert.deepEqual(plan.unmatched_excludes, ['nothing-like-this'])
  const result = approveEverything(approvals, s.root, plan, s.proof, 'owner', { now })
  assert.equal(result.proof, 'accepted')
  assert.equal(result.counts.refused, 0, JSON.stringify(result.results.filter((item) => item.outcome === 'refused'), null, 2))
  const outcome = (kind: string, id?: string) => result.results.find((item) => item.kind === kind && (id === undefined || item.id === id))?.outcome
  assert.equal(outcome('fact', 'brand.strategy.vision'), 'approved')
  assert.equal(outcome('strategy', 'seo-main'), 'approved')
  assert.equal(outcome('week'), 'approved')
  assert.equal(outcome('social_style', 'post'), 'approved')
  assert.equal(outcome('social_style', 'story'), 'skipped', 'excluded')
  assert.equal(outcome('creative_preference'), 'approved')
  assert.equal(outcome('aspect_proposal'), 'approved')

  assert.equal(loadRecord(s.ws, 'seo-main').revisions[0]!.state, 'approved')
  assert.equal(loadWeekRecord(s.ws, s.week.week_id).revisions[0]!.state, 'approved')
  const kit = readKit(s.root, s.ws.brandSlug)
  assert.equal(kit.state, 'ok')
  if (kit.state === 'ok') {
    const states = evaluateKit(s.root, kit.kit)
    assert.ok(states.filter((state) => state.style.surface === 'post').every((state) => state.status === 'approved'))
    assert.ok(states.filter((state) => state.style.surface === 'story').every((state) => state.status === 'draft'))
  }
  const prefId = result.results.find((item) => item.kind === 'creative_preference')!.id
  assert.equal(readPreference(s.ws, prefId).state, 'approved')
  assert.deepEqual(listAspectProposals(s.ws, { state: 'pending' }), [])

  // Nothing left except the excluded surface.
  const after = planEverything(approvals, s.root, { now })
  assert.deepEqual(after.extras.filter((entry) => entry.decision === 'approve').map((entry) => entry.id), ['story'])
})

test('a week edited after planning is stale and not approved; the rest still goes through', async () => {
  const s = await mixedBrand()
  const approvals = s.engine.approvals()
  const plan = planEverything(approvals, s.root, { now, only: ['week', 'strategy'] })
  // The owner edits the week: a new draft revision replaces the one that was planned.
  const edited = { ...s.week, slots: s.week.slots.map((slot, index) => (index === 0 ? { ...slot, key_message: null, offer: null } : slot)) }
  const v2 = proposeWeek(s.ws, { week: edited }).revision
  assert.equal(v2.revision, 2)
  const result = approveEverything(approvals, s.root, plan, s.proof, 'owner', { now })
  const week = result.results.find((item) => item.kind === 'week')!
  assert.equal(week.outcome, 'stale', week.reason)
  assert.deepEqual(loadWeekRecord(s.ws, s.week.week_id).revisions.map((entry) => entry.state), ['draft', 'draft'])
  assert.equal(result.results.find((item) => item.kind === 'strategy')!.outcome, 'approved')
  assert.equal(result.counts.stale, 1)
})

test('a wrong proof refuses every item and writes nothing; an agent token refuses planning', async () => {
  const s = await mixedBrand()
  const approvals = s.engine.approvals()
  const plan = planEverything(approvals, s.root, { now })
  const before = snapshot(s.root)
  const result = approveEverything(approvals, s.root, plan, 'not-the-proof', 'owner', { now })
  assert.equal(result.proof, 'rejected')
  assert.ok(result.results.every((item) => item.outcome === 'refused'))
  assert.equal(snapshot(s.root), before)
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_test'
  try {
    assert.throws(() => planEverything(approvals, s.root, { now }), /Refusing while BRAND_OS_AGENT_TOKEN is set/)
    assert.throws(() => approveEverything(approvals, s.root, plan, s.proof), /Refusing while BRAND_OS_AGENT_TOKEN is set/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.equal(snapshot(s.root), before)
})

/** A brand whose pending items do not depend on the clock: a fact draft, social kit drafts and creative drafts. */
function cliBrand() {
  const root = brandDir({ slug: 'cli-pending' })
  const proof = ensureApprovalSecret(root)
  const engine = new InterviewEngine(root)
  assert.equal(engine.changeAnswer('brand.strategy.vision', 'A vision waiting for approval.').kind, 'recorded')
  const ws = openWorkspace(root)
  initKit(ws, { surfaces: ['post'], styles: 2 })
  creativeDrafts(ws)
  return { root, proof, ws }
}

test('CLI: brand:pending and --dry-run write nothing; the approve run reads the proof once from stdin', () => {
  const b = cliBrand()
  const before = snapshot(b.root)
  const pending = cli(b.root, ['pending'])
  assert.equal(pending.status, 0, pending.stderr)
  assert.match(pending.stdout, /waiting for your approval/)
  assert.match(pending.stdout, /Social style kit, per format/)
  assert.match(pending.stdout, /npm run brand:approve -- --all-pending/)
  const fa = cli(b.root, ['pending', '--lang', 'fa', '--only', 'social'])
  assert.equal(fa.status, 0, fa.stderr)
  assert.match(fa.stdout, /npm run brand:approve -- --all-pending --only social_style/)
  const dry = cli(b.root, ['approve', '--all-pending', '--dry-run', '--json'])
  assert.equal(dry.status, 0, dry.stderr)
  const report = JSON.parse(dry.stdout) as { nothing_changed: boolean; items: Array<{ kind: string; decision: string; digest?: string }>; approve_with: string }
  assert.equal(report.nothing_changed, true)
  assert.ok(report.items.some((item) => item.kind === 'social_style' && item.decision === 'would_approve' && /^[0-9a-f]{64}$/.test(item.digest ?? '')))
  assert.ok(report.items.some((item) => item.kind === 'creative_preference'))
  assert.ok(report.items.some((item) => item.kind === 'fact'))
  assert.equal(cli(b.root, ['approve', '--all-pending', '--only', 'nonsense']).status, 2)
  assert.equal(snapshot(b.root), before, 'pending and dry runs write nothing')

  // The proof is piped once; stdin can be read only once, so every kind used the same single read.
  const run = cli(b.root, ['approve', '--all-pending', '--json'], {}, `${b.proof}\n`)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  const result = JSON.parse(run.stdout) as { proof: string; counts: Record<string, number>; results: Array<{ kind: string; outcome: string }> }
  assert.equal(result.proof, 'accepted')
  for (const kind of ['fact', 'social_style', 'creative_preference', 'aspect_proposal']) assert.ok(result.results.some((item) => item.kind === kind && item.outcome === 'approved'), `${kind} approved`)
  assert.equal(result.counts.refused, 0)
  const empty = cli(b.root, ['pending'])
  assert.match(empty.stdout, /Nothing is waiting|0 item/)
})

test('CLI: refused under an agent token, and the proof is never accepted from argv', () => {
  const b = cliBrand()
  const before = snapshot(b.root)
  for (const args of [['approve', '--all-pending'], ['approve', '--all-pending', '--dry-run'], ['pending']]) {
    const run = cli(b.root, args, { BRAND_OS_AGENT_TOKEN: 'bos_at_agent', BRAND_OS_APPROVAL_PROOF: b.proof })
    assert.equal(run.status, 2, `${args.join(' ')}: ${run.stdout}${run.stderr}`)
    assert.match(run.stderr, /BRAND_OS_AGENT_TOKEN/)
  }
  for (const args of [['approve', '--all-pending', '--proof', b.proof], ['pending', '--proof', b.proof]]) {
    const run = cli(b.root, args)
    assert.equal(run.status, 2)
    assert.match(run.stderr, /--proof is not accepted/)
    assert.ok(!run.stdout.includes(b.proof) && !run.stderr.includes(b.proof), 'the value is never echoed')
  }
  assert.equal(snapshot(b.root), before)
})
