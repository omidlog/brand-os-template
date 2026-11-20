import fs from 'node:fs'
import path from 'node:path'
import { readYaml } from './fsutil.js'
import type { FieldQuestion } from './types.js'

/**
 * Interview profiles narrow the question bank to a named subset. `brand.profile` in
 * brand.config.yaml selects one. `universal`, or any profile without a file in
 * brand/interview/profiles/, means the full bank, so existing configs keep working.
 */
export const UNIVERSAL_PROFILE = 'universal'

export interface InterviewProfile {
  id: string
  title: string
  description: string
  question_ids: string[]
}

const PROFILE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function profilesDir(root: string): string {
  return path.join(root, 'brand', 'interview', 'profiles')
}

export function listProfiles(root: string): string[] {
  const dir = profilesDir(root)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.yaml'))
    .map((name) => name.slice(0, -'.yaml'.length))
    .filter((id) => PROFILE_ID.test(id))
    .sort()
}

/** The profile's question subset, or null when the profile means "every question". */
export function loadProfile(root: string, id: string | null | undefined): InterviewProfile | null {
  if (!id || id === UNIVERSAL_PROFILE || !PROFILE_ID.test(id)) return null
  const file = path.join(profilesDir(root), `${id}.yaml`)
  if (!fs.existsSync(file)) return null
  const doc = readYaml<Partial<InterviewProfile>>(file)
  return {
    id,
    title: typeof doc.title === 'string' ? doc.title : id,
    description: typeof doc.description === 'string' ? doc.description : '',
    question_ids: Array.isArray(doc.question_ids) ? doc.question_ids.filter((item): item is string => typeof item === 'string') : [],
  }
}

/** Validation for every profile file: ids exist, no duplicates, and dependencies stay inside the profile. */
export function profileErrors(root: string, questions: FieldQuestion[]): string[] {
  const errors: string[] = []
  const dir = profilesDir(root)
  if (!fs.existsSync(dir)) return errors
  const byId = new Map(questions.map((question) => [question.id, question]))
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.yaml'))) {
    const id = name.slice(0, -'.yaml'.length)
    if (!PROFILE_ID.test(id)) {
      errors.push(`Interview profile file ${name} must be named with lowercase letters, numbers and hyphens`)
      continue
    }
    const doc = readYaml<Partial<InterviewProfile>>(path.join(dir, name))
    if (doc.id !== id) errors.push(`Interview profile ${name} must declare id: ${id}`)
    const ids = Array.isArray(doc.question_ids) ? doc.question_ids : []
    if (ids.length === 0) errors.push(`Interview profile ${id} lists no questions`)
    const seen = new Set<string>()
    for (const questionId of ids) {
      if (typeof questionId !== 'string') {
        errors.push(`Interview profile ${id} has a non-string question id`)
        continue
      }
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
  return PROFILE_ID.test(id) && fs.existsSync(path.join(profilesDir(root), `${id}.yaml`))
}
