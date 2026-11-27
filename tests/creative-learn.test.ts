import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { agentTokenContext, AGENT_PROFILES, guestContext, issueAgentToken, readAccessLog, type AgentProfile } from '@brand-os/brand-core'
import { learnFromCorrection, listPreferences, readProject, runCreativeContextTool, runCreativeLearnTool, type CreativeLearnToolResult } from '@brand-os/brand-core/creative'
import { approveEverything, planEverything } from '@brand-os/brand-core/pending'
import { creative, ok, pilitoBrand } from './helpers/creative.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * Learning from corrections: one call records the owner's words (and before/after) as a local note, a feedback event
 * in the series' learning project, and a DRAFT rule asking for series scope. The rule reaches new work only after
 * brand:approve --all-pending. Nothing is committed.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

const FEEDBACK = 'FEEDBACK-CANARY جمله‌ها کوتاه‌تر و محاوره‌ای‌تر؛ لحن کتابی نباشد.'
const BEFORE = 'BEFORE-CANARY در این ویدیو به بررسی مفهوم برند شخصی خواهیم پرداخت.'
const AFTER = 'AFTER-CANARY بیا ببینیم برند شخصی واقعاً یعنی چی.'
const RULE = 'Narration: short spoken Persian sentences, address the viewer as تو, no bookish openings.'

const writer = (slug = 'pilito') => agentTokenContext(slug, 'agt_creative', 'creative-read')
const input = { surface: 'narration', series: 'explainer-reels', feedback: FEEDBACK, before: BEFORE, after: AFTER, rule: RULE, avoid: ['diction'], language: 'fa' }

test('creative_learn records a draft rule for the series; it applies to new work only after brand:approve --all-pending', () => {
  const s = pilitoBrand()
  const result = runCreativeLearnTool(s.engine, writer(), input)
  assert.equal(result.status, 'ok', result.reason)
  const data = result.data!
  assert.equal(data.project_id, 'learn-narration-explainer-reels')
  assert.equal(data.project_created, true)
  assert.equal(data.preference.state, 'draft')
  assert.equal(data.preference.requested_scope, 'series')
  assert.deepEqual(data.authorizes, [])

  // The words, before and after live in a local (gitignored) note; the project only cites it.
  const project = readProject(s.ws, data.project_id)
  assert.equal(project.surface, 'narration')
  assert.equal(project.feedback[0]!.source_kind, 'agent_capture')
  assert.deepEqual(project.feedback[0]!.avoid, ['diction'])
  assert.ok(!JSON.stringify(project).includes('CANARY'))
  assert.equal(data.note.scope, 'local')
  const notes = fs.readdirSync(path.join(s.root, 'brand/.private/knowledge/local'))
  const body = notes.map((file) => fs.readFileSync(path.join(s.root, 'brand/.private/knowledge/local', file), 'utf8')).join('\n')
  for (const canary of [FEEDBACK, BEFORE, AFTER]) assert.ok(body.includes(canary))

  // Draft: new work of the series does not get it yet; the agent sees it counted.
  const before = runCreativeContextTool(s.engine, writer(), { surface: 'narration', series: 'explainer-reels' }).data!
  assert.equal(before.preferences.length, 0)
  assert.equal(before.withheld.preferences.draft, 1)

  // One owner command approves it for the whole series, as the plan shows.
  const plan = planEverything(s.engine.approvals(), s.root)
  const entry = plan.extras.find((item) => item.id === data.preference.preference_id)!
  assert.equal(entry.scope, 'series')
  assert.match(entry.summary, /whole series/)
  const done = approveEverything(s.engine.approvals(), s.root, plan, s.proof)
  assert.ok(done.results.some((item) => item.id === data.preference.preference_id && item.outcome === 'approved'))

  const after = runCreativeContextTool(s.engine, writer(), { surface: 'narration', series: 'explainer-reels' }).data!
  assert.deepEqual(after.preferences.map((pref) => pref.statement), [RULE])
  assert.match(after.preferences[0]!.scope, /series explainer-reels \(narration\)/)
  // Local note text still stays on the owner's computer; the rule itself carries what to do.
  for (const canary of ['FEEDBACK-CANARY', 'BEFORE-CANARY', 'AFTER-CANARY']) assert.ok(!JSON.stringify(after).includes(canary), canary)
  // Other series are untouched.
  assert.equal(runCreativeContextTool(s.engine, writer(), { surface: 'narration', series: 'podcast' }).data!.preferences.length, 0)
})

test('a second correction joins the same learning project and can supersede the approved rule', () => {
  const s = pilitoBrand()
  const first = runCreativeLearnTool(s.engine, writer(), input).data!
  approveEverything(s.engine.approvals(), s.root, planEverything(s.engine.approvals(), s.root), s.proof)
  const second = runCreativeLearnTool(s.engine, writer(), { ...input, feedback: 'Slower pace at the end.', rule: 'Narration: short spoken sentences; slow down for the last line.', supersedes: first.preference.preference_id, before: undefined, after: undefined })
  assert.equal(second.status, 'ok', second.reason)
  assert.equal(second.data!.project_created, false)
  assert.equal(readProject(s.ws, first.project_id).feedback.length, 2)
  approveEverything(s.engine.approvals(), s.root, planEverything(s.engine.approvals(), s.root), s.proof)
  const prefs = listPreferences(s.ws)
  assert.equal(prefs.find((pref) => pref.preference_id === first.preference.preference_id)!.state, 'superseded')
  const ctx = runCreativeContextTool(s.engine, writer(), { surface: 'narration', series: 'explainer-reels' }).data!
  assert.deepEqual(ctx.preferences.map((pref) => pref.preference_id), [second.data!.preference.preference_id])
})

test('creative_learn answers only a creative-read token of this brand, refuses bad input and secrets, and logs ids only', () => {
  const s = pilitoBrand()
  const denied: CreativeLearnToolResult[] = [
    runCreativeLearnTool(s.engine, guestContext('pilito'), input),
    ...(Object.keys(AGENT_PROFILES) as AgentProfile[]).filter((p) => p !== 'creative-read').map((p) => runCreativeLearnTool(s.engine, agentTokenContext('pilito', `agt_${p}`, p), input)),
    runCreativeLearnTool(s.engine, agentTokenContext('northwind', 'agt_x', 'creative-read'), input),
  ]
  for (const result of denied) assert.equal(result.status, 'denied')
  assert.equal(listPreferences(s.ws).length, 0)

  assert.equal(runCreativeLearnTool(s.engine, writer(), { ...input, surface: 'billboard' }).status, 'invalid')
  assert.equal(runCreativeLearnTool(s.engine, writer(), { ...input, verdict: 'reject' }).status, 'invalid')
  assert.equal(runCreativeLearnTool(s.engine, writer(), { ...input, scope: 'brand' }).status, 'invalid')
  assert.equal(runCreativeLearnTool(s.engine, writer(), { ...input, rule: 'x'.repeat(201) }).status, 'invalid')
  assert.equal(runCreativeLearnTool(s.engine, writer(), { ...input, feedback: 'key: AKIAIOSFODNN7EXAMPLE secret' }).status, 'refused')
  assert.equal(listPreferences(s.ws).length, 0)

  runCreativeLearnTool(s.engine, writer(), input)
  const lines = readAccessLog(s.root).filter((line) => line.tool === 'creative_learn')
  assert.ok(lines.length >= 10)
  assert.ok(!JSON.stringify(lines).includes('CANARY'))
  assert.ok(lines.some((line) => line.decision === 'allow' && line.returned_ids.length === 4))
})

test('owner CLI: brand:creative learn does the same in one command and is refused under an agent token', () => {
  const s = pilitoBrand()
  const dir = fs.mkdtempSync(path.join(s.root, 'tmp-'))
  fs.writeFileSync(path.join(dir, 'before.txt'), BEFORE)
  fs.writeFileSync(path.join(dir, 'after.txt'), AFTER)
  const out = ok(creative(s.root, ['learn', '--surface', 'narration', '--series', 'explainer-reels', '--text', FEEDBACK, '--before-file', path.join(dir, 'before.txt'), '--after-file', path.join(dir, 'after.txt'), '--rule', RULE, '--avoid', 'diction', '--lang', 'fa', '--json']))
  assert.equal((out.preference as { requested_scope: string }).requested_scope, 'series')
  const refused = creative(s.root, ['learn', '--surface', 'narration', '--series', 'explainer-reels', '--text', FEEDBACK, '--rule', RULE, '--json'], { BRAND_OS_AGENT_TOKEN: 'anything' })
  assert.notEqual(refused.status, 0)
  // Direct call under an agent token is refused too.
  process.env.BRAND_OS_AGENT_TOKEN = 'x'
  try {
    assert.throws(() => learnFromCorrection(s.ws, input), /Refusing while/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
})

test('over MCP stdio: creative_learn writes a draft for a creative-read token; a design token is denied', async () => {
  const s = pilitoBrand()
  const env = (token?: string) => {
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
    out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    if (token) out.BRAND_OS_AGENT_TOKEN = token
    return out
  }
  const connect = async (token?: string) => {
    const client = new Client({ name: 'learn-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: s.root, env: env(token), stderr: 'pipe' }))
    return client
  }
  const parse = (result: unknown) => JSON.parse((result as { content: Array<{ text: string }> }).content[0]!.text) as CreativeLearnToolResult
  const creativeToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'creative-read', label: 'cowork' })
  const designToken = issueAgentToken(s.root, { brandId: 'pilito', profile: 'design', label: 'facts' })
  const client = await connect(creativeToken.token)
  try {
    const result = parse(await client.callTool({ name: 'creative_learn', arguments: { surface: 'narration', series: 'explainer-reels', feedback: FEEDBACK, rule: RULE } }))
    assert.equal(result.status, 'ok', result.reason)
    assert.equal(result.data!.preference.state, 'draft')
  } finally {
    await client.close()
  }
  const other = await connect(designToken.token)
  try {
    assert.equal(parse(await other.callTool({ name: 'creative_learn', arguments: { surface: 'narration', series: 'explainer-reels', feedback: FEEDBACK, rule: RULE } })).status, 'denied')
  } finally {
    await other.close()
  }
  assert.equal(listPreferences(s.ws).length, 1)
})
