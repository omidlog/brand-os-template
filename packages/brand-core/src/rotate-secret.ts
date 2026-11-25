import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { AGENT_TOKEN_ENV } from './agent-tokens.js'
import { readKeychainProof, storeKeychainProof, type KeychainOptions } from './approval-proof.js'
import { CALENDAR_DIR, WEEK_APPROVAL_DOMAIN, type ContentWeekRecord } from './content-bridge/calendar-model.js'
import { scanWeeks, weekSealVerifies } from './content-bridge/calendar-store.js'
import { openWorkspace } from './knowledge/workspace.js'
import { approvalProofMatches, approvalSecretPath } from './private-store.js'
import { approvalsFile, readApprovals, sealFor } from './social-kit/store.js'
import { approvalSeal, type StrategyRecord } from './strategy/model.js'
import { scanRecords, STRATEGY_RECORDS_DIR, strategySealVerifies } from './strategy/store.js'

/**
 * `brand:doctor --rotate-approval-secret` (owner only). The approval proof the owner types or stores IS the content of
 * brand/.private/approval-secret. Three records are sealed with it (HMAC-SHA256 over an approval digest):
 *   - strategy revision approvals   brand/.private/strategy/records/<id>/record.json
 *   - content calendar week approvals brand/.private/content/calendar/<week>/record.json
 *   - social style kit approvals    brand/.private/social/approvals.json
 * Everything else that takes the proof only compares it (facts, changes, evidence, assets, tokens, creative
 * preferences, aspect proposals, agent-token management) and stores no keyed value. Agent tokens are stored as a
 * plain SHA-256 of the token, not keyed by the secret, so they stay valid after rotation. Restricted answers are
 * encrypted with BRAND_OS_DATA_KEY, not with the approval secret.
 *
 * Rotation verifies every existing seal with the current secret, generates a new secret, re-seals exactly the seals
 * that verified (a seal that did not verify stays invalid and is listed), stages every changed file next to its
 * target, then swaps them in with the secret last. If any step fails, files already swapped are restored from their
 * staged backups and nothing changes. Do not run approvals while rotating.
 */

export type SealKind = 'strategy' | 'week' | 'social_style'

export interface SealRef {
  kind: SealKind
  id: string
  revision: number | null
}

export interface RotationResult {
  ok: boolean
  outcome: 'rotated' | 'refused' | 'failed'
  message: string
  resealed: SealRef[]
  not_resealed: SealRef[]
  keychain: 'updated' | 'not_stored' | 'failed' | 'not_checked'
  /** The new proof, set only when it is not in the Keychain, so the caller can show it once. */
  new_proof: string | null
  files_changed: number
}

export interface RotationOptions {
  /** Keychain access for the brand slug. Omit to leave the Keychain alone. */
  keychain?: KeychainOptions & { slug: string }
  /** Test hook: called before each swap; throwing from it simulates a failure mid-way. */
  beforeSwap?: (index: number, file: string) => void
  /** Test hook: the new secret instead of a random one. */
  newSecret?: string
}

interface Stage {
  file: string
  contents: string
}

export const ROTATION_LOG = 'brand/.private/approval-secret-rotations.jsonl'

function readSecret(root: string): string | null {
  try {
    const file = approvalSecretPath(root)
    if (!fs.lstatSync(file).isFile()) return null
    return fs.readFileSync(file, 'utf8').trim() || null
  } catch {
    return null
  }
}

const json = (doc: unknown): string => `${JSON.stringify(doc, null, 2)}\n`

function writeStaged(file: string, contents: string): void {
  const fd = fs.openSync(file, 'wx', 0o600)
  try {
    fs.writeFileSync(fd, contents)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.chmodSync(file, 0o600)
}

export function rotateApprovalSecret(root: string, proof: string | undefined, options: RotationOptions = {}): RotationResult {
  const base: RotationResult = { ok: false, outcome: 'refused', message: '', resealed: [], not_resealed: [], keychain: 'not_checked', new_proof: null, files_changed: 0 }
  if (process.env[AGENT_TOKEN_ENV]) return { ...base, message: `Rotating the approval secret is an owner action. Refusing while ${AGENT_TOKEN_ENV} is set. Nothing was changed.` }
  const old = readSecret(root)
  if (!old) return { ...base, message: 'brand/.private/approval-secret is missing or not a regular file. Create one with npm run brand:doctor -- --create-approval-secret. Nothing was changed.' }
  if (!approvalProofMatches(root, proof)) return { ...base, message: 'Approval proof rejected: rotation needs the CURRENT proof. Nothing was changed.' }

  const fresh = options.newSecret ?? crypto.randomBytes(24).toString('hex')
  if (fresh === old) return { ...base, message: 'The new secret equals the old one. Nothing was changed.' }
  const ws = openWorkspace(root)
  const stages: Stage[] = []
  const resealed: SealRef[] = []
  const notResealed: SealRef[] = []

  for (const record of scanRecords(ws)) {
    const copy = JSON.parse(JSON.stringify(record)) as StrategyRecord
    let changed = false
    for (const entry of copy.revisions) {
      if (!entry.approval) continue
      const ref: SealRef = { kind: 'strategy', id: record.strategy_id, revision: entry.revision }
      if (!strategySealVerifies(record, record.revisions.find((item) => item.revision === entry.revision)!, old)) {
        notResealed.push(ref)
        continue
      }
      entry.approval.seal = approvalSeal(fresh, entry.approval.digest)
      changed = true
      resealed.push(ref)
    }
    if (changed) stages.push({ file: path.join(root, ...STRATEGY_RECORDS_DIR.split('/'), record.strategy_id, 'record.json'), contents: json(copy) })
  }

  for (const record of scanWeeks(ws)) {
    const copy = JSON.parse(JSON.stringify(record)) as ContentWeekRecord
    let changed = false
    for (const entry of copy.revisions) {
      if (!entry.approval) continue
      const ref: SealRef = { kind: 'week', id: record.week_id, revision: entry.revision }
      if (!weekSealVerifies(record, record.revisions.find((item) => item.revision === entry.revision)!, old)) {
        notResealed.push(ref)
        continue
      }
      entry.approval.seal = approvalSeal(fresh, entry.approval.digest, WEEK_APPROVAL_DOMAIN)
      changed = true
      resealed.push(ref)
    }
    if (changed) stages.push({ file: path.join(root, ...CALENDAR_DIR.split('/'), record.week_id, 'record.json'), contents: json(copy) })
  }

  const social = readApprovals(root, ws.brandSlug)
  let socialChanged = false
  for (const [styleId, record] of Object.entries(social.approvals)) {
    const ref: SealRef = { kind: 'social_style', id: styleId, revision: null }
    if (!record || typeof record.seal !== 'string' || record.seal !== sealFor(old, ws.brandSlug, styleId, record)) {
      notResealed.push(ref)
      continue
    }
    record.seal = sealFor(fresh, ws.brandSlug, styleId, record)
    socialChanged = true
    resealed.push(ref)
  }
  if (socialChanged) stages.push({ file: approvalsFile(root), contents: json(social) })
  // The secret is swapped last: until then every record still verifies under the old secret.
  stages.push({ file: approvalSecretPath(root), contents: `${fresh}\n` })

  const keychainHad = options.keychain ? readKeychainProof(options.keychain.slug, { ...options.keychain, env: {} }) === old : false

  const tag = `${process.pid}.${crypto.randomBytes(4).toString('hex')}`
  const staged: Array<{ file: string; tmp: string; bak: string }> = []
  const cleanup = () => {
    for (const item of staged) {
      fs.rmSync(item.tmp, { force: true })
      fs.rmSync(item.bak, { force: true })
    }
  }
  try {
    for (const stage of stages) {
      const item = { file: stage.file, tmp: `${stage.file}.rotate-${tag}.tmp`, bak: `${stage.file}.rotate-${tag}.bak` }
      staged.push(item)
      writeStaged(item.tmp, stage.contents)
      writeStaged(item.bak, fs.readFileSync(stage.file, 'utf8'))
    }
  } catch (error) {
    cleanup()
    return { ...base, outcome: 'failed', message: `Staging failed (${(error as Error).message}). Nothing was changed.`, not_resealed: notResealed }
  }
  const swapped: typeof staged = []
  try {
    staged.forEach((item, index) => {
      options.beforeSwap?.(index, item.file)
      fs.renameSync(item.tmp, item.file)
      swapped.push(item)
    })
  } catch (error) {
    // Put back every file already swapped, newest first, from its staged copy of the old bytes.
    for (const item of swapped.reverse()) {
      try {
        fs.renameSync(item.bak, item.file)
      } catch {
        // The backup stays on disk under its .bak name so the owner can restore it by hand.
      }
    }
    cleanup()
    return { ...base, outcome: 'failed', message: `Rotation failed while swapping files (${(error as Error).message}). The previous files were restored; the old proof still works.`, not_resealed: notResealed }
  }
  cleanup()

  let keychain: RotationResult['keychain'] = options.keychain ? 'not_stored' : 'not_checked'
  if (options.keychain && keychainHad) keychain = storeKeychainProof(root, options.keychain.slug, options.keychain).ok ? 'updated' : 'failed'
  const at = new Date().toISOString()
  try {
    const log = path.join(root, ...ROTATION_LOG.split('/'))
    fs.appendFileSync(log, `${JSON.stringify({ at, event: 'approval_secret_rotated', actor: 'owner', resealed: resealed.length, not_resealed: notResealed.map((ref) => `${ref.kind}:${ref.id}${ref.revision ? `@${ref.revision}` : ''}`), keychain })}\n`, { mode: 0o600 })
  } catch {
    // The audit line is best effort; the rotation itself is complete.
  }
  return {
    ok: true,
    outcome: 'rotated',
    message: `Rotated the approval secret. Re-sealed ${resealed.length} approval(s)${notResealed.length ? `; ${notResealed.length} did not verify before rotation and stay invalid` : ''}. The old proof no longer works.`,
    resealed,
    not_resealed: notResealed,
    keychain,
    new_proof: keychain === 'updated' ? null : fresh,
    files_changed: stages.length,
  }
}
