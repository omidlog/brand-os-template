import readline from 'node:readline'
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
const tools = [
  { name: 'search_brand_docs', description: 'Search question and document ids. Approved values only unless include_unapproved is true. Restricted values are withheld.' },
  { name: 'get_brand_tokens', description: 'Return token status. EXAMPLE values are withheld unless include_unapproved is true.' },
  { name: 'get_mascot_guidelines', description: 'Return mascot module status without inventing artwork.' },
  { name: 'list_mascot_assets', description: 'List mascot catalog rows. Approved rows only by default.' },
  { name: 'get_design_component', description: 'Look up a starter component id.' },
  { name: 'get_social_template', description: 'Look up a social template. Missing templates stay missing.' },
  { name: 'get_brand_status', description: 'Coverage, approval, and the next question ids. No answer values.' },
]

function callTool(name: string, args: Record<string, unknown>) {
  const include = args.include_unapproved === true
  if (name === 'search_brand_docs') return searchBrandDocs(engine, String(args.query ?? ''), include)
  if (name === 'get_brand_tokens') return getBrandTokens(include)
  if (name === 'get_mascot_guidelines') return getMascotGuidelines(engine, include)
  if (name === 'list_mascot_assets') return listMascotAssets(include)
  if (name === 'get_design_component') return getDesignComponent(String(args.id ?? ''))
  if (name === 'get_social_template') return getSocialTemplate(String(args.channel ?? 'unspecified'))
  if (name === 'get_brand_status') return getBrandStatus(engine)
  throw new Error(`Unknown tool ${name}`)
}

function respond(message: unknown): void {
  const body = JSON.stringify(message)
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
}

let buffer = ''
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  buffer += `${line}\n`
  const match = buffer.match(/Content-Length:\s*(\d+)\s*\n\n([\s\S]*)$/)
  if (!match) return
  const length = Number(match[1])
  const body = match[2] ?? ''
  if (Buffer.byteLength(body) < length) return
  const jsonText = body.slice(0, length)
  buffer = body.slice(length)
  const request = JSON.parse(jsonText) as { id?: number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } }
  if (request.method === 'initialize') {
    respond({ jsonrpc: '2.0', id: request.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'brand-os', version: '0.1.0' } } })
  } else if (request.method === 'tools/list') {
    respond({ jsonrpc: '2.0', id: request.id, result: { tools } })
  } else if (request.method === 'tools/call') {
    try {
      const result = callTool(request.params?.name ?? '', request.params?.arguments ?? {})
      respond({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } })
    } catch (error) {
      respond({ jsonrpc: '2.0', id: request.id, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } })
    }
  } else {
    respond({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } })
  }
})
