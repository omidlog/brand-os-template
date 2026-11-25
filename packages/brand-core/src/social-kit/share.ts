import fs from 'node:fs'
import path from 'node:path'
import { compileTokens } from '@brand-os/design-tokens'
import { writeVaultFile, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { SOCIAL_KIT_FILE, SocialKitError, styleDigest, SURFACES, type SocialFamily, type SocialStyle, type SocialSurface } from './model.js'
import { readTokenApprovalDigests, tokenLookup, tokenSnapshot, type TokenSnapshot } from './preview.js'
import { assertOwnerProcess, evaluateKit, kitSafetyProblems, readKit } from './store.js'

/**
 * Sharing the kit's approval state with Studio (the same pattern as `brand:content share`).
 *
 * The approval seals live in `brand/.private/social/approvals.json` (HMAC with the owner's approval secret) and never
 * leave the owner's machine, so Studio cannot verify them. `brand:social kit share` writes a public, non-secret
 * summary instead: `brand/social/shared/approvals.json` lists the style ids whose approval verifies here, with their
 * content digest and approval time. No seal, event id, secret or proof. The owner commits and merges it.
 *
 * Studio shows a style as approved only when the committed kit marks it approved, its content still hashes to that
 * approval digest, and the shared summary lists the same digest. A hand-edited style (or family) therefore shows as
 * not verified until the owner approves and shares again. The summary is a display aid, never an approval: agents
 * keep reading the sealed state through `social_style_kit`.
 */

export const SHARED_SOCIAL_APPROVALS_FILE = 'brand/social/shared/approvals.json'

export interface SharedKitApprovals {
  schema_version: 1
  kind: 'social_style_approvals_summary'
  brand_slug: string
  styles: Array<{ style_id: string; digest: string; approved_at: string }>
  shared_at: string
}

/** Writes (or with `dryRun`, previews) the summary of the styles whose sealed approval verifies on this machine. */
export function shareKitApprovals(ws: KnowledgeWorkspace, input: { dryRun: boolean }): { path: string; summary: SharedKitApprovals; written: boolean } {
  assertOwnerProcess()
  const read = readKit(ws.root, ws.brandSlug)
  if (read.state === 'missing') throw new SocialKitError('not_found', `${SOCIAL_KIT_FILE} does not exist. Nothing was shared.`)
  if (read.state === 'invalid') throw new SocialKitError('invalid_kit', `${read.error} Nothing was shared.`)
  const problems = kitSafetyProblems(read.kit)
  if (problems.length) throw new SocialKitError('unsafe', `The kit holds text that looks like ${problems.join(', ')}. Nothing was shared.`)
  const styles = evaluateKit(ws.root, read.kit)
    .filter((state) => state.status === 'approved' && state.style.approval)
    .map((state) => ({ style_id: state.style.id, digest: state.digest, approved_at: (state.style.approval as { approved_at: string }).approved_at }))
    .sort((a, b) => (a.style_id < b.style_id ? -1 : 1))
  const summary: SharedKitApprovals = { schema_version: 1, kind: 'social_style_approvals_summary', brand_slug: ws.brandSlug, styles, shared_at: ws.now().toISOString() }
  if (!input.dryRun) writeVaultFile(ws, path.join(ws.root, ...SHARED_SOCIAL_APPROVALS_FILE.split('/')), `${JSON.stringify(summary, null, 2)}\n`, false)
  return { path: SHARED_SOCIAL_APPROVALS_FILE, summary, written: !input.dryRun }
}

// ---- Studio projection ---------------------------------------------------------------------------------

export const STUDIO_SOCIAL_LIMITS = { maxFileBytes: 256 * 1024, maxStyles: SURFACES.length * 12 } as const

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const STYLE_ID = /^(post|carousel|story|reel|reel_cover|thumbnail|linkedin_post|linkedin_document)\.[a-z0-9][a-z0-9-]{1,39}$/

/** Strict shape check: anything unexpected is withheld whole. */
export function validSharedApprovals(value: unknown): value is SharedKitApprovals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const d = value as Record<string, unknown>
  if (Object.keys(d).some((key) => !['schema_version', 'kind', 'brand_slug', 'styles', 'shared_at'].includes(key))) return false
  return (
    d.schema_version === 1 &&
    d.kind === 'social_style_approvals_summary' &&
    typeof d.brand_slug === 'string' &&
    /^[a-z0-9][a-z0-9-]{0,63}$/.test(d.brand_slug) &&
    typeof d.shared_at === 'string' &&
    ISO.test(d.shared_at) &&
    Array.isArray(d.styles) &&
    d.styles.length <= STUDIO_SOCIAL_LIMITS.maxStyles &&
    d.styles.every((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false
      const s = item as Record<string, unknown>
      return (
        Object.keys(s).every((key) => ['style_id', 'digest', 'approved_at'].includes(key)) &&
        typeof s.style_id === 'string' &&
        STYLE_ID.test(s.style_id) &&
        typeof s.digest === 'string' &&
        /^[0-9a-f]{64}$/.test(s.digest) &&
        typeof s.approved_at === 'string' &&
        !Number.isNaN(Date.parse(s.approved_at))
      )
    })
  )
}

/**
 * `approved`: marked approved, unchanged since, and listed with the same digest in the shared summary.
 * `not_verified`: marked approved, but edited after approval (`edited_after_approval`) or not in the shared summary
 * with this digest (`not_shared`). Never shown as approved.
 */
export type StudioStyleStatus = 'approved' | 'not_verified' | 'draft' | 'rejected'

export interface StudioSocialStyle {
  style: SocialStyle
  status: StudioStyleStatus
  reason: 'edited_after_approval' | 'not_shared' | null
  digest: string
  approved_at: string | null
}

export type WithheldApprovalsReason = 'symlink' | 'unreadable' | 'invalid_record' | 'wrong_brand'

export interface StudioSocialKitProjection {
  /** `missing`: no kit file. `invalid`: the kit does not parse. `unsafe`: it holds credential-like text (nothing shown). */
  state: 'ok' | 'missing' | 'invalid' | 'unsafe'
  family: SocialFamily | null
  styles: StudioSocialStyle[]
  /** Colour and font tokens the kit names, resolved at sync time (fonts per en/fa/tr, with their state). */
  tokens: TokenSnapshot | null
  shared: { shared_at: string; count: number } | null
  withheld: Array<{ path: string; reason: WithheldApprovalsReason }>
  counts: Record<StudioStyleStatus, number>
}

function readShared(root: string, brandSlug: string, withheld: StudioSocialKitProjection['withheld']): SharedKitApprovals | null {
  const file = path.join(root, ...SHARED_SOCIAL_APPROVALS_FILE.split('/'))
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(file)
  } catch {
    return null
  }
  const rel = SHARED_SOCIAL_APPROVALS_FILE
  if (stat.isSymbolicLink()) {
    withheld.push({ path: rel, reason: 'symlink' })
    return null
  }
  if (!stat.isFile() || stat.size > STUDIO_SOCIAL_LIMITS.maxFileBytes) {
    withheld.push({ path: rel, reason: 'unreadable' })
    return null
  }
  let doc: unknown
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    withheld.push({ path: rel, reason: 'unreadable' })
    return null
  }
  if (!validSharedApprovals(doc)) {
    withheld.push({ path: rel, reason: 'invalid_record' })
    return null
  }
  if (doc.brand_slug !== brandSlug) {
    withheld.push({ path: rel, reason: 'wrong_brand' })
    return null
  }
  return { schema_version: 1, kind: doc.kind, brand_slug: doc.brand_slug, styles: doc.styles.map((s) => ({ style_id: s.style_id, digest: s.digest, approved_at: s.approved_at })), shared_at: doc.shared_at }
}

const emptyCounts = (): Record<StudioStyleStatus, number> => ({ approved: 0, not_verified: 0, draft: 0, rejected: 0 })

/**
 * Reads `brand/social/style-kit.yaml` and `brand/social/shared/approvals.json` from a checkout (Studio: the extracted
 * merged commit). Returns null when neither exists, so Studio lists the page only when there is something to show.
 * Pure over the files; never reads `.private` (the seals are not there in Studio, and not needed).
 */
export function buildStudioSocialKit(root: string, brandSlug: string): StudioSocialKitProjection | null {
  const withheld: StudioSocialKitProjection['withheld'] = []
  const shared = readShared(root, brandSlug, withheld)
  const read = readKit(root, brandSlug)
  const base = { family: null, styles: [], tokens: null, shared: shared ? { shared_at: shared.shared_at, count: shared.styles.length } : null, withheld, counts: emptyCounts() }
  if (read.state === 'missing') return shared || withheld.length ? { ...base, state: 'missing' } : null
  if (read.state === 'invalid') return { ...base, state: 'invalid' }
  const kit = read.kit
  if (kitSafetyProblems(kit).length) return { ...base, state: 'unsafe' }
  const listed = new Map((shared?.styles ?? []).map((item) => [item.style_id, item]))
  const counts = emptyCounts()
  const styles: StudioSocialStyle[] = kit.styles.map((style) => {
    const digest = styleDigest(kit.brand_slug, kit.family, style)
    let status: StudioStyleStatus = style.status === 'approved' ? 'not_verified' : style.status
    let reason: StudioSocialStyle['reason'] = null
    if (style.status === 'approved') {
      const entry = listed.get(style.id)
      if (!style.approval || style.approval.digest !== digest) reason = 'edited_after_approval'
      else if (!entry || entry.digest !== digest) reason = 'not_shared'
      else status = 'approved'
    }
    counts[status] += 1
    return { style, status, reason, digest, approved_at: status === 'approved' ? (style.approval?.approved_at ?? null) : null }
  })
  const tokens = tokenSnapshot(kit, tokenLookup(compileTokens(root).flat, readTokenApprovalDigests(root)))
  const order = (surface: SocialSurface) => SURFACES.indexOf(surface)
  styles.sort((a, b) => order(a.style.surface) - order(b.style.surface))
  return { ...base, state: 'ok', family: kit.family, styles, tokens, counts }
}

