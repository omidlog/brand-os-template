import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { FieldQuestion } from './types.js'
import type { InterviewEngine } from './engine.js'
import { compileTokens } from '@brand-os/design-tokens'
import { inspectAssetForPublication } from '@brand-os/asset-catalog'
import { authorize, guestContext, type AuthContext } from './auth.js'
import { readFacts } from './facts.js'
import { assetIsPublic, factIsPublic, pageIsPublic, readPublicationPolicy } from './publication.js'

export interface ToolResult {
  tool: string
  version: string
  status: string
  source: string
  approved: boolean
  note: string
  data: unknown
}

const VERSION = '0.1.0'

function envelope(tool: string, source: string, status: string, approved: boolean, note: string, data: unknown): ToolResult {
  return { tool, version: VERSION, status, source, approved, note, data }
}

function guard(engine: InterviewEngine, ctx: AuthContext | undefined, classification: 'public' | 'internal' | 'restricted'): { allow: boolean; reason: string } {
  const auth = ctx ?? guestContext(engine.config().brand.slug)
  if (engine.config().brand.publish_docs !== 'public' && (auth.role === 'guest' || auth.role === 'agent' || auth.audience === 'public')) {
    return { allow: false, reason: 'private brand does not expose public MCP tools' }
  }
  return authorize(auth, { brand_id: engine.config().brand.slug, classification, status: 'approved', publication: classification === 'public' ? 'published' : 'unpublished' }, 'read')
}

export function searchBrandDocs(engine: InterviewEngine, query: string, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('search_brand_docs', 'brand/instance/approved-facts.yaml', 'denied', false, decision.reason, { query, hits: [] })
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits: Array<Record<string, unknown>> = []
  const facts = readFacts(engine.workspaceRoot(), 'approved', engine.config().brand.slug)
  for (const [id, fact] of Object.entries(facts)) {
    if (!factIsPublic(engine.workspaceRoot(), id, fact, engine.config().brand.slug)) continue
    const haystack = `${id} ${String(fact.value ?? '')}`.toLowerCase()
    if (terms.every((term) => haystack.includes(term))) {
      hits.push({ id, status: 'approved', source: 'brand/instance/approved-facts.yaml', value: fact.value, revision: fact.revision_hash, audience: 'public' })
    }
  }
  return envelope('search_brand_docs', 'brand/instance/approved-facts.yaml', 'approved', hits.length > 0, 'Only published public facts.', { query, hits: hits.slice(0, 20) })
}

export function getBrandTokens(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_brand_tokens', 'brand/tokens', 'denied', false, decision.reason, { tokens: [] })
  const root = engine.workspaceRoot()
  const compiled = compileTokens(root)
  const approvalFile = path.join(root, 'brand', 'tokens', 'approvals.yaml')
  const approved = fs.existsSync(approvalFile) ? ((parse(fs.readFileSync(approvalFile, 'utf8')) as { approved?: Record<string, { approved_by?: string }> }).approved ?? {}) : {}
  const tokens = Object.entries(compiled.flat)
    .filter(([id, token]) => {
      const entry = approved[id] as { value_sha256?: string } | undefined
      if (!entry || !readPublicationPolicy(root).approved_token_ids.includes(id)) return false
      if (!entry.value_sha256) return false
      const basis = String(token.hex ?? JSON.stringify(token.value))
      return entry.value_sha256 === crypto.createHash('sha256').update(basis).digest('hex')
    })
    .map(([id, token]) => ({ id, type: token.type, value: token.hex ?? token.value, approved: true, source: 'brand/tokens' }))
  return envelope('get_brand_tokens', 'brand/tokens', tokens.length > 0 ? 'approved' : 'draft', tokens.length > 0, 'Only explicitly published, hash-approved tokens are returned.', { tokens })
}

export function getMascotGuidelines(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_mascot_guidelines', 'brand/mascot/mascot.config.yaml', 'denied', false, decision.reason, { rules: [] })
  const enabled = engine.config().modules.mascot.enabled
  const facts = readFacts(engine.workspaceRoot(), 'approved', engine.config().brand.slug)
  const rules = Object.entries(facts)
    .filter(([id, fact]) => id.startsWith('brand.mascot.') && factIsPublic(engine.workspaceRoot(), id, fact, engine.config().brand.slug))
    .map(([id, fact]) => ({ id, value: fact.value, source: 'brand/instance/approved-facts.yaml' }))
  return envelope('get_mascot_guidelines', 'brand/mascot/mascot.config.yaml', enabled ? 'draft' : 'not_applicable', rules.length > 0, enabled ? 'Approved mascot rules come from approved facts. Catalog art is not implied.' : 'Mascot module is disabled.', { enabled, rules })
}

export function listMascotAssets(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('list_mascot_assets', 'brand/mascot/catalog.yaml', 'denied', false, decision.reason, { count: 0, rows: [] })
  if (!engine.config().modules.mascot.enabled) {
    return envelope('list_mascot_assets', 'brand/mascot/catalog.yaml', 'not_applicable', false, 'Mascot module is disabled. Draft catalog rows are not returned.', { count: 0, rows: [] })
  }
  const root = engine.workspaceRoot()
  const catalog = parse(fs.readFileSync(path.join(root, 'brand', 'mascot', 'catalog.yaml'), 'utf8')) as { states: Array<Record<string, unknown>> }
  const manifest = parse(fs.readFileSync(path.join(root, 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as { assets: Array<Record<string, unknown>> }
  const publicAssets = manifest.assets.filter((asset) => assetIsPublic(root, asset) && typeof asset.checksum_sha256 === 'string' &&
    inspectAssetForPublication(root, String(asset.path), asset.checksum_sha256).ok)
  const rows = [
    ...catalog.states.filter((state) => state.status === 'approved' && pageIsPublic(root, String(state.id))).map((state) => ({
      id: state.id,
      name: state.name,
      status: state.status,
      source: 'brand/mascot/catalog.yaml',
      source_assets: Array.isArray(state.source_assets) ? state.source_assets.filter((assetPath) => publicAssets.some((asset) => asset.path === assetPath)) : [],
      preview: publicAssets.some((asset) => asset.path === state.preview) ? state.preview : null,
    })),
    ...publicAssets.filter((asset) => String(asset.id).includes('mascot')).map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: asset.status,
      source: 'brand/assets/asset-manifest.yaml',
      path: asset.path,
      checksum_sha256: asset.checksum_sha256,
      present: asset.present,
    })),
  ]
  return envelope('list_mascot_assets', 'brand/mascot/catalog.yaml', rows.length > 0 ? 'approved' : 'draft', rows.length > 0, 'Approved rows only. include_unapproved does not raise privilege.', { count: rows.length, rows })
}

export function getDesignComponent(engine: InterviewEngine, id: string, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_design_component', 'brand/content/12-product-ui-system/components.yaml', 'denied', false, decision.reason, { id, found: false })
  const root = engine.workspaceRoot()
  const file = path.join(root, 'brand', 'content', '12-product-ui-system', 'components.yaml')
  const doc = parse(fs.readFileSync(file, 'utf8')) as { components?: Array<Record<string, unknown>> }
  const found = (doc.components ?? []).find((component) => component.id === `component.${id}` || component.id === id || component.name === id)
  const published = found && found.status === 'approved' && (pageIsPublic(root, String(found.id)) || pageIsPublic(root, 'brand/content/12-product-ui-system/components.yaml'))
  return envelope('get_design_component', 'brand/content/12-product-ui-system/components.yaml', published ? 'approved' : 'missing', Boolean(published), published ? 'Approved and explicitly published component.' : `No published component named ${id}.`, published ? found : { id, found: false })
}

export function getSocialTemplate(engine: InterviewEngine, channel: string, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_social_template', 'brand/templates/social-post.md', 'denied', false, decision.reason, { channel, templates: [] })
  const root = engine.workspaceRoot()
  const file = path.join(root, 'brand', 'templates', 'social-post.md')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)
  const metadata = frontmatter ? (parse(frontmatter[1] ?? '') as { status?: string } | null) : null
  const approved = pageIsPublic(root, 'brand/templates/social-post.md') && metadata?.status === 'approved'
  return envelope('get_social_template', 'brand/templates/social-post.md', approved ? 'approved' : 'draft', approved, approved ? 'Approved social template body.' : `No approved ${channel} template. The starter brief exists and is still a draft.`, { channel, templates: approved ? [{ source: 'brand/templates/social-post.md', body: text }] : [] })
}

function publishedValue(engine: InterviewEngine, id: string): { value: string; revision: string | null; version: number } | null {
  const fact = readFacts(engine.workspaceRoot(), 'approved', engine.config().brand.slug)[id]
  if (!fact || !factIsPublic(engine.workspaceRoot(), id, fact, engine.config().brand.slug)) return null
  return { value: String(fact.value), revision: fact.revision_hash, version: fact.version }
}

function factTool(engine: InterviewEngine, tool: string, ids: string[], ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope(tool, 'brand/instance/approved-facts.yaml', 'denied', false, decision.reason, { facts: [] })
  const facts = ids.map((id) => ({ id, ...(publishedValue(engine, id) ?? { value: null, missing: true }) }))
  return envelope(tool, 'brand/instance/approved-facts.yaml', facts.some((fact) => fact.value) ? 'approved' : 'missing', facts.some((fact) => fact.value), 'Missing fields stay missing.', { facts })
}

export function getBrandOverview(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_brand_overview', ['business.identity.trade_name', 'brand.strategy.purpose', 'business.offer.value_proposition'], ctx)
}

export function getBrandGuidelines(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_brand_guidelines', ['brand.personality.traits', 'brand.verbal.tagline', 'brand.verbal.voice'], ctx)
}

export function getLogoRules(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_logo_rules', ['brand.logo.primary', 'brand.logo.clearspace'], ctx)
}

export function getMascotProfile(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  if (!engine.config().modules.mascot.enabled) return envelope('get_mascot_profile', 'brand/mascot/mascot.config.yaml', 'not_applicable', false, 'Mascot module is disabled.', { facts: [] })
  return factTool(engine, 'get_mascot_profile', ['brand.mascot.role', 'brand.mascot.personality'], ctx)
}

export function listMascotStages(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('list_mascot_stages', 'brand/mascot/stages.yaml', 'denied', false, decision.reason, { stages: [] })
  if (!engine.config().modules.mascot.enabled) return envelope('list_mascot_stages', 'brand/mascot/stages.yaml', 'not_applicable', false, 'Mascot module is disabled.', { stages: [] })
  const file = path.join(engine.workspaceRoot(), 'brand', 'mascot', 'stages.yaml')
  const doc = parse(fs.readFileSync(file, 'utf8')) as { stages?: Array<Record<string, unknown>> }
  const stages = (doc.stages ?? []).filter((stage) => stage.status === 'approved' && pageIsPublic(engine.workspaceRoot(), String(stage.id)))
  return envelope('list_mascot_stages', 'brand/mascot/stages.yaml', stages.length ? 'approved' : 'missing', stages.length > 0, 'Unapproved stages are omitted.', { stages })
}

export function searchMascotAssets(engine: InterviewEngine, query: string, ctx?: AuthContext): ToolResult {
  const listed = listMascotAssets(engine, ctx)
  const rows = ((listed.data as { rows?: Array<Record<string, unknown>> }).rows ?? []).filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
  return envelope('search_mascot_assets', 'brand/mascot/catalog.yaml', rows.length ? 'approved' : 'missing', rows.length > 0, rows.length ? 'Approved rows only.' : 'No approved mascot asset matched.', { rows })
}

export function getAssetMetadata(engine: InterviewEngine, id: string, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_asset_metadata', 'brand/assets/asset-manifest.yaml', 'denied', false, decision.reason, { asset: null })
  const manifest = parse(fs.readFileSync(path.join(engine.workspaceRoot(), 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as { assets: Array<Record<string, unknown>> }
  const asset = manifest.assets.find((item) => item.id === id && assetIsPublic(engine.workspaceRoot(), item) && typeof item.checksum_sha256 === 'string' && inspectAssetForPublication(engine.workspaceRoot(), String(item.path), item.checksum_sha256).ok)
  const safe = asset ? { id: asset.id, name: asset.name, path: asset.path, checksum_sha256: asset.checksum_sha256, license: asset.license, usage: asset.usage } : null
  return envelope('get_asset_metadata', 'brand/assets/asset-manifest.yaml', asset ? 'approved' : 'missing', Boolean(asset), asset ? 'Approved public asset.' : `No approved public asset ${id}.`, { asset: safe })
}

export function getMotionGuidelines(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_motion_guidelines', ['brand.motion.easing', 'brand.motion.duration'], ctx)
}

export function getMarketingPlan(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_marketing_plan', ['business.marketing.objective', 'business.marketing.channels', 'business.marketing.budget'], ctx)
}

export function getBusinessPlan(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  return factTool(engine, 'get_business_plan', ['business.identity.trade_name', 'business.offer.summary', 'business.customer.primary_segment'], ctx)
}

export function getBrandStatus(engine: InterviewEngine, ctx?: AuthContext): ToolResult {
  const decision = guard(engine, ctx, 'public')
  if (!decision.allow) return envelope('get_brand_status', 'brand/publication-policy.yaml', 'denied', false, decision.reason, {})
  const release = engine.exportPublic()
  return envelope('get_brand_status', 'brand/publication-policy.yaml', 'approved', true, 'Public release status only. Internal progress is not accessible anonymously.', {
    brand: release.display_name ?? 'Unpublished',
    slug: release.brand_id,
    publishedFactCount: release.facts.length,
    release: release.release,
  })
}

export function describeQuestion(engine: InterviewEngine, question: FieldQuestion, _ctx?: AuthContext) {
  const facts = readFacts(engine.workspaceRoot(), 'approved', engine.config().brand.slug)
  const fact = facts[question.id]
  const show = factIsPublic(engine.workspaceRoot(), question.id, fact, engine.config().brand.slug)
  return { id: question.id, status: show ? 'approved' : 'withheld', value: show ? fact?.value : null, withheld: !show }
}

export function resolveAgentRequest(engine: InterviewEngine, requestId: 'instagram-carousel' | 'onboarding-mascot') {
  if (requestId === 'instagram-carousel') {
    const tokens = getBrandTokens(engine)
    return {
      request: 'Create an Instagram carousel using approved brand typography',
      steps: ['Read AGENTS.md', 'Open brand/content/16-social-media/overview.md', 'Call get_brand_tokens without include_unapproved', 'Stop if no approved type exists'],
      result: tokens,
      gap: (tokens.data as { tokens: unknown[] }).tokens.length === 0 ? 'No approved typography.' : 'Approved tokens are listed in the result.',
    }
  }
  const assets = listMascotAssets(engine)
  const rows = (assets.data as { rows: Array<{ id?: unknown }> }).rows.filter((row) => ['mascot.ui.success', 'mascot.emotion.joyful', 'mascot.emotion.delighted'].includes(String(row.id)))
  return {
    request: 'Find the approved happy mascot pose for an onboarding success screen',
    steps: ['Confirm mascot module', 'Read catalog YAML ids', 'Do not invent artwork'],
    result: rows,
    gap: rows.length === 0 ? 'Approved artwork is missing.' : 'Approved rows are included.',
    enabled: engine.config().modules.mascot.enabled,
  }
}
