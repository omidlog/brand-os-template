import type { AnswerRecord, FieldQuestion } from './types.js'
import type { InterviewEngine } from './engine.js'
import { buildMascotCatalog } from './content/mascot-catalog.js'

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

export function searchBrandDocs(engine: InterviewEngine, query: string, includeUnapproved = false): ToolResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = engine
    .questions()
    .filter((question) => {
      const haystack = `${question.id} ${question.label} ${question.prompt.en} ${question.module}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
    .slice(0, 20)
    .map((question) => describeQuestion(engine, question, includeUnapproved))
  return envelope(
    'search_brand_docs',
    'brand/interview/question-bank',
    'draft',
    false,
    includeUnapproved
      ? 'Draft questions and answers may be included. Restricted values are still withheld.'
      : 'Approved answers only. The template has no approved facts, so values are omitted.',
    { query, hits },
  )
}

export function getBrandTokens(includeUnapproved = false): ToolResult {
  return envelope(
    'get_brand_tokens',
    'brand/tokens',
    'draft',
    false,
    includeUnapproved
      ? 'EXAMPLE token values are unapproved drafts for the pipeline.'
      : 'No approved tokens. Unapproved EXAMPLE values were withheld. Pass include_unapproved to review drafts locally.',
    includeUnapproved
      ? { sourceFiles: ['brand/tokens/color.tokens.json', 'brand/tokens/typography.tokens.json', 'brand/tokens/space.tokens.json', 'brand/tokens/radius.tokens.json', 'brand/tokens/motion.tokens.json'] }
      : { tokens: [] },
  )
}

export function getMascotGuidelines(engine: InterviewEngine, includeUnapproved = false): ToolResult {
  const enabled = engine.config().modules.mascot.enabled
  return envelope(
    'get_mascot_guidelines',
    'brand/content/06-mascot-identity/overview.md',
    enabled ? 'draft' : 'not_applicable',
    false,
    enabled
      ? 'Mascot guidance is a draft catalog. No character artwork is approved.'
      : 'Mascot module is disabled for this brand. Do not invent a character.',
    includeUnapproved
      ? { enabled, stages: 'brand/mascot/stages.yaml', angles: 'brand/mascot/angles.yaml', motions: 'brand/mascot/motions.yaml' }
      : { enabled, approvedRules: [] },
  )
}

export function listMascotAssets(includeUnapproved = false): ToolResult {
  const catalog = buildMascotCatalog()
  const rows = catalog
    .filter((state) => includeUnapproved || state.status === 'approved')
    .map((state) => ({
      id: state.id,
      name: state.name,
      category: state.category,
      status: state.status,
      mvp: state.mvp,
      source_assets: state.source_assets,
      preview: state.preview,
    }))
  return envelope(
    'list_mascot_assets',
    'brand/mascot/catalog.yaml',
    'draft',
    false,
    rows.length === 0
      ? 'No approved mascot assets. The 90-state catalog is a draft backlog with empty art slots.'
      : 'Approved rows only.',
    { count: rows.length, catalogSize: catalog.length, rows },
  )
}

export function getDesignComponent(id: string): ToolResult {
  const known = ['button', 'text-field', 'dialog', 'card', 'navigation', 'feedback', 'chart']
  const found = known.includes(id)
  return envelope(
    'get_design_component',
    'brand/content/12-product-ui-system/components.yaml',
    'draft',
    false,
    found
      ? `${id} is documented as a starter component. It is not an approved production kit.`
      : `Unknown component "${id}". No component was invented.`,
    found ? { id, states: ['default', 'hover', 'focus', 'active', 'disabled', 'loading', 'error'], tokens: 'brand/tokens' } : { id, found: false },
  )
}

export function getSocialTemplate(channel: string): ToolResult {
  return envelope(
    'get_social_template',
    'brand/content/16-social-media/overview.md',
    'not_started',
    false,
    `No approved ${channel} template. Do not invent export sizes or claim the EXAMPLE typography is approved.`,
    { channel, templates: [] },
  )
}

export function getBrandStatus(engine: InterviewEngine): ToolResult {
  const report = engine.statusReport()
  return envelope('get_brand_status', 'brand/interview/answer-ledger.yaml', 'draft', false, 'Coverage and approval are separate. Values are not included.', {
    brand: engine.config().brand.name,
    nameStatus: engine.config().brand.name_status,
    coverage: report.coverage,
    approval: report.approval,
    requiredUnanswered: report.requiredUnanswered,
    contradictions: report.contradictions,
    mascot: engine.config().modules.mascot.enabled,
    gamification: engine.config().modules.gamification.enabled,
    next: report.next.map((item) => item.id),
  })
}

function describeQuestion(engine: InterviewEngine, question: FieldQuestion, includeUnapproved: boolean) {
  const answer = engine.exportSnapshot('full').answers as AnswerRecord[] | undefined
  const list = Array.isArray(answer) ? answer : []
  const latest = list.find((item) => item.question_id === question.id)
  const approved = latest?.status === 'approved'
  const show = latest && (approved || includeUnapproved) && latest.visibility !== 'restricted'
  return {
    id: question.id,
    module: question.module,
    status: latest?.status ?? 'unanswered',
    source: question.related_outputs[0] ?? `brand/interview/question-bank`,
    value: show ? latest?.value : null,
    withheld: latest?.visibility === 'restricted',
  }
}

export function resolveAgentRequest(engine: InterviewEngine, requestId: 'instagram-carousel' | 'onboarding-mascot') {
  if (requestId === 'instagram-carousel') {
    const tokens = getBrandTokens(false)
    return {
      request: 'Create an Instagram carousel using approved brand typography',
      steps: [
        'Read AGENTS.md and prefer approved records over drafts.',
        'Open brand/content/16-social-media/overview.md.',
        'Open brand/tokens/typography.tokens.json and check status.',
        'Call get_brand_tokens without include_unapproved.',
        'Stop. Do not draw the carousel with EXAMPLE type presented as approved.',
      ],
      result: tokens,
      gap: 'No approved typography and no approved social template.',
    }
  }
  const catalog = buildMascotCatalog()
  const ids = ['mascot.ui.success', 'mascot.emotion.joyful', 'mascot.emotion.delighted']
  return {
    request: 'Find the approved happy mascot pose for an onboarding success screen',
    steps: [
      'Confirm brand.config modules.mascot.enabled.',
      'Look up mascot.ui.success, then mascot.emotion.joyful and mascot.emotion.delighted.',
      'Read source_assets and status. Do not substitute generated art.',
    ],
    result: ids.map((id) => catalog.find((state) => state.id === id)),
    gap: 'Catalog rows exist as drafts. Approved artwork is missing.',
    enabled: engine.config().modules.mascot.enabled,
  }
}
