import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import type { AnswerRecord, FieldQuestion } from './types.js'
import type { InterviewEngine } from './engine.js'
import { compileTokens } from '@brand-os/design-tokens'

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

function approvedFacts(engine: InterviewEngine): Record<string, { value?: unknown; visibility?: string; approved_by?: string; updated?: string; answer_id?: string }> {
  const file = path.join(engine.workspaceRoot(), 'brand', 'instance', 'approved-facts.yaml')
  if (!fs.existsSync(file)) return {}
  const doc = parse(fs.readFileSync(file, 'utf8')) as { facts?: Record<string, { value?: unknown; visibility?: string; approved_by?: string; updated?: string; answer_id?: string }> }
  return doc.facts ?? {}
}

export function searchBrandDocs(engine: InterviewEngine, query: string, includeUnapproved = false): ToolResult {
  const root = engine.workspaceRoot()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits: Array<Record<string, unknown>> = []
  const facts = approvedFacts(engine)
  for (const [id, fact] of Object.entries(facts)) {
    if (fact.visibility === 'restricted') continue
    if (!includeUnapproved && fact.visibility !== 'public') continue
    const haystack = `${id} ${String(fact.value ?? '')}`.toLowerCase()
    if (terms.every((term) => haystack.includes(term))) {
      hits.push({ id, status: 'approved', source: 'brand/instance/approved-facts.yaml', value: fact.value, approved_by: fact.approved_by, visibility: fact.visibility })
    }
  }
  if (includeUnapproved) {
    walkDocs(root, (file, text) => {
      const haystack = text.toLowerCase()
      if (!terms.every((term) => haystack.includes(term))) return
      const line = text.split('\n').find((entry) => terms.every((term) => entry.toLowerCase().includes(term))) ?? ''
      hits.push({ id: path.relative(root, file), status: 'draft', source: path.relative(root, file), excerpt: line.slice(0, 240) })
    })
  }
  return envelope('search_brand_docs', 'brand/', includeUnapproved ? 'mixed' : 'approved', hits.some((hit) => hit.status === 'approved'), 'Restricted values are never returned. Unapproved excerpts require include_unapproved.', { query, hits: hits.slice(0, 20) })
}

function walkDocs(root: string, visit: (file: string, text: string) => void): void {
  for (const relative of ['brand/content', 'brand/business-os', 'brand/generated/artifacts']) {
    const dir = path.join(root, relative)
    if (!fs.existsSync(dir)) continue
    const stack = [dir]
    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) break
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) stack.push(full)
        else if (entry.name.endsWith('.md')) visit(full, fs.readFileSync(full, 'utf8'))
      }
    }
  }
}

export function getBrandTokens(engine: InterviewEngine, includeUnapproved = false): ToolResult {
  const root = engine.workspaceRoot()
  const compiled = compileTokens(root)
  const approvalFile = path.join(root, 'brand', 'tokens', 'approvals.yaml')
  const approved = fs.existsSync(approvalFile) ? ((parse(fs.readFileSync(approvalFile, 'utf8')) as { approved?: Record<string, { approved_by?: string }> }).approved ?? {}) : {}
  const tokens = Object.entries(compiled.flat)
    .filter(([id]) => includeUnapproved || approved[id])
    .map(([id, token]) => ({ id, type: token.type, value: token.hex ?? token.value, approved: Boolean(approved[id]), approved_by: approved[id]?.approved_by ?? null, source: 'brand/tokens' }))
  return envelope('get_brand_tokens', 'brand/tokens', tokens.some((token) => token.approved) ? 'approved' : 'draft', tokens.some((token) => token.approved), includeUnapproved ? 'Draft EXAMPLE values included because include_unapproved was set.' : 'Only tokens listed in brand/tokens/approvals.yaml are returned.', { tokens, errors: compiled.errors })
}

export function getMascotGuidelines(engine: InterviewEngine, includeUnapproved = false): ToolResult {
  const enabled = engine.config().modules.mascot.enabled
  const facts = approvedFacts(engine)
  const rules = Object.entries(facts)
    .filter(([id, fact]) => id.startsWith('brand.mascot.') && fact.visibility !== 'restricted' && (includeUnapproved || true))
    .filter(([, fact]) => includeUnapproved || fact.value !== undefined)
    .map(([id, fact]) => ({ id, value: fact.value, approved_by: fact.approved_by, source: 'brand/instance/approved-facts.yaml' }))
  return envelope('get_mascot_guidelines', 'brand/mascot/mascot.config.yaml', enabled ? 'draft' : 'not_applicable', rules.length > 0, enabled ? 'Approved mascot rules come from approved facts. Catalog art is not implied.' : 'Mascot module is disabled.', { enabled, rules })
}

export function listMascotAssets(engine: InterviewEngine, includeUnapproved = false): ToolResult {
  const root = engine.workspaceRoot()
  const catalog = parse(fs.readFileSync(path.join(root, 'brand', 'mascot', 'catalog.yaml'), 'utf8')) as { states: Array<Record<string, unknown>> }
  const manifest = parse(fs.readFileSync(path.join(root, 'brand', 'assets', 'asset-manifest.yaml'), 'utf8')) as { assets: Array<Record<string, unknown>> }
  const rows = [
    ...catalog.states.filter((state) => includeUnapproved || state.status === 'approved').map((state) => ({
      id: state.id,
      name: state.name,
      status: state.status,
      source: 'brand/mascot/catalog.yaml',
      source_assets: state.source_assets,
      preview: state.preview,
    })),
    ...manifest.assets.filter((asset) => String(asset.id).includes('mascot') && (includeUnapproved || asset.status === 'approved')).map((asset) => ({
      id: asset.id,
      name: asset.name,
      status: asset.status,
      source: 'brand/assets/asset-manifest.yaml',
      path: asset.path,
      checksum_sha256: asset.checksum_sha256,
      present: asset.present,
    })),
  ]
  return envelope('list_mascot_assets', 'brand/mascot/catalog.yaml', rows.some((row) => row.status === 'approved') ? 'approved' : 'draft', rows.some((row) => row.status === 'approved'), 'Reads the brand YAML, not the code generator. Unapproved rows are omitted unless include_unapproved is set.', { count: rows.length, rows })
}

export function getDesignComponent(engine: InterviewEngine, id: string): ToolResult {
  const root = engine.workspaceRoot()
  const file = path.join(root, 'brand', 'content', '12-product-ui-system', 'components.yaml')
  const doc = parse(fs.readFileSync(file, 'utf8')) as { components?: Array<Record<string, unknown>> }
  const found = (doc.components ?? []).find((component) => component.id === `component.${id}` || component.id === id || component.name === id)
  return envelope('get_design_component', 'brand/content/12-product-ui-system/components.yaml', found ? String(found.status ?? 'draft') : 'missing', false, found ? 'Component record from components.yaml. Not an approved production kit unless its status says approved.' : `No component named ${id} is in the registry.`, found ?? { id, found: false })
}

export function getSocialTemplate(engine: InterviewEngine, channel: string): ToolResult {
  const root = engine.workspaceRoot()
  const file = path.join(root, 'brand', 'templates', 'social-post.md')
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const approved = /status:\s*approved/i.test(text)
  return envelope('get_social_template', 'brand/templates/social-post.md', approved ? 'approved' : 'draft', approved, approved ? 'Approved social template body.' : `No approved ${channel} template. The starter brief exists and is still a draft.`, { channel, templates: approved ? [{ source: 'brand/templates/social-post.md', body: text }] : [] })
}

export function getBrandStatus(engine: InterviewEngine): ToolResult {
  const report = engine.statusReport()
  return envelope('get_brand_status', 'brand/interview/answer-ledger.yaml', 'draft', false, 'Coverage and approval are separate. Restricted values are not included.', {
    brand: engine.config().brand.name,
    slug: engine.config().brand.slug,
    nameStatus: engine.config().brand.name_status,
    publish_docs: engine.config().brand.publish_docs,
    coverage: report.coverage,
    approval: report.approval,
    requiredUnanswered: report.requiredUnanswered,
    contradictions: report.contradictions,
    mascot: engine.config().modules.mascot.enabled,
    gamification: engine.config().modules.gamification.enabled,
    next: report.next.map((item) => item.id),
  })
}

export function describeQuestion(engine: InterviewEngine, question: FieldQuestion, includeUnapproved: boolean) {
  const answer = (engine.exportSnapshot('full').answers as AnswerRecord[]).find((item) => item.question_id === question.id)
  const show = answer && answer.visibility !== 'restricted' && (answer.status === 'approved' || includeUnapproved)
  return { id: question.id, status: answer?.status ?? 'unanswered', value: show ? answer?.value : null, withheld: answer?.visibility === 'restricted' }
}

export function resolveAgentRequest(engine: InterviewEngine, requestId: 'instagram-carousel' | 'onboarding-mascot') {
  if (requestId === 'instagram-carousel') {
    const tokens = getBrandTokens(engine, false)
    return {
      request: 'Create an Instagram carousel using approved brand typography',
      steps: ['Read AGENTS.md', 'Open brand/content/16-social-media/overview.md', 'Call get_brand_tokens without include_unapproved', 'Stop if no approved type exists'],
      result: tokens,
      gap: (tokens.data as { tokens: unknown[] }).tokens.length === 0 ? 'No approved typography.' : 'Approved tokens are listed in the result.',
    }
  }
  const assets = listMascotAssets(engine, true)
  const rows = (assets.data as { rows: Array<{ id?: unknown }> }).rows.filter((row) => ['mascot.ui.success', 'mascot.emotion.joyful', 'mascot.emotion.delighted'].includes(String(row.id)))
  return {
    request: 'Find the approved happy mascot pose for an onboarding success screen',
    steps: ['Confirm mascot module', 'Read catalog YAML ids', 'Do not invent artwork'],
    result: rows,
    gap: rows.every((row) => (row as { status?: string }).status !== 'approved') ? 'Catalog rows exist as drafts. Approved artwork is missing.' : 'Approved rows are included.',
    enabled: engine.config().modules.mascot.enabled,
  }
}
