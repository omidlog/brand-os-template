import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { applyInit, cloudSyncAdvice, detectCloudSync, ensureApprovalSecret, fixHardLinks, KnowledgeError, runDoctor, writeStarterWorkspace } from '@brand-os/brand-core'
import { safeRead } from '../packages/brand-core/src/knowledge/workspace.js'
import { TEST_DATA_KEY } from './helpers/knowledge.js'
import { NODE, tsxArgs } from './helpers/tsx-node.js'

/**
 * Cloud-sync guard: a brand repository inside Google Drive, iCloud, Dropbox or OneDrive uploads brand/.private, and
 * Google Drive for Desktop hard-links files while it uploads. Detection, the hard-link message, brand:doctor's
 * cloud_sync check and --fix-links, all on temp folders that simulate the markers.
 */

function tempHome(): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-home-')))
}

function mkdir(...parts: string[]): string {
  const dir = path.join(...parts)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function brandAt(root: string): string {
  fs.mkdirSync(root, { recursive: true })
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Synced Brand', slug: 'synced-brand', industry: 'education', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private' })
  return root
}

test('detectCloudSync: provider folders are certain, markers and iCloud Desktop & Documents are likely, a plain folder is not synced', () => {
  const home = tempHome()
  const drive = mkdir(home, 'Library', 'CloudStorage', 'GoogleDrive-owner@example.com', 'My Drive', 'brand')
  assert.deepEqual(detectCloudSync(drive, { home }), { provider: 'google_drive', confidence: 'certain', evidence: '~/Library/CloudStorage/GoogleDrive-owner@example.com' })
  assert.equal(detectCloudSync(mkdir(home, 'Library', 'CloudStorage', 'OneDrive-Contoso', 'x'), { home })?.provider, 'onedrive')
  assert.equal(detectCloudSync(mkdir(home, 'Library', 'CloudStorage', 'Dropbox', 'x'), { home })?.provider, 'dropbox')
  assert.deepEqual(detectCloudSync(mkdir(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'brand'), { home }), { provider: 'icloud', confidence: 'certain', evidence: '~/Library/Mobile Documents' })

  // The real incident: ~/Documents mirrored by Google Drive for Desktop, which keeps .tmp.driveupload there.
  const code = mkdir(home, 'Code', 'brand')
  assert.equal(detectCloudSync(code, { home }), null, 'no marker, no detection')
  mkdir(home, 'Documents', '.tmp.driveupload')
  const repo = mkdir(home, 'Documents', 'GitHub', 'brand')
  assert.deepEqual(detectCloudSync(repo, { home }), { provider: 'google_drive', confidence: 'likely', evidence: '~/Documents/.tmp.driveupload' })
  assert.equal(detectCloudSync(code, { home }), null, 'a marker in a sibling folder is not an ancestor')

  const dropbox = mkdir(home, 'Dropbox', 'brand')
  fs.writeFileSync(path.join(home, 'Dropbox', '.dropbox'), '{}')
  assert.equal(detectCloudSync(dropbox, { home })?.provider, 'dropbox')
  assert.equal(detectCloudSync(mkdir(home, 'OneDrive - Contoso', 'brand'), { home })?.provider, 'onedrive')

  // iCloud Desktop & Documents: only with the CloudDocs Documents folder present, and only "likely".
  const home2 = tempHome()
  const desk = mkdir(home2, 'Desktop', 'brand')
  assert.equal(detectCloudSync(desk, { home: home2 }), null)
  mkdir(home2, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'Desktop')
  assert.deepEqual(detectCloudSync(desk, { home: home2 }), { provider: 'icloud', confidence: 'likely', evidence: '~/Library/Mobile Documents/com~apple~CloudDocs/Desktop' })
  assert.equal(detectCloudSync(mkdir(home2, 'Documents', 'brand'), { home: home2 }), null, 'Desktop synced does not mean Documents is')
})

test('advice names the provider, the reason and the exact fix, in en, fa and tr', () => {
  const found = { provider: 'google_drive' as const, confidence: 'likely' as const, evidence: '~/Documents/.tmp.driveupload' }
  const en = cloudSyncAdvice(found, '/Users/me/Documents/acme', 'en', true)
  assert.match(en, /appears to be synced by Google Drive \(files are hard-linked by its uploader\)/)
  assert.match(en, /`mv "\/Users\/me\/Documents\/acme" ~\/Code\/acme`/)
  assert.match(en, /npm run brand:doctor -- --fix-links/)
  assert.match(cloudSyncAdvice(found, '/x/acme', 'fa'), /Google Drive.*--fix-links/s)
  assert.match(cloudSyncAdvice(found, '/x/acme', 'tr'), /Google Drive tarafından eşitleniyor/)
  assert.match(cloudSyncAdvice(null, null, 'en'), /cloud drive/)
})

test('a hard-linked private file is refused with the reason and the fix', () => {
  const sync = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-sync-')))
  mkdir(sync, '.tmp.driveupload')
  const root = brandAt(path.join(sync, 'acme'))
  ensureApprovalSecret(root)
  const file = path.join(root, 'brand', '.private', 'approval-secret')
  fs.linkSync(file, path.join(sync, '.tmp.driveupload', '1234'))
  assert.throws(
    () => safeRead(file),
    (error: unknown) =>
      error instanceof KnowledgeError &&
      error.code === 'unsafe_path' &&
      /has more than one hard link/.test(error.message) &&
      /appears to be synced by Google Drive \(files are hard-linked by its uploader\)/.test(error.message) &&
      error.message.includes(`mv "${root}" ~/Code/acme`) &&
      /npm run brand:doctor -- --fix-links/.test(error.message),
  )
})

test('brand:doctor cloud_sync: fail with brand/.private inside a synced folder, warn before it exists, pass outside', () => {
  const home = tempHome()
  mkdir(home, 'Documents', '.tmp.driveupload')
  const root = brandAt(path.join(home, 'Documents', 'acme'))
  const check = (target: string) => runDoctor(target, { env: {}, nodeVersion: '22.0.0', platform: 'linux', home }).checks.find((item) => item.id === 'cloud_sync')!
  assert.equal(check(root).status, 'warn')
  ensureApprovalSecret(root)
  const failed = check(root)
  assert.equal(failed.status, 'fail')
  assert.match(failed.message, /Google Drive/)
  assert.match(failed.message, /mv "/)
  assert.match(failed.hint ?? '', /--rotate-approval-secret/)
  const outside = brandAt(path.join(home, 'Code', 'acme'))
  assert.equal(check(outside).status, 'pass')
  assert.match(runDoctor(root, { env: {}, nodeVersion: '22.0.0', platform: 'linux', home, lang: 'fa' }).checks.find((item) => item.id === 'cloud_sync')!.message, /همگام/)
})

test('--fix-links replaces hard-linked files with independent copies, keeps the mode, skips .git, and refuses inside a synced folder', () => {
  const home = tempHome()
  const root = brandAt(path.join(home, 'Code', 'acme'))
  ensureApprovalSecret(root)
  const outside = mkdir(home, 'staging')
  const secret = path.join(root, 'brand', '.private', 'approval-secret')
  const config = path.join(root, 'brand', 'brand.config.yaml')
  fs.linkSync(secret, path.join(outside, 'a'))
  fs.linkSync(config, path.join(outside, 'b'))
  mkdir(root, '.git', 'objects')
  fs.writeFileSync(path.join(root, '.git', 'objects', 'pack'), 'x')
  fs.linkSync(path.join(root, '.git', 'objects', 'pack'), path.join(outside, 'c'))
  const secretBytes = fs.readFileSync(secret)

  const dry = fixHardLinks(root, { home, dryRun: true })
  assert.deepEqual(dry.fixed.sort(), ['brand/.private/approval-secret', 'brand/brand.config.yaml'])
  assert.equal(fs.statSync(secret).nlink, 2, 'a dry run changes nothing')

  const result = fixHardLinks(root, { home })
  assert.equal(result.ok, true)
  assert.equal(result.hard_linked, 2)
  assert.deepEqual(result.fixed.sort(), ['brand/.private/approval-secret', 'brand/brand.config.yaml'])
  assert.equal(fs.statSync(secret).nlink, 1)
  assert.equal(fs.statSync(secret).mode & 0o777, 0o600, 'mode preserved')
  assert.deepEqual(fs.readFileSync(secret), secretBytes)
  assert.equal(fs.statSync(path.join(root, '.git', 'objects', 'pack')).nlink, 2, '.git is never touched')
  assert.equal(fs.readdirSync(path.dirname(secret)).filter((name) => name.endsWith('.tmp')).length, 0)

  mkdir(home, 'Documents', '.tmp.driveupload')
  const synced = brandAt(path.join(home, 'Documents', 'acme'))
  const refused = fixHardLinks(synced, { home })
  assert.equal(refused.ok, false)
  assert.match(refused.refused ?? '', /Google Drive/)
  assert.equal(refused.scanned, 0)
})

test('CLI: brand:doctor --fix-links runs for the owner and is refused under an agent token', () => {
  const root = brandAt(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-fixlinks-'))))
  ensureApprovalSecret(root)
  const other = path.join(path.dirname(root), `${path.basename(root)}-linked`)
  fs.linkSync(path.join(root, 'brand', '.private', 'approval-secret'), other)
  const run = (env: Record<string, string> = {}) => {
    const base: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) if (typeof value === 'string' && key !== 'BRAND_OS_AGENT_TOKEN') base[key] = value
    return spawnSync(NODE, tsxArgs('scripts/brand.ts', ['doctor', '--fix-links']), { cwd: root, env: { ...base, BRAND_OS_KEYCHAIN: 'off', BRAND_OS_DATA_KEY: TEST_DATA_KEY, ...env }, encoding: 'utf8', timeout: 60_000 })
  }
  assert.equal(run({ BRAND_OS_AGENT_TOKEN: 'bos_at_agent' }).status, 2)
  assert.equal(fs.statSync(other).nlink, 2)
  const ok = run()
  assert.equal(ok.status, 0, ok.stdout + ok.stderr)
  assert.match(ok.stdout, /Replaced 1 hard-linked file/)
  assert.match(ok.stdout, /--rotate-approval-secret/)
  assert.equal(fs.statSync(other).nlink, 1)
})
