import fs from 'node:fs'
import path from 'node:path'
import YAML, { parseDocument } from 'yaml'
import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import { safetyBlocksSharing, safetyReport } from '../knowledge/safety.js'
import { safeRead, withLock, writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { approvalProofMatches, approvalSecretPath } from '../private-store.js'
import { approvalSeal, newApprovalEventId } from '../strategy/model.js'
import {
  approvalEventDigest,
  batchDigest,
  MAX_STYLES_PER_SURFACE,
  parseKit,
  SOCIAL_APPROVAL_DOMAIN,
  SOCIAL_APPROVALS_FILE,
  SOCIAL_KIT_FILE,
  SocialKitError,
  styleDigest,
  SURFACES,
  type EffectiveStatus,
  type SocialKit,
  type SocialStyle,
  type SocialSurface,
} from './model.js'
import { buildStarterKit } from './starter.js'

/**
 * The kit file (committed design guidance) and the owner's sealed approvals (private, like creative preferences and
 * strategy approvals: brand/.private, 0600, gitignored, in brand:backup). Writes refuse under an agent token; approval
 * needs the owner's approval proof. Reads never follow symlinks.
 */

const MAX_KIT_BYTES = 2 * 1024 * 1024

export interface ApprovalRecord {
  event_id: string
  approved_at: string
  digest: string
  seal: string
  actor: 'owner'
}

export interface ApprovalsDoc {
  schema_version: 1
  kind: 'social_style_approvals'
  brand_slug: string
  approvals: Record<string, ApprovalRecord>
}

export type InvalidReason = 'edited_after_approval' | 'no_seal' | 'seal_mismatch'

export interface StyleState {
  style: SocialStyle
  status: EffectiveStatus
  /** The current content digest: what `--expect-sha` must name to approve it. */
  digest: string
  invalid_reason: InvalidReason | null
}

export type KitRead = { state: 'missing' } | { state: 'invalid'; error: string } | { state: 'ok'; kit: SocialKit }

export function kitFile(root: string): string {
  return path.join(root, ...SOCIAL_KIT_FILE.split('/'))
}

export function approvalsFile(root: string): string {
  return path.join(root, ...SOCIAL_APPROVALS_FILE.split('/'))
}

/** An agent holding a token is not the owner. No kit write runs for it. */
export function assertOwnerProcess(): void {
  if (process.env[AGENT_TOKEN_ENV]) throw new SocialKitError('refused', `The social style kit is written and approved by the owner. Refusing while ${AGENT_TOKEN_ENV} is set. Nothing was changed.`)
}

function readText(file: string): string | null {
  const raw = safeRead(file, MAX_KIT_BYTES)
  return raw ? raw.toString('utf8') : null
}

/** Reads and checks brand/social/style-kit.yaml. A missing file is `missing`, never an error. */
export function readKit(root: string, brandSlug?: string): KitRead {
  let text: string | null
  try {
    text = readText(kitFile(root))
  } catch {
    return { state: 'invalid', error: `${SOCIAL_KIT_FILE} is not a regular file (symlinks are not followed).` }
  }
  if (text === null) return { state: 'missing' }
  let doc: unknown
  try {
    doc = YAML.parse(text)
  } catch (error) {
    return { state: 'invalid', error: `${SOCIAL_KIT_FILE} is not valid YAML: ${(error as Error).message.split('\n')[0]}` }
  }
  try {
    return { state: 'ok', kit: parseKit(doc, brandSlug) }
  } catch (error) {
    if (error instanceof SocialKitError) return { state: 'invalid', error: `${SOCIAL_KIT_FILE} ${error.message}` }
    throw error
  }
}

/** Text in the kit that looks like a credential or private data. The kit is committed: it must never hold one. */
export function kitSafetyProblems(kit: SocialKit): string[] {
  const texts: string[] = [...(kit.family.notes ?? [])]
  for (const style of kit.styles) {
    texts.push(...Object.values(style.name), ...Object.values(style.intent.use_when), ...Object.values(style.variation), ...style.do, ...style.dont)
    for (const layer of style.layers) texts.push(...(layer.rules ?? []))
  }
  const problems = new Set<string>()
  for (const item of texts) for (const finding of safetyBlocksSharing(safetyReport(item))) problems.add(finding)
  return [...problems]
}

function readSecret(root: string): string | null {
  const file = approvalSecretPath(root)
  try {
    if (!fs.lstatSync(file).isFile()) return null
    return fs.readFileSync(file, 'utf8').trim() || null
  } catch {
    return null
  }
}

export function readApprovals(root: string, brandSlug: string): ApprovalsDoc {
  const empty: ApprovalsDoc = { schema_version: 1, kind: 'social_style_approvals', brand_slug: brandSlug, approvals: {} }
  let text: string | null
  try {
    text = readText(approvalsFile(root))
  } catch {
    return empty
  }
  if (text === null) return empty
  try {
    const doc = JSON.parse(text) as ApprovalsDoc
    if (doc?.kind !== 'social_style_approvals' || doc.brand_slug !== brandSlug || typeof doc.approvals !== 'object' || doc.approvals === null) return empty
    return doc
  } catch {
    return empty
  }
}

/** The seal of one style approval under `secret` (approval and approval-secret rotation). */
export function sealFor(secret: string, brandSlug: string, styleId: string, record: Pick<ApprovalRecord, 'digest' | 'event_id' | 'approved_at'>): string {
  return approvalSeal(secret, approvalEventDigest({ brand_slug: brandSlug, style_id: styleId, digest: record.digest, event_id: record.event_id, approved_at: record.approved_at }), SOCIAL_APPROVAL_DOMAIN)
}

/** The effective status of every style: an approval verifies only with an unchanged digest and the owner's seal. */
export function evaluateKit(root: string, kit: SocialKit): StyleState[] {
  const approvals = readApprovals(root, kit.brand_slug).approvals
  const secret = readSecret(root)
  return kit.styles.map((style) => {
    const digest = styleDigest(kit.brand_slug, kit.family, style)
    if (style.status !== 'approved') return { style, status: style.status, digest, invalid_reason: null }
    const approval = style.approval
    if (!approval || approval.digest !== digest) return { style, status: 'invalid_approval', digest, invalid_reason: 'edited_after_approval' }
    const record = Object.prototype.hasOwnProperty.call(approvals, style.id) ? approvals[style.id] : undefined
    if (!record || !secret) return { style, status: 'invalid_approval', digest, invalid_reason: 'no_seal' }
    const matches = record.digest === digest && record.event_id === approval.event_id && record.approved_at === approval.approved_at && record.seal === sealFor(secret, kit.brand_slug, style.id, record)
    return matches ? { style, status: 'approved', digest, invalid_reason: null } : { style, status: 'invalid_approval', digest, invalid_reason: 'seal_mismatch' }
  })
}

function loadKitOrThrow(ws: KnowledgeWorkspace): SocialKit {
  const read = readKit(ws.root, ws.brandSlug)
  if (read.state === 'missing') throw new SocialKitError('not_found', `${SOCIAL_KIT_FILE} does not exist. Start one with npm run brand:social -- kit init.`)
  if (read.state === 'invalid') throw new SocialKitError('invalid_kit', read.error)
  return read.kit
}

const HEADER = [
  '# Social style kit (docs-internal/SOCIAL_STYLE_KIT.md). Design guidance, committed: never put a restricted value here.',
  '# Colours and fonts are design-token ids, zones are % of the canvas, layers are listed back to front.',
  '# Agents read only approved styles. Approve with npm run brand:social -- kit review / kit approve (owner proof).',
  '# Editing an approved style or the family makes the approval invalid until the owner approves again.',
].join('\n')

function writeKitYaml(ws: KnowledgeWorkspace, text: string): void {
  writeVaultFile(ws, kitFile(ws.root), text, false)
}

// ---- init ---------------------------------------------------------------------------------------------

export interface InitResult {
  path: string
  written: string[]
  kept: string[]
  family_kept: boolean
}

/**
 * Writes the starter draft kit. Refuses an existing file unless `force`; with `force`, approved and rejected styles
 * (and the family, while any style is approved) are kept exactly as they are, and only drafts are replaced.
 */
export function initKit(ws: KnowledgeWorkspace, input: { surfaces?: readonly SocialSurface[]; styles?: number; force?: boolean; personal?: boolean; mascot?: boolean }): InitResult {
  assertOwnerProcess()
  const per = input.styles ?? 4
  if (!Number.isInteger(per) || per < 1 || per > 4) throw new SocialKitError('invalid_input', '--styles is 1 to 4 (the engine has four starter archetypes per surface).')
  const surfaces = input.surfaces ?? SURFACES
  return withLock(ws, 'social-kit', () => {
    const starter = buildStarterKit({ brandSlug: ws.brandSlug, surfaces, stylesPerSurface: per, personal: input.personal, mascot: input.mascot })
    const existing = readKit(ws.root, ws.brandSlug)
    if (existing.state !== 'missing' && !input.force) throw new SocialKitError('exists', `${SOCIAL_KIT_FILE} already exists. Nothing was changed. Use --force to replace draft styles; approved and rejected styles are always kept.`)
    if (existing.state === 'invalid') throw new SocialKitError('invalid_kit', `${existing.error} Fix or remove the file first; --force never rewrites a kit it cannot read, so no approved style is lost.`)
    let kit: SocialKit = starter
    const kept: string[] = []
    let familyKept = false
    if (existing.state === 'ok') {
      const keep = existing.kit.styles.filter((style) => style.status !== 'draft' || !surfaces.includes(style.surface))
      kept.push(...keep.map((style) => style.id))
      const keptIds = new Set(kept)
      familyKept = existing.kit.styles.some((style) => style.status === 'approved')
      const fresh = starter.styles.filter((style) => !keptIds.has(style.id))
      const styles = SURFACES.flatMap((surface) => [...keep.filter((style) => style.surface === surface), ...fresh.filter((style) => style.surface === surface)].slice(0, MAX_STYLES_PER_SURFACE))
      kit = { ...starter, family: familyKept ? existing.kit.family : starter.family, styles }
    }
    writeKitYaml(ws, `${HEADER}\n${YAML.stringify(kit, { lineWidth: 0 })}`)
    return { path: SOCIAL_KIT_FILE, written: kit.styles.filter((style) => !kept.includes(style.id)).map((style) => style.id), kept, family_kept: familyKept }
  })
}

// ---- review / approve / reject ----------------------------------------------------------------------------

export interface ReviewItem {
  style_id: string
  surface: SocialSurface
  status: EffectiveStatus
  digest: string
  invalid_reason: InvalidReason | null
}

export interface ReviewResult {
  target: { style_id: string | null; surface: SocialSurface | null }
  items: ReviewItem[]
  /** What `--expect-sha` must be: the style digest, or one digest over the approvable styles of the surface. */
  expect_sha: string | null
  approvable: string[]
  safety_problems: string[]
  approve_with: string | null
}

function selectStates(states: StyleState[], target: { style_id?: string; surface?: string }): StyleState[] {
  if (target.style_id && target.surface) throw new SocialKitError('invalid_input', 'Give --style or --surface, not both.')
  if (target.style_id) {
    const found = states.filter((state) => state.style.id === target.style_id)
    if (found.length === 0) throw new SocialKitError('not_found', `No style ${target.style_id} in ${SOCIAL_KIT_FILE}.`)
    return found
  }
  if (target.surface) {
    if (!(SURFACES as readonly string[]).includes(target.surface)) throw new SocialKitError('invalid_input', `--surface is one of ${SURFACES.join(', ')}.`)
    return states.filter((state) => state.style.surface === target.surface)
  }
  throw new SocialKitError('invalid_input', 'Give --style <id> or --surface <surface>.')
}

const approvableStatus = (status: EffectiveStatus): boolean => status === 'draft' || status === 'invalid_approval'

function reviewOf(kit: SocialKit, states: StyleState[], target: { style_id?: string; surface?: string }): ReviewResult {
  const selected = selectStates(states, target)
  const approvable = selected.filter((state) => approvableStatus(state.status))
  const expect = approvable.length === 0 ? null : target.style_id ? (approvable[0] as StyleState).digest : batchDigest(approvable.map((state) => ({ id: state.style.id, digest: state.digest })))
  const flag = target.style_id ? `--style ${target.style_id}` : `--surface ${target.surface}`
  return {
    target: { style_id: target.style_id ?? null, surface: (target.surface as SocialSurface | undefined) ?? null },
    items: selected.map((state) => ({ style_id: state.style.id, surface: state.style.surface, status: state.status, digest: state.digest, invalid_reason: state.invalid_reason })),
    expect_sha: expect,
    approvable: approvable.map((state) => state.style.id),
    safety_problems: kitSafetyProblems(kit),
    approve_with: expect ? `npm run brand:social -- kit approve ${flag} --expect-sha ${expect}` : null,
  }
}

export function reviewKit(ws: KnowledgeWorkspace, target: { style_id?: string; surface?: string }): ReviewResult {
  const kit = loadKitOrThrow(ws)
  return reviewOf(kit, evaluateKit(ws.root, kit), target)
}

function setStatuses(ws: KnowledgeWorkspace, updates: Map<string, { status: 'approved' | 'rejected' | 'draft'; approval: SocialStyle['approval'] | null }>): void {
  const text = readText(kitFile(ws.root))
  if (text === null) throw new SocialKitError('not_found', `${SOCIAL_KIT_FILE} disappeared. Nothing was changed.`)
  // The document API keeps the owner's comments and layout; only status and approval change.
  const doc = parseDocument(text)
  const styles = doc.get('styles') as { items?: Array<{ get: (key: string) => unknown }> } | undefined
  const items = styles?.items ?? []
  items.forEach((node, index) => {
    const id = node.get('id')
    const update = typeof id === 'string' ? updates.get(id) : undefined
    if (!update) return
    doc.setIn(['styles', index, 'status'], update.status)
    if (update.approval) doc.setIn(['styles', index, 'approval'], doc.createNode(update.approval))
    else if (doc.hasIn(['styles', index, 'approval'])) doc.deleteIn(['styles', index, 'approval'])
  })
  writeKitYaml(ws, doc.toString({ lineWidth: 0 }))
}

function writeApprovals(ws: KnowledgeWorkspace, doc: ApprovalsDoc): void {
  writeVaultFile(ws, approvalsFile(ws.root), `${JSON.stringify(doc, null, 2)}\n`, true)
}

export interface ApproveResult {
  approved: Array<{ style_id: string; digest: string; event_id: string; approved_at: string }>
  skipped: Array<{ style_id: string; status: EffectiveStatus }>
}

/**
 * Owner approval of one style or of every approvable style on a surface. Needs the owner's approval proof and the
 * digest the owner reviewed (`--expect-sha`, TOCTOU guard). Refused under an agent token, and refused while the kit
 * holds text that looks like a credential or private data.
 */
export function approveKit(ws: KnowledgeWorkspace, input: { style_id?: string; surface?: string; expected_sha256: string | undefined; proof: string | undefined }): ApproveResult {
  assertOwnerProcess()
  if (!input.expected_sha256 || !/^[0-9a-f]{64}$/.test(input.expected_sha256)) throw new SocialKitError('invalid_input', '--expect-sha is required: the digest kit review printed.')
  if (!approvalProofMatches(ws.root, input.proof)) throw new SocialKitError('proof', 'Approval refused: missing or wrong owner approval proof. Nothing was changed.')
  const secret = readSecret(ws.root)
  if (!secret) throw new SocialKitError('proof', 'The approval secret is unreadable. Nothing was changed.')
  return withLock(ws, 'social-kit', () => {
    const kit = loadKitOrThrow(ws)
    const review = reviewOf(kit, evaluateKit(ws.root, kit), { style_id: input.style_id, surface: input.surface })
    if (review.safety_problems.length) throw new SocialKitError('unsafe', `The kit holds text that looks like ${review.safety_problems.join(', ')}. It is committed design guidance: remove it first. Nothing was approved.`)
    if (!review.expect_sha) throw new SocialKitError('refused', 'Nothing to approve here: every selected style is already approved or rejected.')
    if (review.expect_sha !== input.expected_sha256) throw new SocialKitError('stale', `The selection now hashes to ${review.expect_sha}, not the ${input.expected_sha256} you reviewed. Review it again. Nothing was approved.`)
    const approvals = readApprovals(ws.root, ws.brandSlug)
    const now = ws.now().toISOString()
    const updates = new Map<string, { status: 'approved'; approval: SocialStyle['approval'] }>()
    const approved: ApproveResult['approved'] = []
    for (const item of review.items) {
      if (!review.approvable.includes(item.style_id)) continue
      const event = { event_id: newApprovalEventId(), approved_at: now, digest: item.digest }
      approvals.approvals[item.style_id] = { ...event, seal: sealFor(secret, ws.brandSlug, item.style_id, event), actor: 'owner' }
      updates.set(item.style_id, { status: 'approved', approval: event })
      approved.push({ style_id: item.style_id, ...event })
    }
    // The seal is written first: if the kit write then fails, the style is still a draft and the seal is unused.
    writeApprovals(ws, approvals)
    setStatuses(ws, updates)
    return { approved, skipped: review.items.filter((item) => !review.approvable.includes(item.style_id)).map((item) => ({ style_id: item.style_id, status: item.status })) }
  })
}

/** The owner declines a style (or every non-rejected style of a surface). It stays in the file and is never served. */
export function rejectKit(ws: KnowledgeWorkspace, input: { style_id?: string; surface?: string }): { rejected: string[] } {
  assertOwnerProcess()
  return withLock(ws, 'social-kit', () => {
    const kit = loadKitOrThrow(ws)
    const selected = selectStates(evaluateKit(ws.root, kit), input).filter((state) => state.status !== 'rejected')
    if (selected.length === 0) throw new SocialKitError('refused', 'Nothing to reject here.')
    const approvals = readApprovals(ws.root, ws.brandSlug)
    let changed = false
    for (const state of selected) {
      if (Object.prototype.hasOwnProperty.call(approvals.approvals, state.style.id)) {
        delete approvals.approvals[state.style.id]
        changed = true
      }
    }
    if (changed) writeApprovals(ws, approvals)
    setStatuses(ws, new Map(selected.map((state) => [state.style.id, { status: 'rejected' as const, approval: null }])))
    return { rejected: selected.map((state) => state.style.id) }
  })
}
