import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { readAccessLog } from '@brand-os/brand-core'
import { proposeWeek, recordSlotFeedback, recordSlotMetrics } from '@brand-os/brand-core/content-bridge'
import { approvePreference, suggestPreference } from '@brand-os/brand-core/creative'
import { ENGINE_COMMANDS } from '../scripts/engine/commands.js'
import { buildPack, PACK_FILES, scanPack, writePack } from '../scripts/pack-lib.js'
import { approvedWeek, BUDGET_FACT_CANARY, contentBrand, plannedWeek, PROMISE, VOICE } from './helpers/content.js'
import { listTree, TEST_DATA_KEY, treeText, useTestKey } from './helpers/knowledge.js'
import { NOW } from './helpers/strategy.js'

/**
 * brand:pack: the owner's read-only Markdown pack for chat products without MCP. It is built from the readers an agent
 * token of the profile uses, so restricted values, drafts and note text are excluded by construction; a scan refuses
 * to write if one slips through; a non-ignored --out inside the repository and an agent token are refused.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const DRAFT_FACT_CANARY = 'DRAFT-TAGLINE-CANARY say it loud'
const DRAFT_HOOK_CANARY = 'DRAFT-WEEK-HOOK-CANARY'
const DRAFT_PREF_CANARY = 'DRAFT-PREFERENCE-CANARY neon everywhere'
const NOTE_CANARY = 'NOTE-TEXT-CANARY captions run long'

async function packBrand() {
  const s = await contentBrand('pilito')
  const week = plannedWeek(s, '2026-11-23')
  approvedWeek(s, week)
  const next = plannedWeek(s, '2026-11-30')
  proposeWeek(s.ws, { week: { ...next, slots: next.slots.map((slot, i) => (i === 0 ? { ...slot, hook: DRAFT_HOOK_CANARY } : slot)) } })
  assert.equal(s.engine.changeAnswer('brand.verbal.tagline', DRAFT_FACT_CANARY).kind, 'recorded')
  const reel = week.slots.find((slot) => slot.format === 'reel')!
  const fb = recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: NOTE_CANARY, avoid: ['length'] })
  const pref = suggestPreference(s.ws, { project_id: fb.project.project_id, statement: 'Keep reel captions under 120 characters', sources: [fb.note.id] })
  approvePreference(s.ws, { preference_id: pref.preference_id, proof: s.proof, scope: 'series' })
  suggestPreference(s.ws, { project_id: fb.project.project_id, statement: DRAFT_PREF_CANARY, sources: [fb.note.id] })
  recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: reel.id, metrics: { views: 4321 }, measured_at: '2026-11-23' })
  return { s, week, reel }
}

const NEVER = [BUDGET_FACT_CANARY, 'business.marketing.budget', DRAFT_FACT_CANARY, DRAFT_HOOK_CANARY, DRAFT_PREF_CANARY, 'NOTE-TEXT-CANARY']

test('content-read pack: approved facts, strategy, calendar briefs and preferences; never restricted, drafts or note text', async () => {
  const { s, week } = await packBrand()
  const out = path.join(os.tmpdir(), `brand-os-pack-${process.pid}-${Date.now()}`)
  const result = writePack(s.root, { profile: 'content-read', out, now: NOW })
  assert.deepEqual(listTree(out), [...PACK_FILES], 'deterministic file list')
  assert.deepEqual(result.authorizes, [])
  for (const file of PACK_FILES) assert.equal(fs.statSync(path.join(out, file)).mode & 0o777, 0o600, file)
  const all = treeText(out)
  for (const canary of NEVER) assert.ok(!all.includes(canary), canary)
  assert.ok(!all.includes(s.proof), 'the approval secret never appears')

  const read = (name: string) => fs.readFileSync(path.join(out, name), 'utf8')
  assert.match(read('00-README.md'), /Uploading these files to a hosted product/)
  assert.match(read('00-README.md'), /export again/)
  assert.match(read('00-README.md'), /Exported 2026-11-23/)
  const instructions = read('01-instructions.md')
  for (const pattern of [/Cite the fact id/, /Never invent a claim, price/, /banned claim/, /### Reel script/, /### Carousel/, /### Post/, /### Story/, /### LinkedIn post/, /npm run brand:content -- feedback --week <week id> --slot <slot id>/, /no permission to publish/]) assert.match(instructions, pattern)
  assert.ok(read('02-brand.md').includes(`\`brand.verbal.voice\``) && read('02-brand.md').includes(VOICE))
  assert.match(read('02-brand.md'), /## Voice/)
  assert.ok(read('02-brand.md').includes(PROMISE))
  assert.match(read('03-content-strategy.md'), /## content-main revision 1 \(current\)/)
  assert.match(read('03-content-strategy.md'), /Guaranteed fluency/)
  assert.match(read('03-content-strategy.md'), /\| instagram \|/)
  const calendar = read('04-calendar.md')
  assert.match(calendar, new RegExp(`## ${week.week_id}`))
  assert.ok(!calendar.includes('wk-2026-11-30'), 'the draft week is not listed')
  assert.match(calendar, /Keep reel captions under 120 characters/)
  assert.match(read('05-creative-preferences.md'), /Keep reel captions under 120 characters \(series instagram \(reel\)/)
  assert.match(read('06-social-style-kit.md'), /No style kit in this brand yet/)
  assert.ok(result.counts.slots >= 1 && result.counts.preferences === 1)

  // Same inputs, same bytes.
  const again = buildPack(s.root, { profile: 'content-read', now: NOW })
  assert.deepEqual(again.files.map((f) => f.name), [...PACK_FILES])
  for (const file of again.files) assert.equal(file.text, read(file.name), file.name)
  // Every reader call is audited as the owner's export.
  assert.ok(readAccessLog(s.root).some((line) => (line as { principal?: string }).principal === 'owner-export:pack'))
})

test('other profiles get their facts only; the default out is git-ignored; unsafe out dirs and agent tokens are refused', async () => {
  const { s } = await packBrand()
  const design = writePack(s.root, { profile: 'design', now: NOW })
  assert.equal(design.out, path.join(s.root, 'brand/.private/exports/pack-design-2026-11-23'))
  const text = treeText(design.out)
  for (const canary of [...NEVER, 'Keep reel captions under 120 characters']) assert.ok(!text.includes(canary), canary)
  assert.match(fs.readFileSync(path.join(design.out, '04-calendar.md'), 'utf8'), /Not included for this profile/)
  assert.ok(!text.includes('business.customer.primary_segment'), 'design does not read business modules')
  const marketing = buildPack(s.root, { profile: 'marketing', now: NOW })
  assert.ok(marketing.files.find((f) => f.name === '02-brand.md')!.text.includes('business.customer.primary_segment'))

  assert.throws(() => writePack(s.root, { profile: 'content-read', out: path.join(s.root, 'brand', 'pack'), now: NOW }), /not git-ignored/)
  assert.throws(() => writePack(s.root, { profile: 'content-read', out: s.root, now: NOW }), /not git-ignored/)
  const busy = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-pack-busy-'))
  fs.writeFileSync(path.join(busy, 'notes.txt'), 'x')
  assert.throws(() => writePack(s.root, { profile: 'content-read', out: busy, now: NOW }), /other files/)
  assert.throws(() => buildPack(s.root, { profile: 'finance', now: NOW }), /--profile is one of/)
  assert.throws(() => buildPack(s.root, { profile: 'content-read', lang: 'de', now: NOW }), /--lang/)
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_at_fake'
  try {
    assert.throws(() => buildPack(s.root, { profile: 'content-read', now: NOW }), /BRAND_OS_AGENT_TOKEN/)
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }

  // The scan fails closed on a restricted id or value, the secret, its shape or a token.
  const files = [{ name: '02-brand.md' as const, text: 'fine' }]
  const forbidden = { ids: ['business.marketing.budget'], values: [BUDGET_FACT_CANARY], secret: s.proof }
  assert.deepEqual(scanPack(files, forbidden), [])
  for (const leak of ['see business.marketing.budget', BUDGET_FACT_CANARY, s.proof, 'a'.repeat(48), 'bos_at_abcdefghijklmnop']) {
    assert.ok(scanPack([{ name: '02-brand.md', text: `x ${leak} y` }], forbidden).length > 0, leak)
  }
  assert.deepEqual(scanPack([{ name: '02-brand.md', text: `sha ${'b'.repeat(64)}` }], forbidden), [], 'a content hash is not a secret')
})

test('CLI: brand:pack writes the default pack, prints json, refuses under an agent token; the engine offers it', async () => {
  const { s } = await packBrand()
  const cli = (args: string[], extra: Record<string, string> = {}) => {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN') env[key] = value
    env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    return spawnSync(tsx, [path.join(repo, 'scripts/pack.ts'), ...args], { cwd: s.root, encoding: 'utf8', env: { ...env, ...extra }, input: '' })
  }
  const ok = cli(['--profile', 'content-read', '--lang', 'fa', '--json'])
  assert.equal(ok.status, 0, ok.stderr)
  const json = JSON.parse(ok.stdout) as { ok: boolean; out: string; files: Array<{ name: string }> }
  assert.equal(json.ok, true)
  assert.match(json.out, /brand\/\.private\/exports\/pack-content-read-\d{4}-\d{2}-\d{2}$/)
  assert.deepEqual(json.files.map((f) => f.name), [...PACK_FILES])
  assert.match(fs.readFileSync(path.join(json.out, '00-README.md'), 'utf8'), /خلاصه/)
  const refused = cli(['--profile', 'content-read'], { BRAND_OS_AGENT_TOKEN: 'bos_at_fake' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /BRAND_OS_AGENT_TOKEN/)
  assert.equal(cli([]).status, 2)
  assert.deepEqual(ENGINE_COMMANDS.pack, { script: 'pack', prefix: [], npm: 'brand:pack' })
})
