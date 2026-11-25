import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import Ajv from 'ajv'
import YAML from 'yaml'
import {
  AGENT_PROFILES,
  agentContext,
  agentTokenContext,
  ensureApprovalSecret,
  guestContext,
  InterviewEngine,
  openWorkspace,
  operatorContext,
  readAccessLog,
  validateRepo,
  type AgentProfile,
} from '@brand-os/brand-core'
import {
  approveKit,
  buildStarterKit,
  evaluateKit,
  initKit,
  parseKit,
  previewFiles,
  readKit,
  rejectKit,
  reviewKit,
  rotateStyles,
  runSocialKitTool,
  SOCIAL_KIT_FILE,
  SOCIAL_KIT_PROFILES,
  SOCIAL_KIT_TEXT,
  SocialKitError,
  STARTER_ARCHETYPES,
  stylesForFormat,
  styleSvg,
  SURFACE_SPECS,
  SURFACES,
  surfacesForFormat,
  tokenLookup,
  RULE_CODES,
  zoneRect,
  type SocialKit,
} from '@brand-os/brand-core/social-kit'
import { buildTaskContext } from '../packages/brand-core/src/task-context/resolve.js'
import { compileTokens } from '@brand-os/design-tokens'
import { brandDir } from './helpers/knowledge.js'

/**
 * Social style kit: starter siblings, schema and parser, owner approval with the proof (refused under an agent
 * token), hand-edit → invalid_approval, the agent read path (approved only, drafts counted), task_context, rotation,
 * deterministic SVG previews with safe zones, and complete en/fa/tr text.
 */
const repo = path.resolve(import.meta.dirname, '..')
const DRAFT_CANARY = 'DRAFT-STYLE-CANARY never served'

function brand(slug: string) {
  const root = brandDir({ slug })
  const proof = ensureApprovalSecret(root)
  return { root, proof, ws: openWorkspace(root), engine: new InterviewEngine(root) }
}

function withoutAgentToken<T>(run: () => T): T {
  const saved = process.env.BRAND_OS_AGENT_TOKEN
  delete process.env.BRAND_OS_AGENT_TOKEN
  try {
    return run()
  } finally {
    if (saved !== undefined) process.env.BRAND_OS_AGENT_TOKEN = saved
  }
}

const reader = (slug: string, profile: AgentProfile = 'design') => agentTokenContext(slug, `agt_${profile}`, profile)

test('the starter kit has four sibling styles per surface: one family, distinct layer layouts, all drafts', () => {
  const kit = buildStarterKit({ brandSlug: 'demo' })
  assert.equal(kit.styles.length, SURFACES.length * 4)
  for (const surface of SURFACES) {
    const styles = kit.styles.filter((style) => style.surface === surface)
    assert.equal(styles.length, 4, surface)
    assert.ok(STARTER_ARCHETYPES[surface].length >= 4, 'at least four archetypes; a spare one replaces a mascot style for brands without a mascot')
    const signatures = styles.map((style) => style.layers.map((layer) => `${layer.role}@${JSON.stringify(zoneRect(layer.zone))}`).join('|'))
    assert.equal(new Set(signatures).size, 4, `${surface}: four distinct layouts`)
    const roleSets = styles.map((style) => style.layers.map((layer) => layer.role).join(','))
    assert.ok(new Set(roleSets).size >= 3, `${surface}: the layer structures differ, not only the coordinates`)
    for (const style of styles) {
      assert.equal(style.status, 'draft')
      assert.ok(style.id.startsWith(`${surface}.`))
      assert.ok(['background', 'media'].includes(style.layers[0]!.role), `${style.id} starts at the back`)
      for (const lang of ['en', 'fa', 'tr'] as const) {
        assert.ok(style.name[lang] && style.intent.use_when[lang] && style.variation[lang], `${style.id} ${lang}`)
      }
    }
  }
  // Same family everywhere: every colour and font is a token id from the family palette or type.
  const palette = new Set(Object.values(kit.family.palette))
  const fonts = new Set([kit.family.type.headline, kit.family.type.body])
  for (const style of kit.styles) {
    for (const layer of style.layers) {
      if (layer.color) assert.ok(palette.has(layer.color), `${style.id} ${layer.role} colour ${layer.color} is a family palette role`)
      if (layer.font) assert.ok(fonts.has(layer.font), `${style.id} ${layer.role} font`)
    }
  }
  assert.ok(SURFACE_SPECS.reel.caption_style && kit.styles.filter((style) => style.surface === 'reel').every((style) => style.caption_style))
  // Every starter token id exists in the template token files.
  const flat = compileTokens(repo).flat
  for (const ref of [...palette, ...fonts, kit.family.corner_radius]) assert.ok(flat[ref], `${ref} is a template token`)
  // Personal brands also cite the photo guideline fact.
  assert.ok(buildStarterKit({ brandSlug: 'demo', personal: true }).family.photo_direction.fact_refs.includes('personal.media.photo_guidelines'))
})

test('schema and parser accept the starter kit and refuse raw colours, bad ids and wrong brands', () => {
  const kit = buildStarterKit({ brandSlug: 'demo' })
  const plain = YAML.parse(YAML.stringify(kit)) as Record<string, unknown>
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(JSON.parse(fs.readFileSync(path.join(repo, 'schemas', 'social-style-kit.schema.json'), 'utf8')) as object)
  assert.equal(validate(plain), true, ajv.errorsText(validate.errors))
  assert.deepEqual(parseKit(plain, 'demo'), parseKit(YAML.parse(YAML.stringify(kit)), 'demo'))
  const mutate = (change: (doc: { styles: Array<Record<string, unknown> & { layers: Array<Record<string, unknown>> }>; family: Record<string, unknown> }) => void) => {
    const doc = structuredClone(plain) as Parameters<typeof change>[0]
    change(doc)
    return doc
  }
  const bad = [
    mutate((doc) => (doc.styles[0]!.layers[0]!.color = '#FF0000')),
    mutate((doc) => (doc.styles[0]!.id = 'story.bold-statement')),
    mutate((doc) => (doc.styles[0]!.layers[1]!.zone = { x: 90, y: 0, w: 20, h: 10 })),
    mutate((doc) => (doc.styles[0]!.name = { en: 'Use #FF0000 here' })),
    mutate((doc) => (doc.styles[0]!.status = 'approved')),
    mutate((doc) => (doc.styles[0]!.reference_assets = ['../secret.png'])),
    mutate((doc) => doc.styles.push(structuredClone(doc.styles[0]!))),
    mutate((doc) => ((doc.family.palette as Record<string, string>).primary = 'red')),
  ]
  for (const doc of bad) assert.throws(() => parseKit(doc, 'demo'), SocialKitError)
  assert.throws(() => parseKit(plain, 'other-brand'), /belongs to demo/)
})

test('init writes drafts, refuses to overwrite, and --force never touches approved or rejected styles', () => {
  const s = brand('kit-init')
  const first = withoutAgentToken(() => initKit(s.ws, { surfaces: ['post', 'story'], styles: 3 }))
  assert.equal(first.written.length, 6)
  const read = readKit(s.root, 'kit-init')
  assert.equal(read.state, 'ok')
  assert.match(fs.readFileSync(path.join(s.root, SOCIAL_KIT_FILE), 'utf8'), /^# Social style kit/)
  assert.throws(() => initKit(s.ws, {}), (error: unknown) => error instanceof SocialKitError && error.code === 'exists')
  assert.throws(() => initKit(s.ws, { styles: 5, force: true }), /--styles is 1 to 4/)
  const review = reviewKit(s.ws, { style_id: 'post.bold-statement' })
  approveKit(s.ws, { style_id: 'post.bold-statement', expected_sha256: review.expect_sha!, proof: s.proof })
  rejectKit(s.ws, { style_id: 'story.quick-tip' })
  const before = fs.readFileSync(path.join(s.root, SOCIAL_KIT_FILE), 'utf8')
  const approvedBlock = (YAML.parse(before) as SocialKit).styles.find((style) => style.id === 'post.bold-statement')
  const again = initKit(s.ws, { force: true })
  assert.ok(again.kept.includes('post.bold-statement') && again.kept.includes('story.quick-tip'))
  assert.equal(again.family_kept, true)
  const after = YAML.parse(fs.readFileSync(path.join(s.root, SOCIAL_KIT_FILE), 'utf8')) as SocialKit
  assert.deepEqual(after.styles.find((style) => style.id === 'post.bold-statement'), approvedBlock)
  assert.equal(after.styles.find((style) => style.id === 'story.quick-tip')?.status, 'rejected')
  assert.equal(after.styles.filter((style) => style.surface === 'post').length, 4)
  const states = evaluateKit(s.root, parseKit(after, 'kit-init'))
  assert.equal(states.find((state) => state.style.id === 'post.bold-statement')?.status, 'approved', 'still verifies after --force')
})

test('approval needs the owner proof and the reviewed digest, and is refused under an agent token', () => {
  const s = brand('kit-approve')
  initKit(s.ws, { surfaces: ['post'] })
  const review = reviewKit(s.ws, { surface: 'post' })
  assert.equal(review.approvable.length, 4)
  assert.match(review.approve_with ?? '', /kit approve --surface post --expect-sha [0-9a-f]{64}$/)
  const code = (run: () => unknown) => {
    try {
      run()
      return 'ok'
    } catch (error) {
      return error instanceof SocialKitError ? error.code : String(error)
    }
  }
  assert.equal(code(() => approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: undefined })), 'proof')
  assert.equal(code(() => approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: 'wrong' })), 'proof')
  assert.equal(code(() => approveKit(s.ws, { surface: 'post', expected_sha256: undefined, proof: s.proof })), 'invalid_input')
  assert.equal(code(() => approveKit(s.ws, { surface: 'post', expected_sha256: 'a'.repeat(64), proof: s.proof })), 'stale')
  process.env.BRAND_OS_AGENT_TOKEN = 'agt_x.fake'
  try {
    assert.equal(code(() => approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: s.proof })), 'refused')
    assert.equal(code(() => initKit(s.ws, { force: true })), 'refused')
    assert.equal(code(() => rejectKit(s.ws, { surface: 'post' })), 'refused')
  } finally {
    delete process.env.BRAND_OS_AGENT_TOKEN
  }
  assert.ok(evaluateKit(s.root, (readKit(s.root) as { kit: SocialKit }).kit).every((state) => state.status === 'draft'), 'nothing was approved')
  const result = approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: s.proof })
  assert.equal(result.approved.length, 4)
  const text = fs.readFileSync(path.join(s.root, SOCIAL_KIT_FILE), 'utf8')
  assert.match(text, /^# Social style kit/, 'the owner’s comments survive approval')
  const sealed = JSON.parse(fs.readFileSync(path.join(s.root, 'brand/.private/social/approvals.json'), 'utf8')) as { approvals: Record<string, { seal: string }> }
  assert.equal(Object.keys(sealed.approvals).length, 4)
  assert.equal(fs.statSync(path.join(s.root, 'brand/.private/social/approvals.json')).mode & 0o777, 0o600)
  assert.ok(!text.includes(Object.values(sealed.approvals)[0]!.seal), 'the seal is private, never in the committed kit')
})

test('a hand edit after approval, a forged status or a missing seal is invalid_approval and is not served', () => {
  const s = brand('kit-tamper')
  initKit(s.ws, { surfaces: ['post'] })
  const review = reviewKit(s.ws, { surface: 'post' })
  approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: s.proof })
  const file = path.join(s.root, SOCIAL_KIT_FILE)
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
  // 1. hand edit of an approved style's text limit
  doc.setIn(['styles', 0, 'layers', 2, 'max_words'], 40)
  fs.writeFileSync(file, doc.toString())
  let states = evaluateKit(s.root, (readKit(s.root) as { kit: SocialKit }).kit)
  assert.deepEqual(states.map((state) => [state.style.id, state.status, state.invalid_reason]).slice(0, 2), [
    ['post.bold-statement', 'invalid_approval', 'edited_after_approval'],
    ['post.photo-headline', 'approved', null],
  ])
  const view = runSocialKitTool(s.engine, reader('kit-tamper'), { surface: 'post' })
  assert.equal(view.data?.withheld.invalid_approval, 1)
  assert.ok(!JSON.stringify(view).includes('post.bold-statement'))
  // validate reports the edit as a warning, not an error
  const report = validateRepo(s.root)
  assert.ok(report.warnings.some((line) => line.includes('post.bold-statement changed after approval')), report.warnings.join('\n'))
  // 2. the owner re-reviews and re-approves it
  const again = reviewKit(s.ws, { style_id: 'post.bold-statement' })
  assert.deepEqual(again.approvable, ['post.bold-statement'])
  approveKit(s.ws, { style_id: 'post.bold-statement', expected_sha256: again.expect_sha!, proof: s.proof })
  // 3. a family edit invalidates every approval (the family is part of each digest)
  const doc2 = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
  doc2.setIn(['family', 'corner_radius'], 'radius.sm')
  fs.writeFileSync(file, doc2.toString())
  states = evaluateKit(s.root, (readKit(s.root) as { kit: SocialKit }).kit)
  assert.ok(states.every((state) => state.status === 'invalid_approval'))
  // 4. a forged approved status copied from another style, or with the seal file removed
  doc2.setIn(['family', 'corner_radius'], 'radius.lg')
  fs.writeFileSync(file, doc2.toString())
  fs.rmSync(path.join(s.root, 'brand/.private/social/approvals.json'))
  states = evaluateKit(s.root, (readKit(s.root) as { kit: SocialKit }).kit)
  assert.ok(states.every((state) => state.status === 'invalid_approval' && state.invalid_reason === 'no_seal'))
})

test('social_style_kit serves only approved styles to the five design-side profiles; drafts are counted, never shown', () => {
  const s = brand('kit-agent')
  const empty = runSocialKitTool(s.engine, reader('kit-agent'), {})
  assert.equal(empty.status, 'ok')
  assert.equal(empty.data?.kit_state, 'missing')
  assert.equal(empty.data?.missing.length, SURFACES.length)
  initKit(s.ws, { surfaces: ['post', 'reel'] })
  const file = path.join(s.root, SOCIAL_KIT_FILE)
  const doc = YAML.parseDocument(fs.readFileSync(file, 'utf8'))
  doc.setIn(['styles', 5, 'variation', 'en'], DRAFT_CANARY)
  fs.writeFileSync(file, doc.toString())
  const review = reviewKit(s.ws, { surface: 'post' })
  approveKit(s.ws, { surface: 'post', expected_sha256: review.expect_sha!, proof: s.proof })

  const denied = [
    guestContext('kit-agent'),
    agentContext('kit-agent'),
    operatorContext('kit-agent'),
    ...(Object.keys(AGENT_PROFILES) as AgentProfile[]).filter((profile) => !SOCIAL_KIT_PROFILES.includes(profile)).map((profile) => reader('kit-agent', profile)),
    reader('other-brand'),
  ]
  for (const ctx of denied) {
    const result = runSocialKitTool(s.engine, ctx, {})
    assert.equal(result.status, 'denied', `${ctx.role}/${ctx.profile ?? '-'}`)
    assert.equal(result.data, null)
  }
  for (const profile of SOCIAL_KIT_PROFILES) {
    const result = runSocialKitTool(s.engine, reader('kit-agent', profile), { lang: 'fa' })
    assert.equal(result.status, 'ok', profile)
    const data = result.data!
    assert.deepEqual(data.authorizes, [])
    assert.equal(data.direction, 'rtl')
    assert.deepEqual(data.surfaces.map((surface) => surface.surface), ['post'])
    assert.equal(data.surfaces[0]!.styles.length, 4)
    assert.equal(data.surfaces[0]!.styles[0]!.name, 'جملهٔ پررنگ')
    assert.deepEqual(data.withheld, { draft: 4, rejected: 0, invalid_approval: 0 })
    assert.ok(data.missing.some((gap) => gap.surface === 'reel' && gap.reason === 'no_approved_style'))
    assert.ok(data.family, 'the family travels with an approved style')
    assert.ok(!JSON.stringify(result).includes(DRAFT_CANARY), 'draft text never reaches an agent')
    assert.ok(!JSON.stringify(result).includes('reel.'), 'draft ids are not named')
  }
  assert.equal(runSocialKitTool(s.engine, reader('kit-agent'), { surface: 'nope' }).status, 'invalid')
  const log = readAccessLog(s.root).filter((entry) => entry.tool === 'social_style_kit')
  assert.ok(log.some((entry) => entry.decision === 'deny') && log.some((entry) => entry.decision === 'allow' && entry.returned_ids.includes('post.bold-statement')))
  // task_context carries approved styles as pointers for the three design tasks
  const pack = buildTaskContext(s.engine, reader('kit-agent', 'content-read'), { task_type: 'social_batch', channel: 'instagram' })
  const items = pack.data!.sections.creative.filter((item) => item.key === 'social_styles')
  assert.equal(items.length, 4)
  assert.ok(items.every((item) => item.state === 'approved' && String(item.source_id).startsWith('social-style:post.') && /^[0-9a-f]{64}$/.test(String(item.source_revision))))
  const linkedin = buildTaskContext(s.engine, reader('kit-agent', 'content-read'), { task_type: 'social_batch', channel: 'linkedin' })
  assert.ok(linkedin.data!.missing.some((gap) => gap.id === 'social_styles' && gap.reason === 'not_approved'))
  const knowledge = buildTaskContext(s.engine, reader('kit-agent', 'knowledge-read'), { task_type: 'visual_design' })
  assert.ok(knowledge.data!.missing.some((gap) => gap.id === 'social_styles' && gap.reason === 'not_authorized'))
  assert.ok(!JSON.stringify(pack).includes(DRAFT_CANARY))
})

test('rotation maps formats to surfaces and cycles approved styles only', () => {
  assert.deepEqual(surfacesForFormat('reel'), ['reel', 'reel_cover'])
  assert.deepEqual(surfacesForFormat('video'), ['thumbnail'])
  assert.deepEqual(surfacesForFormat('post', 'linkedin'), ['linkedin_post'])
  assert.deepEqual(surfacesForFormat('carousel', 'linkedin'), ['linkedin_document'])
  assert.deepEqual(surfacesForFormat('article'), [])
  assert.equal(rotateStyles([], 3), null)
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => rotateStyles(['a', 'b', 'c'], index)), ['a', 'b', 'c', 'a', 'b'])
  const s = brand('kit-rotate')
  assert.equal(stylesForFormat(s.root, 'post').state, 'missing')
  initKit(s.ws, { surfaces: ['reel', 'reel_cover'] })
  const review = reviewKit(s.ws, { surface: 'reel' })
  approveKit(s.ws, { surface: 'reel', expected_sha256: review.expect_sha!, proof: s.proof })
  const reel = stylesForFormat(s.root, 'reel', 'instagram', 'kit-rotate')
  assert.equal(reel.state, 'ok')
  assert.equal(reel.styles.reel?.length, 4)
  assert.deepEqual(reel.styles.reel_cover, [], 'drafts are never listed')
})

test('previews are deterministic SVG wireframes with dashed safe zones and a contact sheet per surface', () => {
  const kit = buildStarterKit({ brandSlug: 'demo', surfaces: ['story', 'thumbnail'] })
  const tokens = tokenLookup(compileTokens(repo).flat)
  const states = kit.styles.map((style) => ({ style, status: 'draft' as const, digest: '0'.repeat(64), invalid_reason: null }))
  const first = previewFiles(kit, states, tokens, { lang: 'fa' })
  const second = previewFiles(kit, states, tokens, { lang: 'fa' })
  assert.deepEqual(first, second)
  assert.deepEqual(first.filter((file) => file.path.endsWith('index.html')).map((file) => file.path), ['story/index.html', 'thumbnail/index.html', 'index.html'])
  const svg = styleSvg(kit.styles[0]!, tokens)
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1080 /)
  for (const zone of SURFACE_SPECS.story.safe_zones) assert.match(svg, new RegExp(`data-safe-zone="${zone.id}"[^>]*stroke-dasharray`))
  assert.match(svg, /data-role="headline"/)
  assert.match(svg, /Aa EXAMPLE Display/, 'the token font family name is shown')
  assert.match(svg, new RegExp(compileTokens(repo).flat['color.brand.secondary']!.hex!, 'i'), 'layers use their token colour')
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)/, 'no network reference')
  const sheet = first.find((file) => file.path === 'story/index.html')!.contents
  assert.match(sheet, /dir="rtl"/)
  assert.match(sheet, /<img src="story\.question-poll\.svg"/)
})

test('en, fa and tr text is complete and every starter rule code is translated', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value).flatMap(([key, item]) => keys(item, `${prefix}${key}.`)) : Array.isArray(value) ? [`${prefix}[${value.length}]`] : [prefix]
  const en = keys(SOCIAL_KIT_TEXT.en).sort()
  for (const lang of ['fa', 'tr'] as const) assert.deepEqual(keys(SOCIAL_KIT_TEXT[lang]).sort(), en, lang)
  for (const lang of ['en', 'fa', 'tr'] as const) {
    for (const code of RULE_CODES) assert.ok(SOCIAL_KIT_TEXT[lang].rules[code], `${lang} ${code}`)
    for (const surface of SURFACES) for (const archetype of STARTER_ARCHETYPES[surface]) for (const rule of [...archetype.do, ...archetype.dont]) assert.ok(SOCIAL_KIT_TEXT[lang].rules[rule], rule)
  }
  // Persian strings are Persian, not a copy of English.
  for (const surface of SURFACES) for (const archetype of STARTER_ARCHETYPES[surface]) assert.match(archetype.name.fa + archetype.use.fa, /[؀-ۿ]/, archetype.slug)
})

test('a brand without a mascot gets no mascot style or layer; the spare archetype keeps four siblings', () => {
  const kit = buildStarterKit({ brandSlug: 'no-mascot', mascot: false })
  assert.equal(kit.styles.length, SURFACES.length * 4)
  for (const style of kit.styles) {
    assert.ok(!style.layers.some((layer) => layer.role === 'mascot'), `${style.id} has no mascot layer`)
  }
  assert.ok(kit.styles.some((style) => style.id === 'reel_cover.question'))
  assert.ok(buildStarterKit({ brandSlug: 'with-mascot' }).styles.some((style) => style.id === 'reel_cover.mascot-hook'))
})
