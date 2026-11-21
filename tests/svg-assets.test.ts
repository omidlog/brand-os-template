import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { ensureApprovalSecret, writeStarterWorkspace } from '@brand-os/brand-core'

const repo = path.resolve(import.meta.dirname, '..')
const tsx = path.join(repo, 'node_modules/.bin/tsx')
const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'svg')
const sha = (data: Buffer | string): string => crypto.createHash('sha256').update(data).digest('hex')

interface Manifest {
  schema_version: number
  assets: Array<Record<string, unknown>>
}

function brandWithSvgs(files: Record<string, { fixture?: string; data?: string; status?: string }>): { root: string; proof: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-svg-assets-'))
  writeStarterWorkspace(root)
  const manifestFile = path.join(root, 'brand/assets/asset-manifest.yaml')
  const manifest = parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest
  for (const [id, spec] of Object.entries(files)) {
    const data = spec.data ?? fs.readFileSync(path.join(FIXTURES, spec.fixture!), 'utf8')
    const file = `brand/assets/mascot/${id.split('.').at(-1)}.svg`
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), data)
    manifest.assets.push({
      id,
      name: id,
      status: spec.status ?? 'draft',
      ...(spec.status === 'approved' ? { approved_by: 'owner (instruction in chat)' } : {}),
      owner: 'design',
      visibility: 'internal',
      license: 'Owned by the brand',
      path: file,
      present: true,
      checksum_sha256: sha(data),
      mime: 'image/svg+xml',
      tags: ['mascot'],
    })
  }
  fs.writeFileSync(manifestFile, stringify(manifest))
  return { root, proof: ensureApprovalSecret(root) }
}

function readManifest(root: string): Manifest {
  return parse(fs.readFileSync(path.join(root, 'brand/assets/asset-manifest.yaml'), 'utf8')) as Manifest
}

function cli(root: string, args: string[], env: Record<string, string> = {}, input = ''): ReturnType<typeof spawnSync> & { stdout: string; stderr: string } {
  const base: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN' && key !== 'BRAND_OS_APPROVAL_PROOF') base[key] = value
  }
  return spawnSync(tsx, [path.join(repo, 'scripts/brand.ts'), 'assets', ...args], { cwd: root, env: { ...base, ...env }, input, encoding: 'utf8', timeout: 120_000 }) as ReturnType<typeof spawnSync> & { stdout: string; stderr: string }
}

test('brand:assets check reports each SVG with its issues and the fix command, and fails when one is not publishable', () => {
  const { root } = brandWithSvgs({ 'asset.mascot.ai': { fixture: 'illustrator-export.svg' }, 'asset.mascot.fig': { fixture: 'figma-export.svg' } })
  const before = readManifest(root)
  const text = cli(root, ['check'])
  assert.equal(text.status, 1, text.stderr)
  assert.match(text.stdout, /fixable\s+asset\.mascot\.ai/)
  assert.match(text.stdout, /fixable style-element line 4/)
  assert.match(text.stdout, /fix: npm run brand:assets -- normalize asset\.mascot\.ai/)
  assert.match(text.stdout, /ok\s+asset\.mascot\.fig/)
  const json = cli(root, ['check', '--json', '--ids', 'asset.mascot.fig'])
  assert.equal(json.status, 0, json.stderr)
  const report = JSON.parse(json.stdout) as { ok: boolean; assets: Array<{ id: string; ok: boolean }> }
  assert.deepEqual(report.assets.map((asset) => [asset.id, asset.ok]), [['asset.mascot.fig', true]])
  assert.deepEqual(readManifest(root), before, 'check never writes')
})
