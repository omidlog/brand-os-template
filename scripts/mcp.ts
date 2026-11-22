import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  AGENT_TOKEN_ENV,
  AgentTokenError,
  brandRetrieve,
  draftPersonalContent,
  PERSONAL_SPECS,
  getAssetMetadata,
  getBrandGuidelines,
  getBrandOverview,
  getBrandStatus,
  getBrandTokens,
  getBusinessPlan,
  getDesignComponent,
  getLogoRules,
  getMarketingPlan,
  getMascotGuidelines,
  getMascotProfile,
  getMotionGuidelines,
  getSocialTemplate,
  InterviewEngine,
  listMascotAssets,
  listMascotStages,
  resolveAgentContext,
  RETRIEVE_KINDS,
  runKnowledgeTool,
  searchBrandDocs,
  searchMascotAssets,
} from '@brand-os/brand-core'
import { runCreativeContextTool, SURFACES } from '@brand-os/brand-core/creative'

const engine = new InterviewEngine(process.cwd())

/**
 * The caller's identity is fixed once, here, from the server's own environment.
 * No tool takes a role, token, or audience argument, so a client cannot raise its privilege.
 * Unknown, revoked, or cross-brand tokens stop the server (fail closed). No token means guest.
 * Token records are read once; revoking a token takes effect when the server restarts.
 */
function startupContext() {
  const token = process.env[AGENT_TOKEN_ENV]
  delete process.env[AGENT_TOKEN_ENV]
  try {
    return resolveAgentContext(engine.workspaceRoot(), engine.config().brand.slug, token)
  } catch (error) {
    const message = error instanceof AgentTokenError ? error.message : 'Agent token resolution failed. Refusing to start.'
    process.stderr.write(`brand-os mcp: ${message}\n`)
    process.exit(1)
  }
}
const caller = startupContext()
const server = new McpServer({ name: 'brand-os', version: '0.3.0' })

function text(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

server.registerTool('search_brand_docs', { description: 'Search approved facts this server may read. Guests see published public facts only.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchBrandDocs(engine, query, caller)))
server.registerTool('get_brand_tokens', { description: 'Return tokens whose approval hash matches the compiled value.', inputSchema: z.object({}) }, async () => text(getBrandTokens(engine, caller)))
server.registerTool('get_mascot_guidelines', { description: 'Return published mascot rules. Does not invent artwork.', inputSchema: z.object({}) }, async () => text(getMascotGuidelines(engine, caller)))
server.registerTool('list_mascot_assets', { description: 'List approved mascot rows. A disabled mascot returns none.', inputSchema: z.object({}) }, async () => text(listMascotAssets(engine, caller)))
server.registerTool('get_design_component', { description: 'Read one component record. Missing ids stay missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getDesignComponent(engine, id, caller)))
server.registerTool('get_social_template', { description: 'Return an approved social template only.', inputSchema: z.object({ channel: z.string() }) }, async ({ channel }) => text(getSocialTemplate(engine, channel, caller)))
server.registerTool('get_brand_status', { description: 'Coverage and approval counts. No answer values.', inputSchema: z.object({}) }, async () => text(getBrandStatus(engine, caller)))
server.registerTool('get_brand_overview', { description: 'Published overview facts or an explicit missing state.', inputSchema: z.object({}) }, async () => text(getBrandOverview(engine, caller)))
server.registerTool('get_brand_guidelines', { description: 'Published verbal and personality facts.', inputSchema: z.object({}) }, async () => text(getBrandGuidelines(engine, caller)))
server.registerTool('get_logo_rules', { description: 'Published logo rules, or missing.', inputSchema: z.object({}) }, async () => text(getLogoRules(engine, caller)))
server.registerTool('get_mascot_profile', { description: 'Published mascot profile. Disabled module is not applicable.', inputSchema: z.object({}) }, async () => text(getMascotProfile(engine, caller)))
server.registerTool('list_mascot_stages', { description: 'Approved mascot stages only.', inputSchema: z.object({}) }, async () => text(listMascotStages(engine, caller)))
server.registerTool('search_mascot_assets', { description: 'Search approved mascot rows.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchMascotAssets(engine, query, caller)))
server.registerTool('get_asset_metadata', { description: 'Approved public asset metadata, or missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getAssetMetadata(engine, id, caller)))
server.registerTool('get_motion_guidelines', { description: 'Published motion facts, or missing.', inputSchema: z.object({}) }, async () => text(getMotionGuidelines(engine, caller)))
server.registerTool('get_marketing_plan', { description: 'Published marketing facts, or missing.', inputSchema: z.object({}) }, async () => text(getMarketingPlan(engine, caller)))
server.registerTool('get_business_plan', { description: 'Published business facts, or missing.', inputSchema: z.object({}) }, async () => text(getBusinessPlan(engine, caller)))

server.registerTool(
  'brand_retrieve',
  {
    description:
      'Unified retrieval of approved brand knowledge this server is authorized to read. kind: facts (optionally module, ids, or query), tokens, mascot (filters: emotion, stage, use_case, angle; approved artwork or an explanation of what is missing), mascot_assets, mascot_stages, component, asset, social_template, status. Every item carries id, source_path, brand_id, classification, approval_state, revision, and withheld/missing markers.',
    inputSchema: z.object({
      kind: z.enum(RETRIEVE_KINDS),
      module: z.string().max(80).optional(),
      ids: z.array(z.string().max(200)).max(100).optional(),
      query: z.string().max(500).optional(),
      filters: z
        .object({
          emotion: z.string().max(100).optional(),
          stage: z.string().max(100).optional(),
          use_case: z.string().max(100).optional(),
          angle: z.string().max(100).optional(),
        })
        .strict()
        .optional(),
    }),
  },
  async ({ kind, module, ids, query, filters }) => text(brandRetrieve(engine, caller, { kind, module, ids, query, filters })),
)

server.registerTool(
  'draft_personal_content',
  {
    description:
      'Draft operation for a Personal Brand OS deliverable (for example professional-bio section short, or linkedin-pack). Returns only approved personal facts this server may read, each with its verification label (verified, owner_stated, unverified), plus the ids that are missing. It has no authority: it cannot approve, publish or write. Compose the draft from these facts only and return it to the owner for approval.',
    inputSchema: z.object({
      deliverable: z.enum(Object.keys(PERSONAL_SPECS) as [string, ...string[]]),
      section: z.string().max(80).optional(),
    }),
  },
  async ({ deliverable, section }) => text(draftPersonalContent(engine, deliverable, caller, section)),
)

// Knowledge tools: read and preview only, shared notes only, knowledge-read profile only (see knowledge/agent.ts).
const knowledgeFilters = {
  status: z.array(z.enum(['inbox', 'triaged', 'active', 'archived'])).max(4).optional(),
  kind: z.array(z.enum(['idea', 'research', 'reference', 'meeting', 'decision_draft', 'general'])).max(6).optional(),
  tags: z.array(z.string().max(48)).max(10).optional(),
  question_id: z.string().max(120).optional(),
  include_archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
}
const KNOWLEDGE_NOTE = 'Notes are the owner’s unapproved ideas from brand/knowledge/shared, never brand facts. Needs a knowledge-read token; others get denied.'
server.registerTool('knowledge_list', { description: `List shared knowledge notes (metadata, paginated). ${KNOWLEDGE_NOTE}`, inputSchema: z.object(knowledgeFilters) }, async (args) => text(runKnowledgeTool(engine, caller, 'knowledge_list', args)))
server.registerTool(
  'knowledge_search',
  { description: `Search shared knowledge notes (fa/tr/en) and, separately, approved facts this token may read. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ query: z.string().max(500), ...knowledgeFilters }) },
  async (args) => text(runKnowledgeTool(engine, caller, 'knowledge_search', args)),
)
server.registerTool('knowledge_read', { description: `Read one shared note: body, id and revision. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) }, async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_read', { id })))
server.registerTool('knowledge_backlinks', { description: `Links in and out of a shared note, and its linked question ids. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) }, async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_backlinks', { id })))
server.registerTool(
  'knowledge_suggest_proposal',
  { description: `Preview only: existing question ids a shared note may inform, with the source ref to cite. Writes nothing; the owner stores drafts with brand:knowledge propose. ${KNOWLEDGE_NOTE}`, inputSchema: z.object({ id: z.string().max(80) }) },
  async ({ id }) => text(runKnowledgeTool(engine, caller, 'knowledge_suggest_proposal', { id })),
)

// Creative memory: one read-only tool, creative-read profile only (see creative/agent.ts). Approved preferences and
// cited reasons; drafts withheld; local note text withheld. Every call is access-logged.
server.registerTool(
  'creative_context',
  {
    description:
      'Read-only creative context for new design work: the owner-approved scoped creative preferences that apply, and the owner’s cited reasons for selected, rejected and partly kept variants of in-scope projects, with knowledge:kn_…@sha256 provenance. Give project_id, or surface and series. Drafts are withheld; selected is not a performance result; nothing here authorizes publishing, posting or ads. Needs a creative-read token; others get denied.',
    inputSchema: z.object({
      project_id: z.string().max(40).optional(),
      surface: z.enum(SURFACES).optional(),
      series: z.string().max(40).optional(),
    }),
  },
  async ({ project_id, surface, series }) => text(runCreativeContextTool(engine, caller, { project_id, surface, series })),
)

const transport = new StdioServerTransport()
await server.connect(transport)
