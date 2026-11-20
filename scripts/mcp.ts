import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import {
  getBrandStatus,
  getBrandTokens,
  getDesignComponent,
  getMascotGuidelines,
  getSocialTemplate,
  InterviewEngine,
  listMascotAssets,
  searchBrandDocs,
} from '@brand-os/brand-core'

const engine = new InterviewEngine(process.cwd())
const server = new McpServer({ name: 'brand-os', version: '0.1.0' })

function text(result: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
}

server.registerTool(
  'search_brand_docs',
  {
    description: 'Search approved public facts. Set include_unapproved to also search draft guidance. Restricted values are never returned.',
    inputSchema: z.object({ query: z.string(), include_unapproved: z.boolean().optional() }),
  },
  async ({ query, include_unapproved }) => text(searchBrandDocs(engine, query, include_unapproved === true)),
)
server.registerTool(
  'get_brand_tokens',
  {
    description: 'Return approved design tokens. Draft EXAMPLE values require include_unapproved.',
    inputSchema: z.object({ include_unapproved: z.boolean().optional() }),
  },
  async ({ include_unapproved }) => text(getBrandTokens(engine, include_unapproved === true)),
)
server.registerTool(
  'get_mascot_guidelines',
  {
    description: 'Return approved mascot rules for this brand. Does not invent artwork.',
    inputSchema: z.object({ include_unapproved: z.boolean().optional() }),
  },
  async ({ include_unapproved }) => text(getMascotGuidelines(engine, include_unapproved === true)),
)
server.registerTool(
  'list_mascot_assets',
  {
    description: 'List mascot catalog and manifest rows from YAML. Approved rows only unless include_unapproved is set.',
    inputSchema: z.object({ include_unapproved: z.boolean().optional() }),
  },
  async ({ include_unapproved }) => text(listMascotAssets(engine, include_unapproved === true)),
)
server.registerTool(
  'get_design_component',
  {
    description: 'Read one component from components.yaml.',
    inputSchema: z.object({ id: z.string() }),
  },
  async ({ id }) => text(getDesignComponent(engine, id)),
)
server.registerTool(
  'get_social_template',
  {
    description: 'Return an approved social template. Draft briefs are not returned as approved content.',
    inputSchema: z.object({ channel: z.string() }),
  },
  async ({ channel }) => text(getSocialTemplate(engine, channel)),
)
server.registerTool(
  'get_brand_status',
  {
    description: 'Coverage, approval, module flags, and next question ids. No answer values.',
    inputSchema: z.object({}),
  },
  async () => text(getBrandStatus(engine)),
)

const transport = new StdioServerTransport()
await server.connect(transport)
