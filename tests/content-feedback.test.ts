import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext, findNote } from '@brand-os/brand-core'
import {
  proposeWeek,
  readMetrics,
  recordSlotFeedback,
  recordSlotMetrics,
  runContentTool,
  slotProjectId,
  surfaceForFormat,
  type AgentCalendarDocument,
  type ContentBriefDocument,
} from '@brand-os/brand-core/content-bridge'
import { approvePreference, ASPECTS, deriveAspects, readProject, SURFACES, suggestPreference } from '@brand-os/brand-core/creative'
import { approvedWeek, contentBrand, plannedWeek } from './helpers/content.js'
import { TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'
import { NOW } from './helpers/strategy.js'

/**
 * Content feedback loop: owner feedback on a produced slot becomes a Knowledge note linked to the slot's creative
 * project (Creative Learning, unchanged approval path); owner-reported metrics are observations; a brief carries the
 * owner-approved preference statements and recent same-format learnings, never drafts or note text.
 */
useTestKey()

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const NOTE_CANARY = 'NOTE-TEXT-CANARY the caption is far too long and the hook is weak'
const DRAFT_CANARY = 'DRAFT-STATEMENT-CANARY use neon'
const ctx = agentTokenContext('pilito', 'agt_content', 'content-read')

async function served() {
  const s = await contentBrand('pilito')
  const week = plannedWeek(s, '2026-11-23')
  const w1 = approvedWeek(s, week)
  return { s, week, w1 }
}

function withToken<T>(fn: () => T): T {
  process.env.BRAND_OS_AGENT_TOKEN = 'bos_agent_fake'
  try {
    return fn()
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
}

test('copy aspects and surfaces are appended; the fa/en/tr lexicon suggests them; earlier aspects are unchanged', () => {
  assert.deepEqual(ASPECTS.slice(0, 14), ['camera_angle', 'lighting', 'text_density', 'tone', 'typography', 'layout', 'color', 'mascot_pose', 'mascot_anatomy', 'hook', 'cta', 'duration', 'pacing', 'music'])
  for (const aspect of ['length', 'humour', 'clarity', 'jargon', 'structure', 'hashtags', 'caption', 'script_delivery']) assert.ok((ASPECTS as readonly string[]).includes(aspect), aspect)
  assert.deepEqual(SURFACES.slice(0, 5), ['reel', 'post', 'carousel', 'story', 'logo'])
  for (const surface of ['caption', 'script', 'thread', 'article']) assert.ok((SURFACES as readonly string[]).includes(surface), surface)

  const side = (text: string) => Object.fromEntries(deriveAspects(text).map((item) => [item.aspect, item.side]))
  assert.deepEqual(side('The caption too long for reels.'), { length: 'avoid' })
  assert.deepEqual(side('Not funny enough.'), { humour: 'avoid' })
  assert.deepEqual(side('Script too formal.'), { script_delivery: 'avoid' })
  assert.deepEqual(side('Too much jargon.'), { jargon: 'avoid' })
  assert.deepEqual(side('Confusing message.'), { clarity: 'avoid' })
  assert.deepEqual(side('Great structure.'), { structure: 'keep' })
  assert.deepEqual(side('طنز خوب است.'), { humour: 'keep' })
  assert.deepEqual(side('هشتگ‌ها زیاد است.'), { hashtags: 'avoid' })
  assert.deepEqual(side('کپشن طولانی است.'), { length: 'avoid' })
  assert.deepEqual(side('Seslendirme güzel.'), { script_delivery: 'keep' })
  assert.deepEqual(side('Çok fazla teknik terim var.'), { jargon: 'avoid' })
  // Earlier wording keeps its earlier meaning.
  assert.deepEqual(side('نورپردازی خوب است ولی متن زیادی دارد.'), { lighting: 'keep', text_density: 'avoid' })
  assert.deepEqual(side('Way too long.'), { duration: 'avoid' })
  assert.equal(surfaceForFormat('email'), 'article')
  assert.equal(surfaceForFormat('reel'), 'reel')
  assert.equal(surfaceForFormat(null), null)
})

test('feedback: an owner_note in the Knowledge Inbox, linked to the slot project; refused for drafts and under an agent token', async () => {
  const { s, week } = await served()
  const reel = week.slots.find((slot) => slot.format === 'reel')!
  const result = recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: NOTE_CANARY, verdict: 'change_request', keep: ['tone'], avoid: ['length', 'hook'] })
  const projectId = slotProjectId(week.week_id, reel.id)
  assert.deepEqual(result.project, { project_id: projectId, surface: 'reel', series: 'instagram', created: true })
  assert.deepEqual(result.authorizes, [])
  const note = findNote(s.ws, result.note.id)
  assert.equal(note.note.meta.source.kind, 'owner_note')
  assert.equal(note.note.meta.source.ref, `content:${week.week_id}/${reel.id}`)
  assert.ok(note.note.meta.tags.includes('content-feedback'))
  assert.ok(note.note.meta.tags.includes(`slot-${week.week_id}-${reel.id}`))
  assert.equal(note.note.body.trim(), NOTE_CANARY)
  const project = readProject(s.ws, projectId)
  assert.deepEqual([project.surface, project.series, project.variants.map((v) => [v.variant_id, v.asset.state])], ['reel', 'instagram', [['A', 'missing']]])
  assert.deepEqual(project.feedback.map((f) => [f.note.id, f.verdict, f.keep, f.avoid, f.source_kind]), [[result.note.id, 'change_request', ['tone'], ['length', 'hook'], 'owner_note']])
  assert.ok(!fs.readFileSync(path.join(s.root, 'brand/.private/creative/projects', `${projectId}.json`), 'utf8').includes('NOTE-TEXT-CANARY'), 'the project stores ids, never the words')
  assert.equal(result.next.suggest, `npm run brand:creative -- suggest --project ${projectId} --statement '${NOTE_CANARY}' --source ${result.note.id}`)
  assert.match(result.next.approve, /approve --id <cp_… printed by suggest> --scope series/)

  // A second feedback on the same slot reuses the project.
  const again = recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: "Owner's second thought", verdict: 'like' })
  assert.equal(again.project.created, false)
  assert.match(again.next.suggest, /--statement 'Owner'\\''s second thought'/)
  assert.equal(readProject(s.ws, projectId).feedback.length, 2)

  // Unknown aspect, empty text, a draft week and an unknown slot are refused.
  assert.throws(() => recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: 'x', avoid: ['vibes'] }), /Aspect must be one of/)
  assert.throws(() => recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: '  ' }), /own words/)
  proposeWeek(s.ws, { week: plannedWeek(s, '2026-11-30') })
  assert.throws(() => recordSlotFeedback(s.ws, { week_id: 'wk-2026-11-30', slot_id: 's01', text: 'x' }), /no approved revision/)
  assert.throws(() => recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: 's99', text: 'x' }), /No slot s99/)
  assert.throws(() => withToken(() => recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: 'agent words' })), /BRAND_OS_AGENT_TOKEN/)
  assert.equal(readProject(s.ws, projectId).feedback.length, 2, 'nothing was recorded under the agent token')
})

test('metrics: validated, stored as owner_reported/not_verified observations, carried in calendar reports and brief learnings', async () => {
  const { s, week, w1 } = await served()
  const reels = week.slots.filter((slot) => slot.format === 'reel' && slot.channel === 'instagram')
  assert.ok(reels.length >= 2, 'two instagram reels in the planned week')
  const [first, second] = reels as [typeof reels[0], typeof reels[0]]

  for (const [metrics, pattern] of [
    [{}, /at least one metric/],
    [{ views: -1 }, /0 or more/],
    [{ likes: 1.5 }, /whole number/],
    [{ completion_rate: 140 }, /0 to 100/],
  ] as const) assert.throws(() => recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics }), pattern)
  assert.throws(() => recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics: { views: 1 }, measured_at: '2026-12-31' }), /future/)
  assert.throws(() => recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics: { views: 1 }, measured_at: '2026-02-30' }), /YYYY-MM-DD/)
  assert.throws(() => recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics: { views: 1 }, source: 'scraper' }), /manual, platform_export/)
  assert.throws(() => withToken(() => recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics: { views: 1 } })), /BRAND_OS_AGENT_TOKEN/)

  const m = recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: first.id, metrics: { views: 1200, likes: 80, completion_rate: 42.5 }, measured_at: '2026-11-22', source: 'platform_export' })
  assert.deepEqual([m.label, m.verification, m.reporter, m.week_revision, m.week_content_sha256], ['owner_reported', 'not_verified', 'owner', w1.revision, w1.sha])
  assert.deepEqual(m.metrics, { views: 1200, likes: 80, completion_rate: 42.5 })
  assert.deepEqual(readMetrics(s.ws, week.week_id).map((item) => item.metrics_id), [m.metrics_id])
  const file = path.join(s.root, 'brand/.private/content/observations', `${week.week_id}.json`)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)

  // An agent report on the same week keeps the metrics; the calendar carries both, latest per slot.
  const pin = { revision: w1.revision, content_sha256: w1.sha }
  assert.equal(runContentTool(s.root, 'pilito', ctx, 'content_report', { week_id: week.week_id, slot_id: first.id, pin, status: 'published', url: 'https://www.instagram.com/p/Abc123/' }, NOW).status, 'ok')
  assert.equal(readMetrics(s.ws, week.week_id).length, 1, 'metrics survive an agent report write')
  const cal = runContentTool(s.root, 'pilito', ctx, 'content_calendar', {}, NOW).data as AgentCalendarDocument
  const report = cal.weeks[0]!.reports.find((item) => item.slot_id === first.id)!
  assert.equal(report.status, 'published')
  assert.deepEqual(report.metrics, { metrics_id: m.metrics_id, measured_at: '2026-11-22', source: 'platform_export', label: 'owner_reported', verification: 'not_verified', values: { views: 1200, likes: 80, completion_rate: 42.5 } })

  // Metrics without a report read as `measured`.
  const later = recordSlotMetrics(s.ws, { week_id: week.week_id, slot_id: second.id, metrics: { views: 300 } })
  const cal2 = runContentTool(s.root, 'pilito', ctx, 'content_calendar', {}, NOW).data as AgentCalendarDocument
  const measured = cal2.weeks[0]!.reports.find((item) => item.slot_id === second.id)!
  assert.deepEqual([measured.status, measured.url, measured.observation_id, measured.metrics?.values], ['measured', null, later.metrics_id, { views: 300 }])

  // The second reel's brief learns from the first (same channel and format), with ids and numbers only.
  const brief = runContentTool(s.root, 'pilito', ctx, 'content_brief', { week_id: week.week_id, slot_id: second.id, pin }, NOW).data as ContentBriefDocument
  assert.deepEqual(brief.learnings, [{ week_id: week.week_id, slot_id: first.id, date: first.date, measured_at: '2026-11-22', source: 'platform_export', label: 'owner_reported', verification: 'not_verified', metrics: { views: 1200, likes: 80, completion_rate: 42.5 } }])
  assert.deepEqual(brief.report?.metrics?.values, { views: 300 })
  const carousel = week.slots.find((slot) => slot.format === 'carousel')
  if (carousel) assert.deepEqual((runContentTool(s.root, 'pilito', ctx, 'content_brief', { week_id: week.week_id, slot_id: carousel.id, pin }, NOW).data as ContentBriefDocument).learnings, [], 'another format learns nothing')
})

test('brief: approved preference statements and scope for the slot, never drafts or the feedback note text', async () => {
  const { s, week, w1 } = await served()
  const reel = week.slots.find((slot) => slot.format === 'reel')!
  const otherReel = week.slots.find((slot) => slot.format === 'reel' && slot.id !== reel.id)!
  const fb = recordSlotFeedback(s.ws, { week_id: week.week_id, slot_id: reel.id, text: NOTE_CANARY, avoid: ['length'] })
  const projectId = fb.project.project_id
  const series = suggestPreference(s.ws, { project_id: projectId, statement: 'Keep reel captions under 120 characters', sources: [fb.note.id] })
  approvePreference(s.ws, { preference_id: series.preference_id, proof: s.proof, scope: 'series' })
  const projectOnly = suggestPreference(s.ws, { project_id: projectId, statement: 'Open this reel with the learner, not the app', sources: [fb.note.id] })
  approvePreference(s.ws, { preference_id: projectOnly.preference_id, proof: s.proof })
  const draft = suggestPreference(s.ws, { project_id: projectId, statement: DRAFT_CANARY, sources: [fb.note.id] })

  const pin = { revision: w1.revision, content_sha256: w1.sha }
  const got = runContentTool(s.root, 'pilito', ctx, 'content_brief', { week_id: week.week_id, slot_id: reel.id, pin }, NOW)
  const brief = got.data as ContentBriefDocument
  assert.equal(brief.creative.surface, 'reel')
  assert.deepEqual(
    brief.creative.preferences.map((p) => [p.preference_id, p.scope, p.series, p.statement]).sort(),
    [
      [series.preference_id, 'series', 'instagram', 'Keep reel captions under 120 characters'],
      [projectOnly.preference_id, 'project', projectId, 'Open this reel with the learner, not the app'],
    ].sort(),
  )
  const json = JSON.stringify(got)
  for (const canary of ['NOTE-TEXT-CANARY', DRAFT_CANARY, draft.preference_id]) assert.ok(!json.includes(canary), canary)

  // Another reel gets the series rule, not the other slot's project rule.
  const other = runContentTool(s.root, 'pilito', ctx, 'content_brief', { week_id: week.week_id, slot_id: otherReel.id, pin }, NOW).data as ContentBriefDocument
  assert.deepEqual(other.creative.preferences.map((p) => p.preference_id), [series.preference_id])
})

test('CLI: brand:content feedback and metrics (json and text), reports lists metrics; refused under an agent token', async () => {
  const { s, week } = await served()
  const reel = week.slots.find((slot) => slot.format === 'reel')!
  const cli = (args: string[], extra: Record<string, string> = {}) => {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && !['BRAND_OS_AGENT_TOKEN', 'BRAND_OS_APPROVAL_PROOF'].includes(key)) env[key] = value
    env.BRAND_OS_DATA_KEY = TEST_DATA_KEY
    env.BRAND_OS_KNOWLEDGE_GH = 'off'
    return spawnSync(tsx, [path.join(repo, 'scripts/content.ts'), ...args], { cwd: s.root, encoding: 'utf8', env: { ...env, ...extra }, input: '' })
  }
  const fb = cli(['feedback', '--week', week.week_id, '--slot', reel.id, '--text', 'Hook is weak; more humour', '--verdict', 'change_request', '--avoid', 'hook', '--json'])
  assert.equal(fb.status, 0, fb.stderr)
  const json = JSON.parse(fb.stdout) as { ok: boolean; note: { id: string }; next: { suggest: string } }
  assert.equal(json.ok, true)
  assert.match(json.next.suggest, new RegExp(`^npm run brand:creative -- suggest --project content-${week.week_id}-${reel.id} --statement 'Hook is weak; more humour' --source ${json.note.id}$`))
  const text = cli(['feedback', '--week', week.week_id, '--slot', reel.id, '--text', 'Better now', '--verdict', 'like'])
  assert.equal(text.status, 0, text.stderr)
  assert.match(text.stdout, /npm run brand:creative -- suggest --project/)

  const metrics = cli(['metrics', '--week', week.week_id, '--slot', reel.id, '--views', '900', '--completion-rate', '35%', '--measured-at', new Date().toISOString().slice(0, 10), '--json'])
  assert.equal(metrics.status, 0, metrics.stderr)
  assert.deepEqual((JSON.parse(metrics.stdout) as { metrics: { metrics: unknown } }).metrics.metrics, { views: 900, completion_rate: 35 })
  const bad = cli(['metrics', '--week', week.week_id, '--slot', reel.id, '--views', 'lots'])
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /--views takes a number/)
  const reports = cli(['reports'])
  assert.match(reports.stdout, /Owner-reported metrics/)
  assert.match(reports.stdout, /views=900 completion_rate=35%/)
  assert.match(cli(['reports', '--lang', 'fa']).stdout, /معیارهایی که مالک گزارش کرده/)

  for (const args of [
    ['feedback', '--week', week.week_id, '--slot', reel.id, '--text', 'agent words'],
    ['metrics', '--week', week.week_id, '--slot', reel.id, '--views', '1'],
  ]) {
    const refused = cli(args, { BRAND_OS_AGENT_TOKEN: 'bos_agent_fake' })
    assert.equal(refused.status, 1, args[0])
    assert.match(refused.stderr, /BRAND_OS_AGENT_TOKEN/)
  }
})
