import fs from 'node:fs'
import path from 'node:path'
import { readYaml } from './fsutil.js'
import { STARTER_PROFILES } from './content/profiles.js'
import type { FieldQuestion } from './types.js'

/**
 * Interview profiles narrow the question bank to a named subset. `brand.profile` in
 * brand.config.yaml selects one. The engine ships the starter profiles (`STARTER_PROFILES`); a brand changes one
 * with `brand/overrides/profiles/<id>.yaml`. `universal`, or an unknown profile, means the full bank.
 */
export const UNIVERSAL_PROFILE = 'universal'

export interface InterviewProfile {
  id: string
  title: string
  description: string
  question_ids: string[]
  /**
   * When true, questions outside the profile are not applicable for completeness: they are neither
   * required nor missing. A person-only brand then never reports a company legal name or a SaaS
   * stack as missing work. They can still be answered by id. Defaults to false, so `founder-core`
   * keeps scoring the whole bank as before.
   */
  exclusive?: boolean
  /**
   * Questions that join the profile only when the brand selected one of these personal facets, for example the
   * practice questions (partners, resources, costs, risks, SWOT, customer journey) for a founder or consultant.
   */
  facet_questions?: Array<{ facets: string[]; question_ids: string[] }>
}

const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Folder of an older brand's full profile copies. Still read (as the base) until brand:convert removes them. */
export function profilesDir(root: string): string {
  return path.join(root, 'brand', 'interview', 'profiles')
}

/** Folder of a brand's own profile changes: `<id>.yaml` with `add` / `remove` (or a full `question_ids`). */
export function profileOverridesDir(root: string): string {
  return path.join(root, 'brand', 'overrides', 'profiles')
}

/**
 * A brand's change to a profile. `question_ids` replaces the list; otherwise `add` and `remove` change the engine's
 * starter list (or the brand's older full copy). A profile id the engine does not ship needs `question_ids`.
 */
export interface ProfileOverride {
  id?: string
  title?: string
  description?: string
  exclusive?: boolean
  question_ids?: string[]
  add?: string[]
  remove?: string[]
}

function yamlIds(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .filter((id) => PROFILE_ID.test(id))
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** Every profile this brand can use: the engine's starters, older copies and the brand's own overrides. */
export function listProfiles(root: string): string[] {
  return [...new Set([...STARTER_PROFILES.map((profile) => profile.id), ...yamlIds(profilesDir(root)), ...yamlIds(profileOverridesDir(root))])].sort()
}

function readOverride(root: string, id: string): ProfileOverride | null {
  const file = path.join(profileOverridesDir(root), `${id}.yaml`)
  return fs.existsSync(file) ? (readYaml<ProfileOverride>(file) ?? {}) : null
}

function baseProfile(root: string, id: string): InterviewProfile | null {
  // An older brand's full copy stays authoritative until brand:convert turns its edits into an override.
  const legacy = path.join(profilesDir(root), `${id}.yaml`)
  if (fs.existsSync(legacy)) {
    const doc = readYaml<Partial<InterviewProfile>>(legacy)
    return {
      id,
      title: typeof doc.title === 'string' ? doc.title : id,
      description: typeof doc.description === 'string' ? doc.description : '',
      question_ids: strings(doc.question_ids),
      exclusive: doc.exclusive === true,
    }
  }
  const starter = STARTER_PROFILES.find((profile) => profile.id === id)
  if (!starter) return null
  return { id, title: starter.title, description: starter.description, question_ids: [...starter.question_ids], exclusive: starter.exclusive === true }
}

/** The brand's selected personal facets (empty when the personal module is off or not configured). */
function selectedFacets(root: string): string[] {
  const file = path.join(root, 'brand', 'brand.config.yaml')
  if (!fs.existsSync(file)) return []
  const config = readYaml<{ modules?: { personal?: { enabled?: unknown; facets?: unknown } } }>(file)
  const personal = config?.modules?.personal
  return personal?.enabled === true && Array.isArray(personal.facets) ? personal.facets.filter((facet): facet is string => typeof facet === 'string') : []
}

/** Adds the facet questions of the engine's starter profile when the brand selected one of their facets. */
function withFacetQuestions(root: string, profile: InterviewProfile | null): InterviewProfile | null {
  if (!profile) return profile
  const starter = STARTER_PROFILES.find((item) => item.id === profile.id)
  const rules = starter?.facet_questions ?? []
  if (!rules.length) return profile
  const facets = selectedFacets(root)
  const ids = [...profile.question_ids]
  for (const rule of rules) {
    if (!rule.facets.some((facet) => facets.includes(facet))) continue
    for (const questionId of rule.question_ids) if (!ids.includes(questionId)) ids.push(questionId)
  }
  return { ...profile, question_ids: ids }
}

/** The profile's question subset, or null when the profile means "every question". */
export function loadProfile(root: string, id: string | null | undefined): InterviewProfile | null {
  return withFacetQuestions(root, resolveProfile(root, id))
}

function resolveProfile(root: string, id: string | null | undefined): InterviewProfile | null {
  if (!id || id === UNIVERSAL_PROFILE || !PROFILE_ID.test(id)) return null
  const base = baseProfile(root, id)
  const override = readOverride(root, id)
  if (!override) return base
  let ids = override.question_ids !== undefined ? strings(override.question_ids) : [...(base?.question_ids ?? [])]
  if (override.question_ids === undefined && !base) return null
  const remove = new Set(strings(override.remove))
  ids = ids.filter((questionId) => !remove.has(questionId))
  for (const questionId of strings(override.add)) if (!ids.includes(questionId)) ids.push(questionId)
  return {
    id,
    title: typeof override.title === 'string' ? override.title : (base?.title ?? id),
    description: typeof override.description === 'string' ? override.description : (base?.description ?? ''),
    question_ids: ids,
    exclusive: typeof override.exclusive === 'boolean' ? override.exclusive : base?.exclusive === true,
  }
}

/** Question ids that count for completeness, or null when every question in the bank counts. */
export function completenessScope(profile: InterviewProfile | null): Set<string> | null {
  return profile?.exclusive ? new Set(profile.question_ids) : null
}

/** Validation for every profile: ids exist, no duplicates, and dependencies stay inside the profile. */
export function profileErrors(root: string, questions: FieldQuestion[]): string[] {
  const errors: string[] = []
  const byId = new Map(questions.map((question) => [question.id, question]))
  for (const dir of [profilesDir(root), profileOverridesDir(root)]) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.yaml'))) {
      if (!PROFILE_ID.test(name.slice(0, -'.yaml'.length))) errors.push(`Interview profile file ${path.relative(root, path.join(dir, name))} must be named with lowercase letters, numbers and hyphens`)
    }
  }
  for (const id of listProfiles(root)) {
    const legacy = path.join(profilesDir(root), `${id}.yaml`)
    if (fs.existsSync(legacy)) {
      const doc = readYaml<Partial<InterviewProfile>>(legacy)
      if (doc.id !== id) errors.push(`Interview profile ${id}.yaml must declare id: ${id}`)
      if (doc.exclusive !== undefined && typeof doc.exclusive !== 'boolean') errors.push(`Interview profile ${id}: exclusive must be true or false`)
      if (Array.isArray(doc.question_ids) && doc.question_ids.some((item) => typeof item !== 'string')) errors.push(`Interview profile ${id} has a non-string question id`)
    }
    const override = readOverride(root, id)
    if (override) {
      for (const key of ['question_ids', 'add', 'remove'] as const) {
        const value = override[key]
        if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) errors.push(`Profile override ${id}: ${key} must be a list of question ids`)
      }
      if (override.exclusive !== undefined && typeof override.exclusive !== 'boolean') errors.push(`Profile override ${id}: exclusive must be true or false`)
      if (override.question_ids === undefined && !baseProfile(root, id)) errors.push(`Profile override ${id} changes a profile the engine does not ship; give the full question_ids`)
      for (const questionId of [...strings(override.add), ...strings(override.remove)]) {
        if (!byId.has(questionId)) errors.push(`Profile override ${id} names missing question ${questionId}`)
      }
    }
    const profile = loadProfile(root, id)
    if (!profile) continue
    const ids = profile.question_ids
    if (ids.length === 0) errors.push(`Interview profile ${id} lists no questions`)
    const seen = new Set<string>()
    for (const questionId of ids) {
      if (seen.has(questionId)) errors.push(`Interview profile ${id} lists ${questionId} twice`)
      seen.add(questionId)
      const question = byId.get(questionId)
      if (!question) {
        errors.push(`Interview profile ${id} points at missing question ${questionId}`)
        continue
      }
      for (const dependency of question.depends_on) {
        if (!ids.includes(dependency)) errors.push(`Interview profile ${id}: ${questionId} depends on ${dependency}, which is not in the profile`)
      }
    }
  }
  return errors
}

/** A profile named in brand.config.yaml must be `universal` or have a file; otherwise a typo would silently widen the interview. */
export function profileExists(root: string, id: string | null | undefined): boolean {
  if (!id || id === UNIVERSAL_PROFILE) return true
  return PROFILE_ID.test(id) && listProfiles(root).includes(id) && loadProfile(root, id) !== null
}
