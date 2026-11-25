import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { agentTokenContext, applyInit, approveTokens, ensureApprovalSecret, generateTokens, InterviewEngine, openWorkspace, writeStarterWorkspace } from '@brand-os/brand-core'
import { fontAliasSources, localizedFontRef } from '../packages/brand-core/src/font-roles.js'
import { approveKit, evaluateKit, initKit, previewFiles, readKit, repoTokenLookup, reviewKit, runSocialKitTool, styleSvg, type SocialKit } from '@brand-os/brand-core/social-kit'
import { compileTokens } from '@brand-os/design-tokens'

/**
 * The social style kit shows the brand's real fonts, for every brand and locale: `brand:tokens:generate` emits the
 * stable ids type.fontFamily.display / body (mono only when the fact has one) from the default-locale roles, the kit
 * resolves fonts per language (display-fa in a Persian sheet), the owner preview labels drafts and template EXAMPLEs,
 * and the agent view names a family only once its token is approved.
 */

process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')

const SCALE = 'display-fa: Shams, Tahoma, sans-serif; body-fa: Yekan, Tahoma, sans-serif @ 16px/1.8; display-en: Rajdhani, Arial, sans-serif; body-en: Inter, system-ui, sans-serif @ 16px/1.5'

function withoutAgentToken<T>(run: () => T): T {
  const saved = process.env.BRAND_OS_AGENT_TOKEN
  delete process.env.BRAND_OS_AGENT_TOKEN
  try {
    return run()
  } finally {
    if (saved !== undefined) process.env.BRAND_OS_AGENT_TOKEN = saved
  }
}

function brand(slug: string, language: 'fa' | 'en' | 'tr', scale: string | null = SCALE) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-kit-fonts-'))
  writeStarterWorkspace(root)
  fs.rmSync(path.join(root, 'brand/tokens/generated'), { recursive: true, force: true })
  fs.rmSync(path.join(root, 'brand/tokens/approvals.yaml'), { force: true })
  applyInit(root, { name: 'Font Brand', slug, industry: 'education', language, languages: ['fa', 'en'], mascot: false, gamification: false, publish: 'public' })
  const engine = new InterviewEngine(root)
  const proof = ensureApprovalSecret(root)
  if (scale) {
    assert.equal(engine.answerQuestion('brand.type.scale', scale).kind, 'recorded')
    assert.equal(engine.approvals().approveBatch({ ids: ['brand.type.scale'] }, proof).approved, 1)
  }
  return { root, engine, proof, ws: openWorkspace(root) }
}

const family = (root: string, id: string) => {
  const value = compileTokens(root).flat[id]?.value
  return Array.isArray(value) ? value[0] : value
}

test('font aliases follow the default locale, a plain synonym, or the first listed role; mono only when named', () => {
  const roles = ['display-fa', 'body-fa', 'display-en', 'body-en']
  assert.deepEqual(fontAliasSources(roles, 'fa').map((s) => [s.alias, s.role, s.reason]), [['display', 'display-fa', 'default_locale'], ['body', 'body-fa', 'default_locale']])
  assert.deepEqual(fontAliasSources(roles, 'en-US').map((s) => s.role), ['display-en', 'body-en'])
  assert.deepEqual(fontAliasSources(roles, 'tr').map((s) => [s.role, s.reason]), [['display-fa', 'first_listed'], ['body-fa', 'first_listed']])
  assert.deepEqual(fontAliasSources(['heading', 'text', 'code'], 'en').map((s) => [s.alias, s.role]), [['display', 'heading'], ['body', 'text'], ['mono', 'code']])
  assert.deepEqual(fontAliasSources(['display', 'body'], 'fa'), [], 'a role already named display needs no alias')
  const has = (id: string) => ['type.fontFamily.display-fa', 'type.fontFamily.heading_tr'].includes(id)
  assert.equal(localizedFontRef('type.fontFamily.display', 'fa', has), 'type.fontFamily.display-fa')
  assert.equal(localizedFontRef('type.fontFamily.display', 'tr', has), 'type.fontFamily.heading_tr')
  assert.equal(localizedFontRef('type.fontFamily.display', 'en', has), 'type.fontFamily.display')
  assert.equal(localizedFontRef('type.fontFamily.display-fa', 'en', has), 'type.fontFamily.display-fa', 'an explicit locale is kept')
  assert.equal(localizedFontRef('color.brand.primary', 'fa', has), 'color.brand.primary')
})

test('tokens:generate emits stable display/body aliases from the default locale, keeps per-locale tokens, and is idempotent', () => {
  const fa = brand('fonts-fa', 'fa')
  const first = generateTokens(fa.root, 'fonts-fa')
  assert.equal(first.ok, true, first.note)
  const outcome = Object.fromEntries(first.tokens.map((t) => [t.id, t.outcome]))
  for (const id of ['type.fontFamily.display-fa', 'type.fontFamily.body-fa', 'type.fontFamily.display-en', 'type.fontFamily.body-en', 'type.fontFamily.display', 'type.fontFamily.body']) assert.equal(outcome[id], 'created', id)
  assert.equal(outcome['type.fontFamily.mono'], undefined, 'no mono alias without a mono role')
  assert.equal(family(fa.root, 'type.fontFamily.display'), 'Shams')
  assert.equal(family(fa.root, 'type.fontFamily.body'), 'Yekan')
  assert.equal(family(fa.root, 'type.fontFamily.mono'), 'EXAMPLE Mono', 'the base mono stays a template example')
  const generated = JSON.parse(fs.readFileSync(path.join(fa.root, 'brand/tokens/generated/typography.tokens.json'), 'utf8')) as { type: { fontFamily: { display: { $extensions: { 'brand.os': { status: string; alias_of: string } } } } } }
  assert.deepEqual(generated.type.fontFamily.display.$extensions['brand.os'].status, 'draft')
  assert.equal(generated.type.fontFamily.display.$extensions['brand.os'].alias_of, 'type.fontFamily.display-fa')

  const file = path.join(fa.root, 'brand/tokens/generated/typography.tokens.json')
  const before = fs.readFileSync(file, 'utf8')
  const again = generateTokens(fa.root, 'fonts-fa')
  assert.ok(again.tokens.every((t) => t.outcome === 'unchanged'), JSON.stringify(again.tokens))
  assert.deepEqual(again.files, [], 'nothing rewritten')
  assert.equal(fs.readFileSync(file, 'utf8'), before)

  // Approving the per-locale token does not approve the alias: each id carries its own hash.
  assert.equal(approveTokens(fa.root, ['type.fontFamily.display-fa'], fa.proof).ok, true)
  const approvals = fs.readFileSync(path.join(fa.root, 'brand/tokens/approvals.yaml'), 'utf8')
  assert.match(approvals, /type\.fontFamily\.display-fa/)
  assert.doesNotMatch(approvals, /type\.fontFamily\.display:/)
  // An approved alias is never overwritten when the default locale changes.
  assert.equal(approveTokens(fa.root, ['type.fontFamily.display'], fa.proof).ok, true)
  const config = path.join(fa.root, 'brand/brand.config.yaml')
  fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace(/default_locale: fa/, 'default_locale: en'))
  const switched = generateTokens(fa.root, 'fonts-fa')
  assert.equal(switched.tokens.find((t) => t.id === 'type.fontFamily.display')?.outcome, 'refused_approved')
  assert.equal(switched.tokens.find((t) => t.id === 'type.fontFamily.body')?.outcome, 'updated')
  assert.equal(family(fa.root, 'type.fontFamily.display'), 'Shams')
  assert.equal(family(fa.root, 'type.fontFamily.body'), 'Inter')

  const en = brand('fonts-en', 'en')
  generateTokens(en.root, 'fonts-en')
  assert.equal(family(en.root, 'type.fontFamily.display'), 'Rajdhani')
  assert.equal(family(en.root, 'type.fontFamily.body'), 'Inter')
})

test('the kit preview shows the brand family per language, labelled draft or EXAMPLE until the token is approved', () => {
  const s = brand('fonts-kit', 'fa')
  generateTokens(s.root, 'fonts-kit')
  withoutAgentToken(() => initKit(s.ws, { surfaces: ['post'] }))
  const kit = (readKit(s.root, 'fonts-kit') as { kit: SocialKit }).kit
  const states = evaluateKit(s.root, kit)
  const faFiles = previewFiles(kit, states, repoTokenLookup(s.root), { lang: 'fa' })
  const faSvg = faFiles.find((f) => f.path === 'post/post.bold-statement.svg')!.contents
  assert.match(faSvg, /Aa Shams \(توکن پیش‌نویس/, 'Persian sheet: display-fa, labelled draft')
  assert.doesNotMatch(faSvg, /EXAMPLE/)
  const faSheet = faFiles.find((f) => f.path === 'post/index.html')!.contents
  assert.match(faSheet, /type\.fontFamily\.display → Shams/)
  assert.match(faSheet, /type\.fontFamily\.body → Yekan/)
  const enSvg = styleSvg(kit.styles[0]!, repoTokenLookup(s.root), { lang: 'en' })
  assert.match(enSvg, /Aa Rajdhani \(draft token, not approved yet\)/)
  assert.doesNotMatch(enSvg, /EXAMPLE Display|EXAMPLE Sans/)

  assert.equal(approveTokens(s.root, ['type.fontFamily.display-fa', 'type.fontFamily.body-fa'], s.proof).ok, true)
  const approvedSvg = styleSvg(kit.styles[0]!, repoTokenLookup(s.root), { lang: 'fa' })
  assert.match(approvedSvg, /Aa Shams( ·|<)/, 'an approved family carries no label')

  // A brand without an approved type scale still says EXAMPLE, never silently.
  const bare = brand('fonts-bare', 'en', null)
  withoutAgentToken(() => initKit(bare.ws, { surfaces: ['post'] }))
  const bareKit = (readKit(bare.root, 'fonts-bare') as { kit: SocialKit }).kit
  assert.match(styleSvg(bareKit.styles[0]!, repoTokenLookup(bare.root), { lang: 'en' }), /Aa EXAMPLE Display \(template EXAMPLE, not the brand font\)/)
})

test('social_style_kit resolves fonts per language and names a family only when its token is approved', () => {
  const s = brand('fonts-agent', 'fa')
  generateTokens(s.root, 'fonts-agent')
  withoutAgentToken(() => {
    initKit(s.ws, { surfaces: ['post'] })
    const review = reviewKit(s.ws, { style_id: 'post.bold-statement' })
    approveKit(s.ws, { style_id: 'post.bold-statement', expected_sha256: review.expect_sha!, proof: s.proof })
  })
  const ctx = agentTokenContext('fonts-agent', 'agt_design', 'design')
  const headline = (lang: 'fa' | 'en') => {
    const view = runSocialKitTool(s.engine, ctx, { surface: 'post', lang }).data!
    const layer = view.surfaces[0]!.styles[0]!.layers.find((l) => l.role === 'headline')!
    return { layer, view }
  }
  let { layer, view } = headline('fa')
  assert.equal(layer.font, 'type.fontFamily.display')
  assert.deepEqual(layer.font_resolved, { ref: 'type.fontFamily.display', token: 'type.fontFamily.display-fa', family: null, state: 'draft' })
  assert.ok(view.fonts.every((font) => font.family === null), 'no draft family is named to an agent')
  assert.ok(!JSON.stringify(view).includes('Shams'))

  assert.equal(approveTokens(s.root, ['type.fontFamily.display-fa', 'type.fontFamily.display-en'], s.proof).ok, true)
  ;({ layer, view } = headline('fa'))
  assert.deepEqual(layer.font_resolved, { ref: 'type.fontFamily.display', token: 'type.fontFamily.display-fa', family: 'Shams', state: 'approved' })
  assert.ok(view.fonts.some((font) => font.token === 'type.fontFamily.body-fa' && font.family === null && font.state === 'draft'))
  assert.equal(headline('en').layer.font_resolved?.family, 'Rajdhani')

  // On the template's EXAMPLE tokens the state says so and no family is given.
  const bare = brand('fonts-agent-bare', 'en', null)
  withoutAgentToken(() => {
    initKit(bare.ws, { surfaces: ['post'] })
    const review = reviewKit(bare.ws, { style_id: 'post.bold-statement' })
    approveKit(bare.ws, { style_id: 'post.bold-statement', expected_sha256: review.expect_sha!, proof: bare.proof })
  })
  const bareView = runSocialKitTool(bare.engine, agentTokenContext('fonts-agent-bare', 'agt_design', 'design'), { surface: 'post' }).data!
  const bareLayer = bareView.surfaces[0]!.styles[0]!.layers.find((l) => l.role === 'headline')!
  assert.deepEqual(bareLayer.font_resolved, { ref: 'type.fontFamily.display', token: 'type.fontFamily.display', family: null, state: 'example' })
  assert.ok(!JSON.stringify(bareView).includes('EXAMPLE Display'))
})
