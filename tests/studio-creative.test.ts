import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { addVariant, createProject, recordFeedback } from '@brand-os/brand-core/creative'
import { studioPathAllowed } from '../apps/studio/src/github/tar.js'
import { pilitoBrand } from './helpers/creative.js'
import { useTestKey } from './helpers/knowledge.js'

/**
 * Creative learning records and their feedback notes are local only: Studio's archive filter never
 * lets them through. Split from tests/creative-security.test.ts because it needs apps/studio.
 */
useTestKey()

test('local only: Studio excludes creative records and feedback notes', () => {
  const { ws, root } = pilitoBrand('pilito')
  createProject(ws, { project_id: 'pilito-reel-1', title: 'Intro reels', surface: 'reel', series: 'onboarding', language: 'fa' })
  addVariant(ws, { project_id: 'pilito-reel-1', variant_id: 'C', asset: 'missing' })
  const c = recordFeedback(ws, { project_id: 'pilito-reel-1', variant_id: 'C', text: 'CREATIVE-FEEDBACK-CANARY', verdict: 'like', keep: ['camera_angle'] })
  for (const rel of ['brand/.private/creative/projects/pilito-reel-1.json', c.note.path]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel)
    assert.equal(studioPathAllowed(rel), false, `Studio excludes ${rel}`)
  }
})
