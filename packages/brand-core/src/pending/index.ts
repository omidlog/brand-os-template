import { AGENT_TOKEN_ENV } from '../agent-tokens.js'
import type { ApprovalService, PendingKind, PlanEntry } from '../approval.js'
import {
  approveAllPending,
  dryRunReport,
  PENDING_KINDS,
  planAllPending,
  type AllPendingItem,
  type AllPendingOutcome,
  type AllPendingPlan,
  type AllPendingResult,
  type DryRunItem,
  type DryRunReport,
} from '../approve-all.js'
import { approveWeek, reviewWeek, scanWeeks, loadWeekRevision } from '../content-bridge/calendar-store.js'
import { approveAspects, listAspectProposals } from '../creative/aspects.js'
import { aspectProposalDigest, preferenceDigest } from '../creative/model.js'
import { approvePreference, listPreferences, sourceStatus } from '../creative/store.js'
import { openWorkspace, type KnowledgeWorkspace } from '../knowledge/workspace.js'
import { approvalProofMatches } from '../private-store.js'
import { SURFACES, type SocialLang } from '../social-kit/model.js'
import { approveKit, readKit, reviewKit } from '../social-kit/store.js'
import { compileTokens, tokenDigest } from '@brand-os/design-tokens'
import { approveTokens, readTokenApprovals } from '../token-generate.js'
import { approveRevision, loadRevision, reviewRevision, scanRecords } from '../strategy/store.js'

/**
 * "One review, one approval": `brand:approve --all-pending` beyond facts, changes, evidence and assets. This module
 * lists what else is waiting for the owner (strategy draft revisions, content calendar week drafts, social style kit
 * styles per surface, creative preference drafts, pending aspect proposals), computes for each the digest its own
 * `review` command shows, and approves by handing exactly that digest to the existing per-kind approve function. It
 * owns no approval rule: every refusal comes from the kind's own store.
 *
 * Invariants: one proof check for the whole run, before any write; a wrong or missing proof writes nothing; a dry run
 * never reads a proof and never writes; an item that changed between planning and approving (a different digest, a
 * newer revision, a new blocker) is `stale` and is not approved. Refused while BRAND_OS_AGENT_TOKEN is set.
 */

export type ExtraKind = 'strategy' | 'week' | 'design_token' | 'social_style' | 'creative_preference' | 'aspect_proposal'
export type AnyKind = PendingKind | ExtraKind

export const EXTRA_KINDS: readonly ExtraKind[] = ['strategy', 'week', 'design_token', 'social_style', 'creative_preference', 'aspect_proposal']
export const ALL_KINDS: readonly AnyKind[] = [...PENDING_KINDS, ...EXTRA_KINDS]
/** Kinds the owner usually reads in full before approving. They are always listed; `--only` narrows a run. */
export const LOOK_FIRST_KINDS: readonly ExtraKind[] = ['strategy', 'week']

const KIND_ALIASES: Record<string, AnyKind> = {
  fact: 'fact', facts: 'fact',
  change: 'change', changes: 'change',
  evidence: 'evidence',
  asset: 'asset', assets: 'asset',
  strategy: 'strategy', strategies: 'strategy',
  week: 'week', weeks: 'week', calendar: 'week',
  social: 'social_style', social_style: 'social_style', style: 'social_style', styles: 'social_style',
  creative: 'creative_preference', creative_preference: 'creative_preference', preference: 'creative_preference', preferences: 'creative_preference',
  aspect: 'aspect_proposal', aspects: 'aspect_proposal', aspect_proposal: 'aspect_proposal',
  token: 'design_token', tokens: 'design_token', design_token: 'design_token',
}

/** Parses `--only strategy,week`. Throws with the accepted names on an unknown kind. */
export function parseOnlyKinds(value: string | undefined): AnyKind[] | undefined {
  if (value === undefined) return undefined
  const kinds = value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  const out: AnyKind[] = []
  for (const name of kinds) {
    const kind = KIND_ALIASES[name]
    if (!kind) throw new Error(`--only does not know "${name}". Use: fact, change, evidence, asset, strategy, week, token, social, creative, aspect.`)
    if (!out.includes(kind)) out.push(kind)
  }
  if (out.length === 0) throw new Error('--only needs at least one kind.')
  return out
}

export type PendingLang = SocialLang

export interface ExtraEntry {
  kind: ExtraKind
  /** Strategy id, week id, social surface, cp_… or ap_…; what --exclude matches. */
  id: string
  revision: number | null
  /** The digest the kind's own review shows (what --expect-sha would name); passed unchanged to its approve. */
  digest: string
  decision: 'approve' | 'skip'
  summary: string
  reason: string
  /** The kind's own command for a full review. */
  review_with: string
  look_first: boolean
  /** Social styles approved with this surface entry. */
  styles?: string[]
}

export interface EverythingPlan {
  base: AllPendingPlan
  extras: ExtraEntry[]
  only: AnyKind[] | null
  unmatched_excludes: string[]
  lang: PendingLang
}

// ---- text (en / fa / tr) ---------------------------------------------------------------------------------

type Text = Record<PendingLang, string>

const fill = (text: string, vars: Record<string, string | number>): string => text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))

export const EXTRA_TITLES: Record<ExtraKind, Text> = {
  strategy: { en: 'Strategies (read these first)', fa: 'استراتژی‌ها (اول این‌ها را بخوانید)', tr: 'Stratejiler (önce bunları okuyun)' },
  week: { en: 'Content calendar weeks (read these first)', fa: 'هفته‌های تقویم محتوا (اول این‌ها را بخوانید)', tr: 'İçerik takvimi haftaları (önce bunları okuyun)' },
  design_token: { en: 'Design tokens generated from approved answers', fa: 'توکن‌های طراحی ساخته‌شده از جواب‌های تأییدشده', tr: 'Onaylı yanıtlardan üretilen tasarım tokenları' },
  social_style: { en: 'Social style kit, per format', fa: 'کیت سبک شبکه‌های اجتماعی، برای هر قالب', tr: 'Sosyal stil kiti, biçim başına' },
  creative_preference: { en: 'Creative preferences (project scope)', fa: 'ترجیحات خلاقانه (در سطح پروژه)', tr: 'Yaratıcı tercihler (proje kapsamı)' },
  aspect_proposal: { en: 'Feedback aspects (keep / avoid)', fa: 'جنبه‌های بازخورد (نگه‌دار / پرهیز)', tr: 'Geri bildirim yönleri (koru / kaçın)' },
}

const T = {
  strategy: {
    en: '{type} strategy "{title}", revision {rev} ({base}), {recs} recommendation(s), valid until {until}.',
    fa: 'استراتژی {type} «{title}»، نسخهٔ {rev} ({base})، {recs} توصیه، معتبر تا {until}.',
    tr: '{type} stratejisi "{title}", revizyon {rev} ({base}), {recs} öneri, {until} tarihine kadar geçerli.',
  },
  replaces: { en: 'replaces revision {n}', fa: 'جایگزین نسخهٔ {n}', tr: '{n}. revizyonun yerine' },
  first: { en: 'first revision', fa: 'نخستین نسخه', tr: 'ilk revizyon' },
  week: {
    en: 'Week {start} to {end}, revision {rev}: {slots} slot(s) on {channels}, {gaps} open gap(s).',
    fa: 'هفتهٔ {start} تا {end}، نسخهٔ {rev}: {slots} اسلات در {channels}، {gaps} جای خالی باز.',
    tr: '{start} – {end} haftası, revizyon {rev}: {channels} üzerinde {slots} yuva, {gaps} açık boşluk.',
  },
  social: {
    en: '{count} style(s) for {surface}: {names}.',
    fa: '{count} سبک برای {surface}: {names}.',
    tr: '{surface} için {count} stil: {names}.',
  },
  socialInvalid: { en: ' Includes a style edited after approval.', fa: ' شامل سبکی است که پس از تأیید ویرایش شده.', tr: ' Onaydan sonra düzenlenmiş bir stil içeriyor.' },
  creative: {
    en: '"{statement}" for project {project}. Approved at project scope (for a series use brand:creative approve --scope series).',
    fa: '«{statement}» برای پروژهٔ {project}. در سطح پروژه تأیید می‌شود (برای یک سری از brand:creative approve --scope series استفاده کنید).',
    tr: '{project} projesi için "{statement}". Proje kapsamında onaylanır (bir seri için brand:creative approve --scope series kullanın).',
  },
  token: {
    en: '{id} = {value} (from {source}).',
    fa: '{id} = {value} (از {source}).',
    tr: '{id} = {value} ({source} kaynağından).',
  },
  tokenChanged: {
    en: 'Already approved with a different value. Remove the old approval in a reviewed edit first (brand/tokens/approvals.yaml).',
    fa: 'قبلاً با مقدار دیگری تأیید شده است. اول تأیید قبلی را در یک ویرایش بررسی‌شده بردارید (brand/tokens/approvals.yaml).',
    tr: 'Farklı bir değerle zaten onaylı. Önce eski onayı incelenmiş bir düzenlemeyle kaldırın (brand/tokens/approvals.yaml).',
  },
  aspect: {
    en: 'Keep: {keep}. Avoid: {avoid}. From feedback {feedback} on project {project} (machine suggestion; unclear sides are not applied).',
    fa: 'نگه‌دار: {keep}. پرهیز: {avoid}. از بازخورد {feedback} در پروژهٔ {project} (پیشنهاد ماشینی؛ جنبه‌های نامشخص اعمال نمی‌شوند).',
    tr: 'Koru: {keep}. Kaçın: {avoid}. {project} projesindeki {feedback} geri bildiriminden (makine önerisi; belirsiz yönler uygulanmaz).',
  },
  none: { en: 'none', fa: 'هیچ', tr: 'yok' },
  allUnclear: {
    en: 'Every suggestion is unclear. Choose sides with brand:creative aspects approve --id {id} --only aspect:keep|avoid.',
    fa: 'همهٔ پیشنهادها نامشخص‌اند. سمت را با brand:creative aspects approve --id {id} --only aspect:keep|avoid انتخاب کنید.',
    tr: 'Önerilerin hepsi belirsiz. Yönleri brand:creative aspects approve --id {id} --only aspect:keep|avoid ile seçin.',
  },
  excluded: { en: 'Excluded with --exclude.', fa: 'با --exclude کنار گذاشته شد.', tr: '--exclude ile hariç tutuldu.' },
  approveReason: {
    en: 'Approving passes the reviewed digest to the kind\'s own approve command. It authorizes no post, publication, schedule, ad or spend.',
    fa: 'تأیید، همان چکیدهٔ بازبینی‌شده را به فرمان تأیید همین نوع می‌دهد. هیچ پست، انتشار، زمان‌بندی، تبلیغ یا هزینه‌ای را مجاز نمی‌کند.',
    tr: 'Onay, incelenen özeti bu türün kendi onay komutuna verir. Hiçbir gönderiye, yayına, zamanlamaya, reklama veya harcamaya izin vermez.',
  },
} satisfies Record<string, Text>

const short = (text: string, max = 90): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

// ---- collecting --------------------------------------------------------------------------------------------

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function strategyEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const out: ExtraEntry[] = []
  for (const record of scanRecords(ws)) {
    const newest = record.revisions.reduce((max, item) => Math.max(max, item.revision), 0)
    const entry = record.revisions.find((item) => item.revision === newest)
    if (!entry || entry.state !== 'draft') continue
    const review_with = `npm run brand:strategy -- review --id ${record.strategy_id} --revision ${entry.revision}`
    const base = { kind: 'strategy' as const, id: record.strategy_id, revision: entry.revision, digest: entry.content_sha256, review_with, look_first: true }
    try {
      const review = reviewRevision(ws, { strategy_id: record.strategy_id, revision: entry.revision })
      const content = loadRevision(ws, record.strategy_id, entry.revision, entry).content
      const summary = fill(T.strategy[lang], {
        type: record.type,
        title: short(content.title, 70),
        rev: entry.revision,
        base: review.supersedes_revision === null ? T.first[lang] : fill(T.replaces[lang], { n: review.supersedes_revision }),
        recs: review.impact.recommendations,
        until: review.dates.valid_until.slice(0, 10),
      })
      out.push({ ...base, digest: review.content_sha256, summary, decision: review.blockers.length ? 'skip' : 'approve', reason: review.blockers.length ? review.blockers.join(' ') : T.approveReason[lang] })
    } catch (error) {
      out.push({ ...base, summary: `${record.strategy_id} r${entry.revision}`, decision: 'skip', reason: message(error) })
    }
  }
  return out
}

function weekEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const out: ExtraEntry[] = []
  for (const record of scanWeeks(ws)) {
    const newest = record.revisions.reduce((max, item) => Math.max(max, item.revision), 0)
    const entry = record.revisions.find((item) => item.revision === newest)
    if (!entry || entry.state !== 'draft') continue
    const review_with = `npm run brand:content -- week review --week ${record.week_id} --revision ${entry.revision}`
    const base = { kind: 'week' as const, id: record.week_id, revision: entry.revision, digest: entry.content_sha256, review_with, look_first: true }
    try {
      const review = reviewWeek(ws, { week_id: record.week_id, revision: entry.revision, lang })
      const content = loadWeekRevision(ws, record.week_id, entry.revision, entry).content
      const channels = [...new Set(content.slots.map((slot) => slot.channel))].join(', ') || T.none[lang]
      const summary = fill(T.week[lang], { start: content.week_start, end: content.week_end, rev: entry.revision, slots: review.slots, channels, gaps: review.gaps.length })
      out.push({ ...base, digest: review.content_sha256, summary, decision: review.blockers.length ? 'skip' : 'approve', reason: review.blockers.length ? review.blockers.join(' ') : T.approveReason[lang] })
    } catch (error) {
      out.push({ ...base, summary: `${record.week_id} r${entry.revision}`, decision: 'skip', reason: message(error) })
    }
  }
  return out
}

function socialEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const read = readKit(ws.root, ws.brandSlug)
  if (read.state === 'missing') return []
  if (read.state === 'invalid') {
    return [{ kind: 'social_style', id: 'style-kit', revision: null, digest: '', decision: 'skip', summary: 'brand/social/style-kit.yaml', reason: read.error, review_with: 'npm run brand:social -- kit review --surface <surface>', look_first: false }]
  }
  const out: ExtraEntry[] = []
  for (const surface of SURFACES) {
    if (!read.kit.styles.some((style) => style.surface === surface)) continue
    const review_with = `npm run brand:social -- kit review --surface ${surface}`
    try {
      const review = reviewKit(ws, { surface })
      if (!review.expect_sha) continue
      const styles = read.kit.styles.filter((style) => review.approvable.includes(style.id))
      const names = styles.map((style) => style.name[lang] ?? style.name.en).join(', ')
      const invalid = review.items.some((item) => review.approvable.includes(item.style_id) && item.status === 'invalid_approval')
      const summary = fill(T.social[lang], { count: styles.length, surface, names: short(names, 120) }) + (invalid ? T.socialInvalid[lang] : '')
      const blocked = review.safety_problems.length > 0
      out.push({
        kind: 'social_style',
        id: surface,
        revision: null,
        digest: review.expect_sha,
        decision: blocked ? 'skip' : 'approve',
        summary,
        reason: blocked ? `The kit holds text that looks like ${review.safety_problems.join(', ')}. Remove it first.` : T.approveReason[lang],
        review_with,
        look_first: false,
        styles: review.approvable,
      })
    } catch (error) {
      out.push({ kind: 'social_style', id: surface, revision: null, digest: '', decision: 'skip', summary: surface, reason: message(error), review_with, look_first: false })
    }
  }
  return out
}

function creativeEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const out: ExtraEntry[] = []
  for (const pref of listPreferences(ws)) {
    if (pref.state !== 'draft') continue
    const stale = pref.sources.map((ref) => ({ ref, status: sourceStatus(ws, ref) })).filter((item) => !item.status.current)
    out.push({
      kind: 'creative_preference',
      id: pref.preference_id,
      revision: null,
      digest: preferenceDigest(pref),
      decision: stale.length ? 'skip' : 'approve',
      summary: fill(T.creative[lang], { statement: short(pref.statement, 80), project: pref.project_id }),
      reason: stale.length ? `Source ${stale.map((item) => `${item.ref.id} is ${item.status.state}`).join(', ')} since it was suggested. Suggest it again.` : T.approveReason[lang],
      review_with: `npm run brand:creative -- preferences`,
      look_first: false,
    })
  }
  return out
}

function aspectEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const out: ExtraEntry[] = []
  for (const proposal of listAspectProposals(ws, { state: 'pending' })) {
    const keep = proposal.suggestions.filter((item) => item.side === 'keep').map((item) => item.aspect)
    const avoid = proposal.suggestions.filter((item) => item.side === 'avoid').map((item) => item.aspect)
    const note = sourceStatus(ws, proposal.note)
    const clear = keep.length + avoid.length > 0
    out.push({
      kind: 'aspect_proposal',
      id: proposal.proposal_id,
      revision: null,
      digest: aspectProposalDigest(proposal),
      decision: clear && note.current ? 'approve' : 'skip',
      summary: fill(T.aspect[lang], { keep: keep.join(', ') || T.none[lang], avoid: avoid.join(', ') || T.none[lang], feedback: proposal.feedback_id, project: proposal.project_id }),
      reason: !note.current ? `Note ${proposal.note.id} is ${note.state} since these aspects were suggested. Run aspects suggest again.` : !clear ? fill(T.allUnclear[lang], { id: proposal.proposal_id }) : T.approveReason[lang],
      review_with: `npm run brand:creative -- aspects list --project ${proposal.project_id} --state pending`,
      look_first: false,
    })
  }
  return out
}

function tokenEntries(ws: KnowledgeWorkspace, lang: PendingLang): ExtraEntry[] {
  const compiled = compileTokens(ws.root)
  if (compiled.errors.length) return []
  const approved = readTokenApprovals(ws.root)
  const out: ExtraEntry[] = []
  for (const [id, token] of Object.entries(compiled.flat).sort(([a], [b]) => a.localeCompare(b))) {
    if (token.source !== 'generated') continue
    const digest = tokenDigest(token)
    const prior = approved[id]
    if (prior?.value_sha256 === digest) continue
    const value = typeof token.value === 'string' ? token.value : JSON.stringify(token.value)
    out.push({
      kind: 'design_token',
      id,
      revision: null,
      digest,
      decision: prior ? 'skip' : 'approve',
      summary: fill(T.token[lang], { id, value: short(value, 60), source: token.sourceFact ?? 'generated' }),
      reason: prior ? T.tokenChanged[lang] : T.approveReason[lang],
      review_with: 'npm run brand:tokens:generate',
      look_first: false,
    })
  }
  return out
}

const COLLECTORS: Record<ExtraKind, (ws: KnowledgeWorkspace, lang: PendingLang) => ExtraEntry[]> = {
  strategy: strategyEntries,
  week: weekEntries,
  design_token: tokenEntries,
  social_style: socialEntries,
  creative_preference: creativeEntries,
  aspect_proposal: aspectEntries,
}

function assertOwner(): void {
  if (process.env[AGENT_TOKEN_ENV]) throw new Error(`Pending approvals are the owner's. Refusing while ${AGENT_TOKEN_ENV} is set. Nothing was read or changed.`)
}

/** Everything pending, existing kinds first (unchanged), then the extra kinds; `exclude` and `only` applied. Reads only. */
export function planEverything(approvals: ApprovalService, root: string, options: { exclude?: string[]; only?: AnyKind[]; actor?: string; lang?: PendingLang; now?: () => Date } = {}): EverythingPlan {
  assertOwner()
  const lang = options.lang ?? 'en'
  const exclude = new Set((options.exclude ?? []).map((id) => id.trim()).filter(Boolean))
  const base = planAllPending(approvals, root, { exclude: [...exclude], actor: options.actor })
  const only = options.only && options.only.length ? options.only : null
  const ws = openWorkspace(root, options.now ? { now: options.now } : {})
  const matched = new Set([...exclude].filter((id) => !base.unmatched_excludes.includes(id)))
  const extras: ExtraEntry[] = []
  for (const kind of EXTRA_KINDS) {
    if (only && !only.includes(kind)) continue
    for (const entry of COLLECTORS[kind](ws, lang)) {
      if (exclude.has(entry.id)) {
        matched.add(entry.id)
        extras.push({ ...entry, decision: 'skip', reason: T.excluded[lang] })
      } else extras.push(entry)
    }
  }
  const baseEntries = only ? base.entries.filter((entry) => only.includes(entry.kind)) : base.entries
  return { base: { entries: baseEntries, unmatched_excludes: [] }, extras, only, unmatched_excludes: [...exclude].filter((id) => !matched.has(id)), lang }
}

// ---- approving ---------------------------------------------------------------------------------------------

export interface EverythingItem extends Omit<AllPendingItem, 'kind'> {
  kind: AnyKind
  revision?: number | null
  digest?: string
  summary?: string
}

export interface EverythingResult extends Omit<AllPendingResult, 'results'> {
  results: EverythingItem[]
}

const STALE_CODES = new Set(['stale', 'stale_revision', 'stale_source', 'stale_pin'])

function outcomeOfError(error: unknown): { outcome: AllPendingOutcome; reason: string } {
  const code = (error as { code?: unknown } | null)?.code
  return { outcome: typeof code === 'string' && STALE_CODES.has(code) ? 'stale' : 'refused', reason: message(error) }
}

function approveExtra(ws: KnowledgeWorkspace, entry: ExtraEntry, proof: string, lang: PendingLang): { outcome: AllPendingOutcome; reason: string } {
  // Re-read now: a newer revision, a new digest or a new blocker since planning means the owner did not see this.
  let fresh: ExtraEntry | undefined
  try {
    fresh = COLLECTORS[entry.kind](ws, lang).find((item) => item.id === entry.id)
  } catch (error) {
    return outcomeOfError(error)
  }
  if (!fresh || fresh.revision !== entry.revision || fresh.digest !== entry.digest) {
    return { outcome: 'stale', reason: 'Changed since it was planned (a new revision or different content). Nothing was approved; review it again.' }
  }
  if (fresh.decision !== 'approve') return { outcome: 'stale', reason: `No longer approvable: ${fresh.reason}` }
  try {
    switch (entry.kind) {
      case 'strategy': {
        const done = approveRevision(ws, { strategy_id: entry.id, revision: entry.revision!, expected_sha256: entry.digest, proof })
        return { outcome: 'approved', reason: `Approved revision ${done.approved.revision}${done.superseded ? `; revision ${done.superseded.revision} is superseded` : ''}. Nothing was published or spent.` }
      }
      case 'week': {
        const done = approveWeek(ws, { week_id: entry.id, revision: entry.revision!, expected_sha256: entry.digest, proof, lang })
        return { outcome: 'approved', reason: `Approved revision ${done.approved.revision}${done.superseded ? `; revision ${done.superseded.revision} is superseded` : ''}. Nothing was posted or scheduled.` }
      }
      case 'design_token': {
        const done = approveTokens(ws.root, [entry.id], proof)
        const item = done.results[0]
        if (!done.ok || !item || (item.outcome !== 'approved' && item.outcome !== 'unchanged')) return { outcome: 'refused', reason: item?.reason ?? done.errors.join('; ') }
        return { outcome: 'approved', reason: 'Value hash recorded. Not published.' }
      }
      case 'social_style': {
        const done = approveKit(ws, { surface: entry.id, expected_sha256: entry.digest, proof })
        return { outcome: 'approved', reason: `Approved ${done.approved.map((item) => item.style_id).join(', ')}. Design guidance only; it authorizes no post.` }
      }
      case 'creative_preference': {
        const done = approvePreference(ws, { preference_id: entry.id, proof, expected_digest: entry.digest })
        return { outcome: 'approved', reason: `Approved for project ${done.approved.project_id}${done.superseded ? `; ${done.superseded.preference_id} is superseded` : ''}.` }
      }
      case 'aspect_proposal': {
        const done = approveAspects(ws, { proposal_id: entry.id, proof, expected_digest: entry.digest })
        return { outcome: 'approved', reason: `Applied ${done.proposal.applied.map((item) => `${item.aspect}:${item.side}`).join(', ')} to feedback ${done.feedback.feedback_id}.` }
      }
    }
  } catch (error) {
    return outcomeOfError(error)
  }
}

function extraItem(entry: ExtraEntry, outcome: AllPendingOutcome, reason: string): EverythingItem {
  return { kind: entry.kind, id: entry.id, question_id: null, outcome, reason, revision: entry.revision, digest: entry.digest, summary: entry.summary }
}

/**
 * Approve the plan with one proof, checked once before anything is written. Existing kinds go through
 * `approveAllPending` exactly as before; each extra kind through its own store function with the planned digest.
 */
export function approveEverything(approvals: ApprovalService, root: string, plan: EverythingPlan, proof: string | undefined, actor = 'owner', options: { now?: () => Date } = {}): EverythingResult {
  assertOwner()
  const counts: Record<AllPendingOutcome, number> = { approved: 0, skipped: 0, refused: 0, stale: 0 }
  const approvable = plan.base.entries.some((entry) => entry.decision === 'approve') || plan.extras.some((entry) => entry.decision === 'approve')
  const finish = (results: EverythingItem[], proofState: AllPendingResult['proof']): EverythingResult => {
    for (const item of results) counts[item.outcome] += 1
    return { mode: 'approve', dry_run: false, ok: proofState !== 'rejected' && counts.refused === 0, proof: proofState, approved: counts.approved, counts, results, unmatched_excludes: plan.unmatched_excludes }
  }
  const skipped = (entry: ExtraEntry): EverythingItem => extraItem(entry, entry.decision === 'approve' ? 'refused' : 'skipped', entry.reason)
  if (!approvable) {
    const base = approveAllPending(approvals, root, plan.base, undefined, actor)
    return finish([...base.results, ...plan.extras.map(skipped)], 'not_needed')
  }
  if (!approvalProofMatches(root, proof)) {
    const refused = (kind: AnyKind, id: string, question_id: string | null): EverythingItem => ({ kind, id, question_id, outcome: 'refused', reason: 'Approval proof rejected. Nothing was changed.' })
    return finish([...plan.base.entries.map((entry: PlanEntry) => refused(entry.kind, entry.id, entry.question_id)), ...plan.extras.map((entry) => ({ ...refused(entry.kind, entry.id, null), revision: entry.revision, digest: entry.digest, summary: entry.summary }))], 'rejected')
  }
  const base = approveAllPending(approvals, root, plan.base, proof, actor)
  const ws = openWorkspace(root, options.now ? { now: options.now } : {})
  const extras = plan.extras.map((entry) => {
    if (entry.decision !== 'approve') return extraItem(entry, 'skipped', entry.reason)
    const done = approveExtra(ws, entry, proof as string, plan.lang)
    return extraItem(entry, done.outcome, done.reason)
  })
  return finish([...base.results, ...extras], 'accepted')
}

// ---- dry run and text --------------------------------------------------------------------------------------

export interface EverythingDryRunItem extends Omit<DryRunItem, 'kind'> {
  kind: AnyKind
  revision?: number | null
  digest?: string
  summary?: string
  review_with?: string
  look_first?: boolean
}

export interface EverythingDryRun extends Omit<DryRunReport, 'items'> {
  items: EverythingDryRunItem[]
  /** The one command that approves this plan (same --only / --exclude). */
  approve_with: string
}

export function approveCommand(plan: Pick<EverythingPlan, 'only'>, exclude: string[] = []): string {
  const parts = ['npm run brand:approve -- --all-pending']
  if (plan.only) parts.push(`--only ${plan.only.join(',')}`)
  if (exclude.length) parts.push(`--exclude ${exclude.join(',')}`)
  return parts.join(' ')
}

export function everythingDryRun(plan: EverythingPlan, exclude: string[] = []): EverythingDryRun {
  const base = dryRunReport(plan.base.entries, [])
  const extras = plan.extras.map((entry): EverythingDryRunItem => ({
    kind: entry.kind,
    id: entry.id,
    question_id: null,
    decision: entry.decision === 'approve' ? 'would_approve' : 'would_skip',
    because: entry.decision === 'approve' ? null : 'skipped',
    reason: entry.reason,
    revision: entry.revision,
    digest: entry.digest,
    summary: entry.summary,
    review_with: entry.review_with,
    look_first: entry.look_first,
  }))
  const items = [...base.items, ...extras]
  const count = items.filter((item) => item.decision === 'would_approve').length
  const notice = `DRY RUN: ${count} item${count === 1 ? '' : 's'} would be approved. Nothing was changed.`
  return { ...base, notice, would_approve: count, would_skip: items.length - count, items, unmatched_excludes: plan.unmatched_excludes, approve_with: approveCommand(plan, exclude) }
}

const BASE_TITLES: Record<PendingKind, string> = { fact: 'Facts', change: 'Change proposals', evidence: 'Evidence awaiting verification', asset: 'Draft assets' }

function title(kind: AnyKind, lang: PendingLang): string {
  return (PENDING_KINDS as readonly string[]).includes(kind) ? BASE_TITLES[kind as PendingKind] : EXTRA_TITLES[kind as ExtraKind][lang]
}

function groupedLines<T extends { kind: AnyKind }>(items: T[], lang: PendingLang, line: (item: T) => string[]): string[] {
  const lines: string[] = []
  for (const kind of ALL_KINDS) {
    const rows = items.filter((item) => item.kind === kind)
    if (rows.length === 0) continue
    lines.push('', `${title(kind, lang)} (${rows.length})`, ...rows.flatMap(line))
  }
  return lines
}

/** The dry-run text. With no extra kinds pending it is the same text `brand:approve --all-pending --dry-run` printed before. */
export function formatEverythingDryRun(report: EverythingDryRun, lang: PendingLang = 'en'): string {
  const lines = [report.notice, 'This is a preview: not the review queue and not an approval result. No proof was read.']
  if (report.items.length === 0) lines.push('', 'Nothing is pending.')
  lines.push(
    ...groupedLines(report.items, lang, (item) => {
      const head = `  ${(item.decision === 'would_approve' ? 'would approve' : `would skip${item.because === 'stale' ? ' (stale)' : item.because === 'refused' ? ' (refused)' : ''}`).padEnd(24)} ${item.id}`
      if (item.summary === undefined) return [`${head}  ${item.reason}`]
      return [`${head}${item.revision ? ` r${item.revision}` : ''}  ${item.summary}`, ...(item.decision === 'would_approve' ? [] : [`      ${item.reason}`]), ...(item.look_first && item.review_with ? [`      ${item.review_with}`] : [])]
    }),
  )
  if (report.unmatched_excludes.length) lines.push('', `--exclude matched nothing pending: ${report.unmatched_excludes.join(', ')}`)
  lines.push('', `${report.notice} Run the same command without --dry-run to approve.`)
  return lines.join('\n')
}

export function formatEverything(result: EverythingResult, lang: PendingLang = 'en'): string {
  const lines =
    result.proof === 'rejected'
      ? ['APPROVAL REFUSED: proof rejected. Nothing was changed.']
      : result.proof === 'not_needed'
        ? ['NOTHING TO APPROVE: no proof was read and nothing was changed.']
        : [`APPROVAL RESULT: ${result.counts.approved} approved, ${result.counts.skipped} skipped, ${result.counts.refused} refused, ${result.counts.stale} stale. Nothing was published.`]
  if (result.results.length === 0) lines.push('', 'Nothing is pending.')
  lines.push(...groupedLines(result.results, lang, (item) => [`  ${item.outcome.padEnd(9)} ${item.id}${item.revision ? ` r${item.revision}` : ''}  ${item.reason}`]))
  if (result.unmatched_excludes.length) lines.push('', `--exclude matched nothing pending: ${result.unmatched_excludes.join(', ')}`)
  return lines.join('\n')
}

const PLAIN = {
  nothing: { en: 'Nothing is waiting for your approval.', fa: 'چیزی منتظر تأیید شما نیست.', tr: 'Onayınızı bekleyen bir şey yok.' },
  head: { en: '{n} item(s) are waiting for your approval.', fa: '{n} مورد منتظر تأیید شماست.', tr: 'Onayınızı bekleyen {n} öğe var.' },
  waiting: { en: 'needs your approval', fa: 'منتظر تأیید', tr: 'onay bekliyor' },
  blocked: { en: 'cannot be approved yet', fa: 'هنوز قابل تأیید نیست', tr: 'henüz onaylanamaz' },
  readFirst: { en: 'Read strategies and weeks in full first:', fa: 'اول استراتژی‌ها و هفته‌ها را کامل بخوانید:', tr: 'Önce stratejileri ve haftaları tam okuyun:' },
  one: { en: 'Approve all of the items marked "needs your approval" with one proof:', fa: 'همهٔ موارد «منتظر تأیید» را با یک بار وارد کردن رمز تأیید کنید:', tr: '"Onay bekliyor" olanların hepsini tek bir kanıtla onaylayın:' },
  narrow: { en: 'Only some kinds? Add --only strategy,week (or social, creative, aspect, fact, change, evidence, asset). Leave one out with --exclude <id>.', fa: 'فقط بعضی انواع؟ --only strategy,week (یا social، creative، aspect، fact، change، evidence، asset) را اضافه کنید. یک مورد را با --exclude <id> کنار بگذارید.', tr: 'Yalnızca bazı türler mi? --only strategy,week (veya social, creative, aspect, fact, change, evidence, asset) ekleyin. Birini --exclude <id> ile dışarıda bırakın.' },
  safe: { en: 'Nothing was changed. Approving publishes nothing and authorizes no post, schedule or spend.', fa: 'چیزی تغییر نکرد. تأیید چیزی را منتشر نمی‌کند و هیچ پست، زمان‌بندی یا هزینه‌ای را مجاز نمی‌کند.', tr: 'Hiçbir şey değişmedi. Onay hiçbir şey yayımlamaz; gönderiye, zamanlamaya veya harcamaya izin vermez.' },
} satisfies Record<string, Text>

/** `brand:pending`: the dry run in plain words, ending with the exact one command that approves it. */
export function formatPending(report: EverythingDryRun, lang: PendingLang = 'en'): string {
  const ready = report.items.filter((item) => item.decision === 'would_approve')
  if (report.items.length === 0) return PLAIN.nothing[lang]
  const lines = [fill(PLAIN.head[lang], { n: ready.length })]
  // Skips that share one reason (template example assets, for instance) are folded into one line.
  const shared = new Map<string, number>()
  for (const item of report.items) if (item.decision === 'would_skip' && item.summary === undefined) shared.set(`${item.kind}\0${item.reason}`, (shared.get(`${item.kind}\0${item.reason}`) ?? 0) + 1)
  const folded = new Set<string>()
  lines.push(
    ...groupedLines(report.items, lang, (item) => {
      const key = `${item.kind}\0${item.reason}`
      if (item.decision === 'would_skip' && item.summary === undefined && (shared.get(key) ?? 0) > 1) {
        if (folded.has(key)) return []
        folded.add(key)
        return [`  - ${shared.get(key)} × (${PLAIN.blocked[lang]}): ${item.reason}`]
      }
      const state = item.decision === 'would_approve' ? PLAIN.waiting[lang] : PLAIN.blocked[lang]
      const what = item.summary ?? item.reason
      return [`  - ${item.id}${item.revision ? ` r${item.revision}` : ''} (${state}): ${what}`, ...(item.decision === 'would_approve' || item.summary === undefined ? [] : [`      ${item.reason}`])]
    }),
  )
  const firsts = report.items.filter((item) => item.decision === 'would_approve' && item.look_first && item.review_with)
  if (firsts.length) lines.push('', PLAIN.readFirst[lang], ...firsts.map((item) => `  ${item.review_with}`))
  if (ready.length) lines.push('', PLAIN.one[lang], `  ${report.approve_with}`, '', PLAIN.narrow[lang])
  lines.push('', PLAIN.safe[lang])
  return lines.join('\n')
}
