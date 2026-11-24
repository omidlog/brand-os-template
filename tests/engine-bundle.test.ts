import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { brandPackageScripts, ENGINE_COMMANDS } from '../scripts/engine/commands.js'

/**
 * Engine + data, part B: the bundled engine runs a data-only brand repository with no npm install. The engine is built
 * once into a temp folder, copied to `.brand-os/engine/`, and every main command runs through `node brand-os.mjs`.
 * SYNTHETIC DEMO data only.
 */
const repo = path.resolve(import.meta.dirname, '..')

test('every brand command the template offers today has the same npm script in a data-only brand', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
  const brandScripts = Object.keys(pkg.scripts).filter((name) => name.startsWith('brand:') || name === 'mcp:serve' || name === 'validate')
  const offered = brandPackageScripts()
  for (const name of brandScripts) assert.ok(offered[name], `${name} has an engine script`)
  for (const [name, command] of Object.entries(offered)) assert.match(command, /^node \.brand-os\/engine\/brand-os\.mjs [a-z:-]+$/, name)
  assert.ok(offered.check, 'npm run check is the brand CI gate')
  assert.equal(new Set(Object.values(ENGINE_COMMANDS).map((spec) => spec.npm).filter(Boolean)).size, Object.keys(offered).length, 'no two commands share a script')
})

test('the bundled engine runs a data-only brand end to end: scaffold, check, interview, approve, document, MCP', { timeout: 600_000 }, async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-engine-'))
  try {
    const engineDir = path.join(work, 'engine')
    const built = spawnSync(process.execPath, ['--import', 'tsx', path.join(repo, 'scripts/build-engine.ts'), '--outdir', engineDir], { cwd: repo, encoding: 'utf8' })
    assert.equal(built.status, 0, built.stderr)
    for (const file of ['brand-os.mjs', 'VERSION', 'assets/schemas/question.schema.json', 'assets/tokens/color.tokens.json', 'agents/AGENTS.md', 'docs-internal/STUDIO.md']) {
      assert.ok(fs.existsSync(path.join(engineDir, file)), `${file} in the engine`)
    }
    const brand = path.join(work, 'brand-repo')
    fs.mkdirSync(path.join(brand, '.brand-os'), { recursive: true })
    fs.cpSync(engineDir, path.join(brand, '.brand-os', 'engine'), { recursive: true })
    const env = { ...process.env, BRAND_OS_DATA_KEY: crypto.randomBytes(32).toString('base64'), BRAND_OS_KEYCHAIN: 'off', BRAND_OS_ENGINE_ASSETS: '' }
    delete (env as Record<string, string | undefined>).BRAND_OS_ENGINE_ASSETS
    const run = (args: string[], input?: string) => spawnSync(process.execPath, ['.brand-os/engine/brand-os.mjs', ...args], { cwd: brand, env, encoding: 'utf8', input })

    const created = run(['scaffold', '--new', '--name', 'Demo Person', '--slug', 'demo-person', '--profile', 'personal-brand', '--facets', 'consultant-expert'])
    assert.equal(created.status, 0, created.stderr)
    for (const file of ['package.json', '.github/workflows/brand.yml', 'AGENTS.md', 'CLAUDE.md', 'brand/brand.config.yaml']) assert.ok(fs.existsSync(path.join(brand, file)), file)
    for (const legacy of ['brand/interview/question-bank', 'brand/interview/field-registry.yaml', 'brand/interview/profiles', 'brand/content']) {
      assert.equal(fs.existsSync(path.join(brand, legacy)), false, `${legacy} is an engine definition, not copied`)
    }
    assert.match(fs.readFileSync(path.join(brand, 'AGENTS.md'), 'utf8'), /\.brand-os\/engine\/docs-internal\//)
    assert.equal(fs.existsSync(path.join(brand, 'node_modules')), false, 'no npm install')

    const check = run(['check'])
    assert.equal(check.status, 0, check.stderr)
    assert.match(check.stdout, /Brand check passed/)

    const next = run(['next', '--json'])
    assert.equal(next.status, 0, next.stderr)
    assert.match(next.stdout, /personal\.identity\.public_name/)
    const answered = run(['interview', '--question', 'personal.identity.public_name', '--answer', 'Demo Person', '--json'])
    assert.match(answered.stdout, /"kind": "recorded"/)
    assert.equal(run(['doctor', '--create-approval-secret']).status, 0)
    const proof = fs.readFileSync(path.join(brand, 'brand/.private/approval-secret'), 'utf8')
    const approved = run(['approve', '--all-pending'], proof)
    assert.equal(approved.status, 0, approved.stderr)
    assert.match(approved.stdout, /1 approved/)
    const doc = run(['document', '--type', 'professional-bio'])
    assert.equal(doc.status, 0, doc.stderr)
    assert.match(doc.stdout, /Demo Person/)

    // MCP answers an initialize request over stdio.
    const reply = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['.brand-os/engine/brand-os.mjs', 'mcp'], { cwd: brand, env })
      let out = ''
      const timer = setTimeout(() => { child.kill(); reject(new Error(`no MCP reply: ${out}`)) }, 30_000)
      child.stdout.on('data', (chunk: Buffer) => {
        out += String(chunk)
        if (out.includes('\n')) { clearTimeout(timer); child.kill(); resolve(out) }
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1' } } })}\n`)
    })
    assert.match(reply, /"serverInfo":\{"name":"brand-os"/)

    // Scaffold is idempotent.
    const again = run(['scaffold'])
    assert.match(again.stdout, /current/)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
})
