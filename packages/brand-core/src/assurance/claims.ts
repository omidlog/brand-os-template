/**
 * What a Brand OS output may say about a method or a standard.
 *
 * The six levels are a ladder, not a set of synonyms. `reference_only` means we named a source.
 * `certified` means an accredited body issued a certificate for a named scope and dates. Nothing in
 * this repository can move an entry up the ladder: the level a method may be cited at is the lowest
 * of what it declares, what its rules access allows, and what a human actually verified.
 *
 * None of this is a legal opinion. It is a gate that makes the unsafe wording unavailable.
 */

export const CLAIM_LEVELS = ['reference_only', 'informed_by', 'mapped_to', 'internally_assessed', 'externally_reviewed', 'certified'] as const
export type ClaimLevel = (typeof CLAIM_LEVELS)[number]

const RANK: Record<ClaimLevel, number> = {
  reference_only: 0,
  informed_by: 1,
  mapped_to: 2,
  internally_assessed: 3,
  externally_reviewed: 4,
  certified: 5,
}

export function claimRank(level: ClaimLevel): number {
  return RANK[level]
}

/** The weaker of two levels. The only way levels ever combine. */
export function lowerClaim(a: ClaimLevel, b: ClaimLevel): ClaimLevel {
  return RANK[a] <= RANK[b] ? a : b
}

/**
 * How the assessment rules themselves are available to us.
 * - `authored`: we wrote them (an original Brand OS method).
 * - `licensed`: a rights holder granted use of the requirements for this purpose, in writing.
 * - `reference_only`: the source is publicly readable and citable, but we have not mapped its requirements.
 * - `unlicensed`: the requirements are copyrighted and we hold no rights to assess against them.
 */
export const RULES_ACCESS = ['authored', 'licensed', 'reference_only', 'unlicensed'] as const
export type RulesAccess = (typeof RULES_ACCESS)[number]

/**
 * The highest claim rules access alone can support. `externally_reviewed` and `certified` are never
 * reachable from rules access: they need an attestation by someone who is not us.
 */
export const RULES_ACCESS_CAP: Record<RulesAccess, ClaimLevel> = {
  authored: 'internally_assessed',
  licensed: 'internally_assessed',
  reference_only: 'informed_by',
  unlicensed: 'reference_only',
}

export const LICENSE_STATUSES = ['original_brand_os', 'open_permitted', 'rights_cleared', 'reference_only', 'blocked_pending_review'] as const
export type LicenseStatus = (typeof LICENSE_STATUSES)[number]

/**
 * Evidence that an identified third party reviewed or certified a named scope. Null in this release:
 * nothing in the template has been externally reviewed or certified, so nothing may say so.
 */
export interface Attestation {
  /** The reviewing or certifying organisation, named. */
  issuer: string
  /** Exactly what was reviewed or certified. Never "the product". */
  scope: string
  /** Certificate or report identifier. */
  reference: string
  issued_at: string
  expires_at: string | null
  /** How a reader can check it with the issuer, not with us. */
  verification_url: string | null
}

export interface ClaimSubject {
  declared_claim_level: ClaimLevel
  rules_access: RulesAccess
  /** Null until a person checked the official source page. */
  checked_at: string | null
  /** Null until a person recorded which edition they checked. */
  edition: string | null
  attestation: Attestation | null
}

/** Stable English codes. Human text lives in `assurance/i18n.ts`. */
export const CLAIM_CAP_REASONS = ['rules_access', 'edition_unverified', 'source_unverified', 'no_attestation'] as const
export type ClaimCapReason = (typeof CLAIM_CAP_REASONS)[number]

export interface ClaimDecision {
  /** The level this method may actually be cited at. */
  level: ClaimLevel
  /** Why it is not the declared level. Empty when the declaration stands. */
  capped_by: ClaimCapReason[]
}

/**
 * The gate. An unverified edition or an unchecked source drops a method to `reference_only`, whatever
 * it declares, because citing an edition nobody checked is itself an unsupported claim.
 */
export function effectiveClaim(subject: ClaimSubject): ClaimDecision {
  const capped: ClaimCapReason[] = []
  let level = subject.declared_claim_level

  const accessCap = RULES_ACCESS_CAP[subject.rules_access]
  if (RANK[accessCap] < RANK[level]) {
    level = accessCap
    capped.push('rules_access')
  }
  if (subject.edition === null && RANK[level] > RANK.reference_only) {
    level = 'reference_only'
    capped.push('edition_unverified')
  }
  if (subject.checked_at === null && RANK[level] > RANK.reference_only) {
    level = 'reference_only'
    capped.push('source_unverified')
  }
  if (subject.attestation === null && RANK[level] > RANK.internally_assessed) {
    level = 'internally_assessed'
    capped.push('no_attestation')
  }
  return { level, capped_by: capped }
}

/**
 * Whether a method may be assessed against at all. `reference_only` and `informed_by` methods have no
 * usable requirement set here, so their controls are reported `blocked_by_license` rather than passed
 * or failed. Not knowing a rule is not the same as failing it.
 */
export function assessable(decision: ClaimDecision): boolean {
  return RANK[decision.level] >= RANK.internally_assessed
}

export function isClaimLevel(value: unknown): value is ClaimLevel {
  return typeof value === 'string' && (CLAIM_LEVELS as readonly string[]).includes(value)
}
