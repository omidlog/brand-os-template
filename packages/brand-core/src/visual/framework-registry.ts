import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { parse } from 'yaml'
import type { FrameworkRef } from './model.js'

/**
 * Framework registry (Visual Blueprint D5): `.brand-os/frameworks.yaml`, validated against
 * `schemas/framework-registry.schema.json` plus the claim rules below. Metadata only, never a fact store.
 *
 * The renderers read the registry that ships with this template code (not the brand repository's copy), so a
 * page can only cite a framework this code knows how to draw. `npm run validate` checks a repository's own copy.
 */
export const FRAMEWORK_REGISTRY_PATH = '.brand-os/frameworks.yaml'
export const FRAMEWORK_REGISTRY_SCHEMA_PATH = 'schemas/framework-registry.schema.json'

/** Claims that state a checked relationship need a person to have checked the source on a recorded date. */
const CLAIMS_NEEDING_CHECK = new Set(['aligned_with', 'verified_against'])

/** Words a registry entry may never use about itself: it describes a method, it does not certify anything. */
const FORBIDDEN_WORDS = /\b(certified|certification|compliant|compliance|conformant|conformance|official)\b/i

export interface FrameworkRegistry {
  schema_version: 1
  frameworks: FrameworkRef[]
}

/**
 * Schema and claim errors for a parsed registry document. Empty when valid.
 * `externally_certified` is refused outright: Brand OS has no evidence model for a certificate.
 */
export function validateFrameworkRegistry(doc: unknown, schema: object): string[] {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)
  if (!(validate(doc) as boolean)) return [`${FRAMEWORK_REGISTRY_PATH}: ${ajv.errorsText(validate.errors)}`]
  const errors: string[] = []
  const seen = new Set<string>()
  for (const ref of (doc as FrameworkRegistry).frameworks) {
    const at = `${FRAMEWORK_REGISTRY_PATH} ${ref.framework_id}`
    if (seen.has(ref.framework_id)) errors.push(`${at}: duplicate framework_id`)
    seen.add(ref.framework_id)
    if (ref.permitted_claim === 'externally_certified') errors.push(`${at}: externally_certified needs certificate evidence that Brand OS does not model; use informed_by`)
    if (CLAIMS_NEEDING_CHECK.has(ref.permitted_claim) && !ref.verified_on) errors.push(`${at}: ${ref.permitted_claim} needs verified_on (the date a person checked the source)`)
    if (ref.permitted_claim === 'original_professional_template' && ref.authority !== 'Brand OS') errors.push(`${at}: original_professional_template is only for Brand OS's own layouts`)
    if (ref.verified_on && !Number.isFinite(Date.parse(`${ref.verified_on}T00:00:00Z`))) errors.push(`${at}: verified_on is not a date`)
    for (const field of ['title', 'usage_note', 'edition'] as const) {
      // "not an accessibility audit or a conformance claim" is a disclaimer; only flag positive use.
      const text = ref[field].replace(/\b(?:not|no|never)\b[^.;]*?\b(?:certified|certification|compliant|compliance|conformant|conformance|official)\b/gi, '')
      if (FORBIDDEN_WORDS.test(text)) errors.push(`${at}: ${field} must not claim certification, compliance or official status`)
    }
  }
  return errors
}

export function readRegistry(root: string): { doc: unknown; schema: object } {
  const doc = parse(fs.readFileSync(path.join(root, FRAMEWORK_REGISTRY_PATH), 'utf8')) as unknown
  const schema = JSON.parse(fs.readFileSync(path.join(root, FRAMEWORK_REGISTRY_SCHEMA_PATH), 'utf8')) as object
  return { doc, schema }
}

/** Errors for a repository's registry; a repository without one (an older brand) gets a warning instead. */
export function frameworkRegistryErrors(root: string): { errors: string[]; warnings: string[] } {
  if (!fs.existsSync(path.join(root, FRAMEWORK_REGISTRY_PATH))) return { errors: [], warnings: [`${FRAMEWORK_REGISTRY_PATH} is missing; a template update restores it`] }
  try {
    const { doc, schema } = readRegistry(root)
    return { errors: validateFrameworkRegistry(doc, schema), warnings: [] }
  } catch (error) {
    return { errors: [`${FRAMEWORK_REGISTRY_PATH}: ${error instanceof Error ? error.message : String(error)}`], warnings: [] }
  }
}

