import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { ensureApprovalSecret, issueAgentToken } from '@brand-os/brand-core'
import { brandDir, TEST_DATA_KEY, useTestKey } from './helpers/knowledge.js'

/**
 * brand:social end to end through the real CLI, brand:query and the stdio MCP server: init → show → review →
 * approve (proof from the environment only; refused under an agent token and on argv) → preview; agents read only
 * approved styles.
 */
useTestKey()
const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')

function env(extra: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') out[key] = value
  out.BRAND_OS_DATA_KEY = TEST_DATA_KEY
  out.BRAND_OS_KEYCHAIN = 'off'
  for (const [key, value] of Object.entries(extra)) if (value !== undefined) out[key] = value
  return out
}

function social(root: string, args: string[], extra: Record<string, string | undefined> = {}) {
  const run = spawnSync(tsx, [path.join(repo, 'scripts/social.ts'), ...args], { cwd: root, encoding: 'utf8', env: env(extra), input: '' })
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(run.stdout) as Record<string, unknown>
  } catch {
    json = null
  }
  return { ...run, json }
}

function query(root: string, token: string, args: string[]) {
  const run = spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'query', '--tool', 'social_style_kit', ...args], { cwd: root, encoding: 'utf8', env: env({ BRAND_OS_AGENT_TOKEN: token }) })
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout) as { status: string; data: { surfaces: Array<{ surface: string; styles: Array<{ style_id: string; name: string }> }>; withheld: Record<string, number> } | null }
}

test('brand:social: init, show, review, approve with the env proof only, preview; agents read approved styles', { timeout: 300_000 }, async () => {
  const root = brandDir({ slug: 'kit-cli' })
  const proof = ensureApprovalSecret(root)

  const init = social(root, ['kit', 'init', '--surfaces', 'post,reel', '--json'])
  assert.equal(init.status, 0, init.stderr)
  assert.equal((init.json?.written as string[]).length, 8)
  assert.equal(social(root, ['kit', 'init', '--json']).json?.ok, false, 'an existing kit is not overwritten')

  const shown = social(root, ['kit', 'show', '--surface', 'post', '--lang', 'fa'])
  assert.equal(shown.status, 0, shown.stderr)
  assert.match(shown.stdout, /جملهٔ پررنگ/)
  assert.match(shown.stdout, /پیش‌نویس/)

  const review = social(root, ['kit', 'review', '--style', 'post.photo-headline', '--json'])
  assert.equal(review.status, 0, review.stderr)
  const sha = review.json?.expect_sha as string
  assert.match(sha, /^[0-9a-f]{64}$/)
  assert.equal(review.json?.approve_with, `npm run brand:social -- kit approve --style post.photo-headline --expect-sha ${sha}`)

  // Refusals: no proof, an agent token, and a proof on argv. Nothing is approved by any of them.
  assert.equal(social(root, ['kit', 'approve', '--style', 'post.photo-headline', '--expect-sha', sha, '--json']).json?.ok, false)
  const asAgent = social(root, ['kit', 'approve', '--style', 'post.photo-headline', '--expect-sha', sha, '--json'], { BRAND_OS_AGENT_TOKEN: 'agt_fake.x', BRAND_OS_APPROVAL_PROOF: proof })
  assert.equal((asAgent.json?.error as { code: string }).code, 'refused')
  const argv = social(root, ['kit', 'approve', '--style', 'post.photo-headline', '--expect-sha', sha, '--proof', proof])
  assert.notEqual(argv.status, 0)
  assert.ok(!argv.stdout.includes(proof) && !argv.stderr.includes(proof), 'the proof is never echoed')
  assert.equal(social(root, ['kit', 'show', '--json'], { BRAND_OS_AGENT_TOKEN: 'agt_fake.x' }).json?.ok, false, 'drafts are the owner’s view only')

  const approved = social(root, ['kit', 'approve', '--style', 'post.photo-headline', '--expect-sha', sha, '--json'], { BRAND_OS_APPROVAL_PROOF: proof })
  assert.equal(approved.status, 0, approved.stdout + approved.stderr)
  assert.deepEqual((approved.json?.approved as Array<{ style_id: string }>).map((item) => item.style_id), ['post.photo-headline'])
  const rejected = social(root, ['kit', 'reject', '--style', 'post.quote-testimonial', '--json'])
  assert.deepEqual(rejected.json?.rejected, ['post.quote-testimonial'])

  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-preview-'))
  const preview = social(root, ['kit', 'preview', '--out', out, '--json'])
  assert.equal(preview.status, 0, preview.stderr)
  for (const file of ['index.html', 'post/index.html', 'reel/index.html', 'post/post.bold-statement.svg', 'reel/reel.before-after.svg']) assert.ok(fs.existsSync(path.join(out, file)), file)
  const svg = fs.readFileSync(path.join(out, 'reel/reel.talking-head-captions.svg'), 'utf8')
  const again = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-preview-'))
  social(root, ['kit', 'preview', '--out', again, '--json'])
  assert.equal(fs.readFileSync(path.join(again, 'reel/reel.talking-head-captions.svg'), 'utf8'), svg, 'deterministic')
  assert.match(svg, /data-safe-zone="right_actions"/)

  // Share the approval state for Studio: a public summary, no seals; refused under an agent token.
  assert.equal(social(root, ['kit', 'share', '--json'], { BRAND_OS_AGENT_TOKEN: 'agt_fake.x' }).json?.ok, false)
  const kitShare = social(root, ['kit', 'share', '--json'])
  assert.equal(kitShare.status, 0, kitShare.stderr)
  const summary = fs.readFileSync(path.join(root, 'brand/social/shared/approvals.json'), 'utf8')
  assert.match(summary, /"style_id": "post.photo-headline"/)
  assert.doesNotMatch(summary, /seal|event_id/)

  // Agents: brand:query and the stdio MCP server serve approved styles only.
  const design = issueAgentToken(root, { brandId: 'kit-cli', profile: 'design', label: 'designer' }).token
  const finance = issueAgentToken(root, { brandId: 'kit-cli', profile: 'finance', label: 'finance' }).token
  const read = query(root, design, ['--lang', 'tr'])
  assert.equal(read.status, 'ok')
  assert.deepEqual(read.data!.surfaces.map((surface) => [surface.surface, surface.styles.map((style) => style.style_id)]), [['post', ['post.photo-headline']]])
  assert.equal(read.data!.surfaces[0]!.styles[0]!.name, 'Fotoğraf + başlık')
  assert.deepEqual(read.data!.withheld, { draft: 6, rejected: 1, invalid_approval: 0 })
  assert.equal(query(root, finance, []).status, 'denied')

  const connect = async (token: string) => {
    const client = new Client({ name: 'social-kit-test', version: '0.0.1' })
    await client.connect(new StdioClientTransport({ command: tsx, args: [path.join(repo, 'scripts/mcp.ts')], cwd: root, env: env({ BRAND_OS_AGENT_TOKEN: token }) as Record<string, string>, stderr: 'pipe' }))
    return client
  }
  const client = await connect(design)
  try {
    const tools = await client.listTools()
    const tool = tools.tools.find((item) => item.name === 'social_style_kit')
    assert.ok(tool, 'social_style_kit is listed')
    assert.deepEqual(Object.keys((tool!.inputSchema as { properties: Record<string, unknown> }).properties).sort(), ['lang', 'surface'])
    const reply = (await client.callTool({ name: 'social_style_kit', arguments: { surface: 'post' } })) as { content: Array<{ text: string }> }
    const data = JSON.parse(reply.content[0]!.text) as { status: string; authorizes: unknown[]; data: { surfaces: Array<{ styles: unknown[] }> } }
    assert.equal(data.status, 'ok')
    assert.deepEqual(data.authorizes, [])
    assert.equal(data.data.surfaces[0]!.styles.length, 1)
  } finally {
    await client.close()
  }
})
