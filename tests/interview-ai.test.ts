import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyProposalBatch, ensureApprovalSecret, InterviewEngine, nextReport, parseProposalBatch, writeStarterWorkspace } from '@brand-os/brand-core'

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const FLASHCARD =
  'Our product is a multilingual flashcard app. Initially we are targeting students, but we may launch B2B packages for companies in the future. Pricing is not decided yet.'

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-ai-'))
  writeStarterWorkspace(dir)
  return dir
}

const read = (root: string, relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')
const latest = (engine: InterviewEngine, id: string) => [...engine.ledger().records].reverse().find((record) => record.question_id === id && !record.superseded_by)
const approvedFacts = (root: string) => read(root, 'brand/instance/approved-facts.yaml')
test('proposal intake: conflicts need the owner, corrections to approved facts become change proposals', () => {
  const root = workspace()
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  const batch = (proposals: unknown[], text: string) => {
    const parsed = parseProposalBatch({ schema_version: 1, source: { kind: 'interview_turn', ref: 'turn-1' }, source_text: text, proposals })
    assert.ok(parsed.ok)
    return applyProposalBatch(engine, parsed.batch, { origin: 'agent', dropped: parsed.dropped })
  }
  assert.equal(parseProposalBatch({ schema_version: 1, source: { kind: 'interview_turn', ref: 'x' }, source_text: 'x', proposals: [], approve: true }).ok, false)

  const first = batch([{ question_id: 'business.customer.primary_segment', value: 'students', state: 'proposed', confidence: 0.8, quotation: 'we serve students' }], 'we serve students')
  assert.equal(first.results[0]?.outcome, 'drafted')
  const second = batch([{ question_id: 'business.customer.primary_segment', value: 'teachers', state: 'proposed', confidence: 0.8, quotation: 'mostly teachers' }], 'mostly teachers')
  assert.equal(second.results[0]?.outcome, 'conflict')
  assert.equal(latest(engine, 'business.customer.primary_segment')?.value, 'students', 'a conflicting draft is not overwritten')
  assert.equal(nextReport(engine).conflicts[0]?.question_id, 'business.customer.primary_segment')
  const corrected = batch([{ question_id: 'business.customer.primary_segment', value: 'teachers', state: 'proposed', confidence: 0.9, quotation: 'Actually, teachers', correction: true }], 'Actually, teachers')
  assert.equal(corrected.results[0]?.outcome, 'drafted')
  assert.equal(nextReport(engine).conflicts.length, 0)

  assert.equal(engine.approve('business.customer.primary_segment', 'owner', proof).status, 'approved')
  const before = approvedFacts(root)
  const change = batch([{ question_id: 'business.customer.primary_segment', value: 'parents', state: 'proposed', confidence: 0.9, quotation: 'correction: parents', correction: true }], 'correction: parents')
  assert.equal(change.results[0]?.outcome, 'change_proposed')
  assert.equal(approvedFacts(root), before, 'the approved revision stays until a human approves the change')
})

test('changeAnswer with unknown, skip or n/a marks a disposition instead of storing the word', () => {
  const root = workspace()
  const engine = new InterviewEngine(root)
  engine.answerQuestion('business.offer.summary', 'A practice app')
  const result = engine.changeAnswer('business.offer.summary', 'unknown', false)
  assert.equal(result.kind, 'recorded')
  assert.equal(result.status, 'unknown')
  const record = latest(engine, 'business.offer.summary')
  assert.equal(record?.status, 'unknown')
  assert.equal(record?.value, null)
  assert.equal(engine.changeAnswer('business.offer.summary', 'n/a', false).status, 'not_applicable')
  assert.equal(engine.changeAnswer('business.offer.summary', 'skip', false).status, 'skipped')

  const proof = ensureApprovalSecret(root)
  engine.answerQuestion('business.offer.summary', 'A practice app')
  assert.equal(engine.approve('business.offer.summary', 'owner', proof).status, 'approved')
  const before = approvedFacts(root)
  assert.equal(engine.changeAnswer('business.offer.summary', 'unknown', true, 'owner').kind, 'error')
  assert.equal(approvedFacts(root), before)
})

test('CLI agent mode: --question in any order, brand:next --json and brand:propose', () => {
  const root = workspace()
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && !/^(ANTHROPIC_|BRAND_OS_APPROVAL_PROOF|BRAND_OS_AGENT_TOKEN)/.test(key)) env[key] = value
  const run = (args: string[], input = '') => spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), ...args], { cwd: root, env, input, encoding: 'utf8', timeout: 60_000 })

  // Out of order: pricing is far from the current question.
  const answered = run(['interview', '--question', 'business.sales.pricing', '--answer', 'unknown', '--json'])
  assert.equal(answered.status, 0, answered.stderr)
  const answer = JSON.parse(answered.stdout) as { ok: boolean; status: string; next: Array<{ id: string; reasons: string[] }> }
  assert.equal(answer.ok, true)
  assert.equal(answer.status, 'unknown')
  assert.ok(answer.next.length > 0 && answer.next[0]!.reasons.length > 0)

  const restricted = run(['interview', '--question', 'business.finance.revenue_figure', '--answer', '123', '--json'])
  assert.equal(restricted.status, 1)
  assert.match(restricted.stdout, /restricted/)

  const batchFile = path.join(root, 'batch.json')
  fs.writeFileSync(
    batchFile,
    JSON.stringify({
      schema_version: 1,
      source: { kind: 'interview_turn', ref: 'chat-1', language: 'en' },
      source_text: FLASHCARD,
      proposals: [
        { question_id: 'business.customer.primary_segment', value: 'students', state: 'proposed', confidence: 0.8, quotation: 'Initially we are targeting students' },
        { question_id: 'business.finance.runway', value: '12', state: 'proposed', confidence: 0.8, quotation: 'Pricing is not decided yet' },
      ],
    }),
  )
  const proposed = run(['propose', '--file', batchFile, '--json'])
  assert.equal(proposed.status, 0, proposed.stderr)
  const intake = JSON.parse(proposed.stdout) as { results: Array<{ question_id: string; outcome: string }>; notice: string }
  assert.deepEqual(intake.results.map((item) => item.outcome), ['drafted', 'rejected'])
  assert.match(intake.notice, /Nothing was approved/)

  const next = run(['next', '--json'])
  assert.equal(next.status, 0, next.stderr)
  const report = JSON.parse(next.stdout) as { next: Array<{ id: string }>; owner_only: Array<{ question_id: string }>; suggested_actions: string[] }
  assert.ok(report.next.length > 0)
  assert.ok(!report.next.some((item) => item.id.startsWith('business.finance.runway')))
  assert.ok(report.owner_only.some((item) => item.question_id === 'business.finance.runway'))
})
