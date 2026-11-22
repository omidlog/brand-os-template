import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { BUNDLE_SCHEMA } from '@brand-os/brand-core/research'
import { MESSAGE_QUOTE, PRICE_QUOTE, source } from './helpers/competitive.js'
import { brandDir, listTree, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * The Slice B owner journey through the real CLIs, real clock, no network: sources are recorded once with
 * `brand:seo research replay`, then indexed and cited with `brand:competitive`.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function cli(script: 'competitive' | 'seo', root: string, args: string[], env: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = { ...process.env, BRAND_OS_DATA_KEY: TEST_DATA_KEY, BRAND_OS_KNOWLEDGE_GH: 'off' }
  delete base.BRAND_OS_AGENT_TOKEN
  delete base.BRAND_OS_APPROVAL_PROOF
  delete base.BRAND_OS_RESEARCH_NETWORK
  const merged = { ...base, ...env }
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key]
  const result = spawnSync(tsx, [path.join(repo, 'scripts', `${script}.ts`), ...args], { cwd: root, encoding: 'utf8', env: merged as NodeJS.ProcessEnv, input: '' })
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(result.stdout) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: result.status, json, stdout: result.stdout, stderr: result.stderr }
}

function tracked(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const file of listTree(path.join(root, 'brand'))) if (!file.startsWith('.private/')) out[file] = fs.readFileSync(path.join(root, 'brand', file), 'utf8')
  return out
}

test('journey: gaps first, record sources once, index two candidates, cite, verify, read the landscape in fa', () => {
  const root = brandDir({ slug: 'pilito' })
  const before = tracked(root)
  const competitive = (args: string[], env?: Record<string, string | undefined>) => cli('competitive', root, args, env)

  // Nothing recorded and no research adapter: an honest gap checklist, not an invented report.
  const empty = competitive(['matrix', '--json'])
  assert.equal(empty.status, 0, empty.stdout + empty.stderr)
  const emptyView = empty.json.landscape as { state: string; gaps: Array<{ code: string }>; research: { state: string } }
  assert.equal(emptyView.state, 'no_candidates')
  assert.equal(emptyView.research.state, 'unavailable')
  assert.deepEqual(emptyView.gaps.map((g) => g.code).slice(0, 2), ['research_unavailable', 'scope_not_set'])

  // Sources go to Knowledge through the existing research CLI (replay: no network, original dates kept).
  const retrieved = new Date(Date.now() - 86_400_000)
  const bundle = {
    schema: BUNDLE_SCHEMA,
    recorded_with: 'test fixture (fictional competitor pages)',
    recorded_at: new Date().toISOString(),
    note: null,
    sources: [
      source({ url: 'https://wordflight-app.com/pricing', excerpts: [{ claim_key: 'wordflight.pricing.pro', quote: PRICE_QUOTE }], retrieved_at: retrieved }),
      source({ url: 'https://www.wordflight-app.com/', excerpts: [{ claim_key: 'wordflight.message.five_minutes', quote: MESSAGE_QUOTE }], retrieved_at: retrieved }),
    ],
  }
  const bundleFile = path.join(root, 'bundle.json')
  fs.writeFileSync(bundleFile, JSON.stringify(bundle))
  const replay = cli('seo', root, ['research', 'replay', '--bundle', bundleFile, '--json'])
  assert.equal(replay.status, 0, replay.stdout + replay.stderr)
  const [pricing, home] = (replay.json.results as Array<{ note_id: string; provenance: string }>).map((r) => r)
  assert.ok(pricing?.note_id && home?.note_id)

  assert.equal(competitive(['scope', '--purposes', 'pricing,identity', '--json']).status, 0)
  const added = competitive(['add', '--name', 'WordFlight', '--relationship', 'direct', '--geography', 'international', '--markets', 'US', '--domain', 'wordflight-app.com', '--json'])
  assert.equal(added.status, 0, added.stdout + added.stderr)
  const wf = (added.json.candidate as { competitor_id: string }).competitor_id
  assert.equal(competitive(['add', '--name', 'CardNest', '--markets', 'TR', '--json']).status, 0)
  const dup = competitive(['add', '--name', 'wordflight', '--markets', 'US', '--json'])
  assert.equal(dup.status, 1)
  assert.equal((dup.json.error as { code: string }).code, 'duplicate_candidate')

  const priceArgs = ['link', '--id', wf, '--note', pricing.provenance, '--claim', 'wordflight.pricing.pro', '--dimension', 'public_price', '--label', 'Pro on own pricing page', '--offer', 'Pro', '--currency', 'USD', '--market', 'US', '--period', 'month', '--commitment', 'annual', '--tax', 'excluded', '--promotion', 'none_observed', '--json']
  const fake = competitive([...priceArgs, '--amount', '9'])
  assert.equal(fake.status, 1)
  assert.equal((fake.json.error as { code: string }).code, 'unsupported_claim')
  const linked = competitive([...priceArgs, '--amount', '12'])
  assert.equal(linked.status, 0, linked.stdout + linked.stderr)
  assert.equal(competitive(['link', '--id', wf, '--note', home.note_id, '--claim', 'wordflight.message.five_minutes', '--dimension', 'public_message', '--label', 'Five minutes a day', '--json']).status, 0)
  const verified = competitive(['verify-domain', '--id', wf, '--note', home.note_id, '--claim', 'wordflight.message.five_minutes', '--json'])
  assert.equal(verified.status, 0, verified.stdout + verified.stderr)

  const matrix = competitive(['matrix', '--json'])
  const view = matrix.json.landscape as { state: string; candidates: Array<{ competitor_id: string; official_domain: string | null; assessment: string }>; prices: { rows: unknown[]; ranked: boolean }; authorizes: unknown[] }
  assert.equal(view.state, 'evidence_insufficient', 'CardNest is still unknown in scope')
  assert.equal(view.candidates.find((c) => c.competitor_id === wf)!.official_domain, 'wordflight-app.com')
  assert.equal(view.candidates.find((c) => c.competitor_id === wf)!.assessment, 'researched')
  assert.equal(view.prices.rows.length, 1)
  assert.equal(view.prices.ranked, false)
  assert.deepEqual(view.authorizes, [])

  const fa = competitive(['matrix', '--lang', 'fa'])
  assert.equal(fa.status, 0)
  assert.match(fa.stdout, /نامعلوم است/)
  const show = competitive(['show', '--id', wf])
  assert.match(show.stdout, new RegExp(`knowledge:${pricing.note_id}@[0-9a-f]{64}`))
  assert.ok(!show.stdout.includes(PRICE_QUOTE), 'the index never prints or stores the quote')
  assert.match(competitive(['list']).stdout, /WordFlight .*researched/)

  // An agent token is refused for reads and writes.
  const agent = competitive(['list', '--json'], { BRAND_OS_AGENT_TOKEN: 'bos_at_test-not-a-real-token-000000' })
  assert.equal(agent.status, 1)
  assert.equal((agent.json.error as { code: string }).code, 'refused')

  assert.equal(competitive(['link', '--id', wf]).status, 2, 'usage error')
  assert.deepEqual(tracked(root), before, 'no tracked brand file changed')
  assert.ok(listTree(path.join(root, 'brand', '.private', 'competitive')).some((file) => file.startsWith('candidates/cmp_')))
})
