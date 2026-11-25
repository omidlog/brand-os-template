/**
 * Font roles across brands and locales.
 *
 * The approved `brand.type.scale` fact names font roles freely, and a multilingual brand usually names them per
 * locale (`display-fa`, `body-fa`, `display-en`, `body-en`). Semantic consumers (the social style kit, the template
 * base tokens, components) refer to the stable ids `type.fontFamily.display`, `type.fontFamily.body` and
 * `type.fontFamily.mono`. These helpers connect the two, the same way for every brand:
 *
 * - `fontAliasSources` picks, per stable id, the brand role whose family it should carry: the role of that exact
 *   name, else a synonym without a locale, else the role for the brand's default locale, else the first listed one.
 *   `brand:tokens:generate` emits the stable ids as draft tokens from those roles, so no consumer falls back to the
 *   template's EXAMPLE families once the fact is approved. `mono` is emitted only when the fact has a mono role.
 * - `localizedFontRef` resolves a font token id for one content language: `type.fontFamily.display` in a Persian
 *   design becomes `type.fontFamily.display-fa` when that token exists, else the stable id stays.
 */

export const FONT_ALIAS_ROLES = ['display', 'body', 'mono'] as const
export type FontAliasRole = (typeof FONT_ALIAS_ROLES)[number]

/** Role names that mean the same thing, in order of preference. The first is the stable id. */
export const FONT_ROLE_SYNONYMS: Record<FontAliasRole, readonly string[]> = {
  display: ['display', 'heading', 'headline', 'title'],
  body: ['body', 'text', 'sans'],
  mono: ['mono', 'code', 'monospace'],
}

const FONT_FAMILY_PREFIX = 'type.fontFamily.'
const LOCALE_SUFFIX = /^([A-Za-z][A-Za-z0-9]*?)[-_]([a-z]{2,3})$/

/** `display-fa` → {base: display, locale: fa}; a role without a locale suffix → {base: role, locale: null}. */
export function splitFontRole(role: string): { base: string; locale: string | null } {
  const match = LOCALE_SUFFIX.exec(role)
  if (match && match[1] && match[2]) return { base: match[1].toLowerCase(), locale: match[2] }
  return { base: role.toLowerCase(), locale: null }
}

function aliasOf(base: string): FontAliasRole | null {
  for (const alias of FONT_ALIAS_ROLES) if (FONT_ROLE_SYNONYMS[alias].includes(base)) return alias
  return null
}

/** The primary language subtag (`fa-IR` → `fa`), lower case. */
export function primaryLocale(locale: string | null | undefined): string | null {
  if (typeof locale !== 'string' || !locale) return null
  return locale.split(/[-_]/)[0]!.toLowerCase()
}

export interface FontAliasSource {
  alias: FontAliasRole
  /** The fact role the alias carries, for example `display-fa`. */
  role: string
  /** Why this role: `synonym` (no locale), `default_locale` or `first_listed`. */
  reason: 'synonym' | 'default_locale' | 'first_listed'
}

/**
 * Which stable ids to emit, and from which fact role. `roles` is the fact's role order. A stable id the fact already
 * names exactly (a role called `display`) needs no alias and is left out.
 */
export function fontAliasSources(roles: readonly string[], defaultLocale: string | null | undefined): FontAliasSource[] {
  const lower = roles.map((role) => role.toLowerCase())
  const locale = primaryLocale(defaultLocale)
  const out: FontAliasSource[] = []
  for (const alias of FONT_ALIAS_ROLES) {
    if (lower.includes(alias)) continue
    const candidates = roles
      .map((role, index) => ({ role, index, ...splitFontRole(role) }))
      .filter((item) => aliasOf(item.base) === alias)
    if (candidates.length === 0) continue
    const rank = (base: string) => FONT_ROLE_SYNONYMS[alias].indexOf(base)
    const plain = candidates.filter((item) => item.locale === null).sort((a, b) => rank(a.base) - rank(b.base) || a.index - b.index)[0]
    if (plain) {
      out.push({ alias, role: plain.role, reason: 'synonym' })
      continue
    }
    const local = locale ? candidates.filter((item) => item.locale === locale).sort((a, b) => rank(a.base) - rank(b.base) || a.index - b.index)[0] : undefined
    if (local) {
      out.push({ alias, role: local.role, reason: 'default_locale' })
      continue
    }
    out.push({ alias, role: candidates[0]!.role, reason: 'first_listed' })
  }
  return out
}

/**
 * The font token id to use for one content language. `type.fontFamily.display` with lang `fa` becomes
 * `type.fontFamily.display-fa` (or a synonym such as `heading-fa`) when `exists` says that token is there. Any other
 * id, or a language without its own token, stays as it is.
 */
export function localizedFontRef(ref: string, lang: string | null | undefined, exists: (id: string) => boolean): string {
  const locale = primaryLocale(lang)
  if (!locale || !ref.startsWith(FONT_FAMILY_PREFIX)) return ref
  const role = ref.slice(FONT_FAMILY_PREFIX.length)
  const { base, locale: own } = splitFontRole(role)
  if (own !== null) return ref
  const alias = aliasOf(base)
  const bases = alias ? [base, ...FONT_ROLE_SYNONYMS[alias].filter((item) => item !== base)] : [base]
  for (const candidate of bases) {
    for (const sep of ['-', '_']) {
      const id = `${FONT_FAMILY_PREFIX}${candidate}${sep}${locale}`
      if (exists(id)) return id
    }
  }
  return ref
}
