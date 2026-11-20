import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
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
  guestContext,
  InterviewEngine,
  listMascotAssets,
  listMascotStages,
  searchBrandDocs,
  searchMascotAssets,
} from '@brand-os/brand-core'

const engine = new InterviewEngine(process.cwd())
const guest = guestContext(engine.config().brand.slug)
const server = new McpServer({ name: 'brand-os', version: '0.3.0' })

function text(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

server.registerTool('search_brand_docs', { description: 'Search published public facts.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchBrandDocs(engine, query, guest)))
server.registerTool('get_brand_tokens', { description: 'Return tokens whose approval hash matches the compiled value.', inputSchema: z.object({}) }, async () => text(getBrandTokens(engine, guest)))
server.registerTool('get_mascot_guidelines', { description: 'Return published mascot rules. Does not invent artwork.', inputSchema: z.object({}) }, async () => text(getMascotGuidelines(engine, guest)))
server.registerTool('list_mascot_assets', { description: 'List approved mascot rows. A disabled mascot returns none.', inputSchema: z.object({}) }, async () => text(listMascotAssets(engine, guest)))
server.registerTool('get_design_component', { description: 'Read one component record. Missing ids stay missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getDesignComponent(engine, id, guest)))
server.registerTool('get_social_template', { description: 'Return an approved social template only.', inputSchema: z.object({ channel: z.string() }) }, async ({ channel }) => text(getSocialTemplate(engine, channel, guest)))
server.registerTool('get_brand_status', { description: 'Coverage and approval counts. No answer values.', inputSchema: z.object({}) }, async () => text(getBrandStatus(engine, guest)))
server.registerTool('get_brand_overview', { description: 'Published overview facts or an explicit missing state.', inputSchema: z.object({}) }, async () => text(getBrandOverview(engine, guest)))
server.registerTool('get_brand_guidelines', { description: 'Published verbal and personality facts.', inputSchema: z.object({}) }, async () => text(getBrandGuidelines(engine, guest)))
server.registerTool('get_logo_rules', { description: 'Published logo rules, or missing.', inputSchema: z.object({}) }, async () => text(getLogoRules(engine, guest)))
server.registerTool('get_mascot_profile', { description: 'Published mascot profile. Disabled module is not applicable.', inputSchema: z.object({}) }, async () => text(getMascotProfile(engine, guest)))
server.registerTool('list_mascot_stages', { description: 'Approved mascot stages only.', inputSchema: z.object({}) }, async () => text(listMascotStages(engine, guest)))
server.registerTool('search_mascot_assets', { description: 'Search approved mascot rows.', inputSchema: z.object({ query: z.string() }) }, async ({ query }) => text(searchMascotAssets(engine, query, guest)))
server.registerTool('get_asset_metadata', { description: 'Approved public asset metadata, or missing.', inputSchema: z.object({ id: z.string() }) }, async ({ id }) => text(getAssetMetadata(engine, id, guest)))
server.registerTool('get_motion_guidelines', { description: 'Published motion facts, or missing.', inputSchema: z.object({}) }, async () => text(getMotionGuidelines(engine, guest)))
server.registerTool('get_marketing_plan', { description: 'Published marketing facts, or missing.', inputSchema: z.object({}) }, async () => text(getMarketingPlan(engine, guest)))
server.registerTool('get_business_plan', { description: 'Published business facts, or missing.', inputSchema: z.object({}) }, async () => text(getBusinessPlan(engine, guest)))

const transport = new StdioServerTransport()
await server.connect(transport)
