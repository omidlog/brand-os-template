import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { writeAtomic } from '@brand-os/brand-core'
import type { GitHubClient } from '../apps/studio/src/github/client.js'
import type { Registry } from '../apps/studio/src/registry.js'
import { SyncService } from '../apps/studio/src/sync.js'
import { removeTempDir, tempDir } from './helpers/cleanup.js'

function service(t: { after: (fn: () => void) => void }): { sync: SyncService; stateFile: string } {
  const dataDir = tempDir('studio-sync-cache-')
  t.after(() => removeTempDir(dataDir))
  const sync = new SyncService({ registry: {} as Registry, github: {} as GitHubClient, dataDir, ttlMs: 60_000 })
  const stateFile = path.join(dataDir, 'cache', 'acme', 'state.json')
  fs.mkdirSync(path.dirname(stateFile), { recursive: true })
  return { sync, stateFile }
}

function state(sha: string) {
  return { schema_version: 1, status: { state: 'ok', sha, committed_at: null, synced_at: null, checked_at: null, attempted_at: null, repo_private: true, last_error: null }, projection: null, history: null, previews: {} }
}

test('sync.get reuses the parsed state.json until the file is replaced, removed or broken', (t) => {
  const { sync, stateFile } = service(t)
  assert.equal(sync.get('acme').status.state, 'never')

  writeAtomic(stateFile, JSON.stringify(state('a'.repeat(40))), { mode: 0o600 })
  const first = sync.get('acme')
  assert.equal(first.status.sha, 'a'.repeat(40))

  // Not read again while unchanged: a read spy sees no second read of state.json.
  const reads: string[] = []
  const original = fs.readFileSync
  t.mock.method(fs, 'readFileSync', (...args: Parameters<typeof fs.readFileSync>) => {
    reads.push(String(args[0]))
    return original(...args)
  })
  for (let i = 0; i < 5; i += 1) assert.equal(sync.get('acme').status.sha, 'a'.repeat(40))
  assert.deepEqual(reads.filter((file) => file === stateFile), [])

  // A caller that changes the returned status cannot change what the next caller sees.
  first.status.state = 'error'
  assert.equal(sync.get('acme').status.state, 'ok')

  // Replaced the way sync writes it (atomic rename): the new content is seen at once.
  writeAtomic(stateFile, JSON.stringify(state('b'.repeat(40))), { mode: 0o600 })
  assert.equal(sync.get('acme').status.sha, 'b'.repeat(40))
  assert.equal(reads.filter((file) => file === stateFile).length, 1)

  // Removed: back to "never".
  fs.rmSync(stateFile)
  assert.equal(sync.get('acme').status.state, 'never')

  // Broken JSON is treated as no cache, and a good file afterwards is read again.
  fs.writeFileSync(stateFile, '{ not json')
  assert.equal(sync.get('acme').status.state, 'never')
  writeAtomic(stateFile, JSON.stringify(state('c'.repeat(40))), { mode: 0o600 })
  assert.equal(sync.get('acme').status.sha, 'c'.repeat(40))
})
