import fs from 'node:fs'
import path from 'node:path'
import { allQuestions } from './content/index.js'
import { readYaml } from './fsutil.js'
import type { FieldQuestion } from './types.js'

/**
 * The engine owns every template definition: the question bank, the field registry and knowledge graph built from
 * it, the starter profiles, the mascot catalog rows, module guidance pages, schemas and the EXAMPLE base tokens.
 * A brand repository stores only its own data plus `brand/overrides/` for the definitions it really changed, so an
 * engine update never needs a migration to reach a brand (it is read from the engine at run time).
 *
 * Files the engine ships beside its code (schemas, base tokens) live in one assets folder: the bundled engine sets
 * BRAND_OS_ENGINE_ASSETS to `.brand-os/engine/assets`; in this monorepo they are found next to the sources.
 */
export function engineAssetPath(...parts: string[]): string {
  const assets = process.env.BRAND_OS_ENGINE_ASSETS
  if (assets) return path.join(assets, ...parts)
  // packages/brand-core/src → repository root, where schemas/ lives in the monorepo.
  return path.join(path.resolve(import.meta.dirname, '..', '..', '..'), ...parts)
}

/** A schema the engine ships (`schemas/<name>`). */
export function engineSchemaPath(name: string): string {
  return engineAssetPath('schemas', name)
}

let cachedQuestions: FieldQuestion[] | null = null

/** Every question the engine defines, in asking order. Read from code, never from a brand copy. */
export function engineQuestions(): FieldQuestion[] {
  cachedQuestions ??= [...allQuestions()].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return cachedQuestions
}

/** Folder for a brand's own changes to engine definitions. */
export function overridesDir(root: string, ...parts: string[]): string {
  return path.join(root, 'brand', 'overrides', ...parts)
}

/**
 * Template definitions an older brand repository still carries as copies under `brand/`. They are no longer read;
 * `brand:convert` removes the ones that match the engine and moves real edits into `brand/overrides/`.
 */
export const LEGACY_DEFINITION_PATHS = [
  'brand/interview/question-bank',
  'brand/interview/field-registry.yaml',
  'brand/interview/knowledge-graph.yaml',
] as const

/** Which legacy definition copies exist in this brand repository (relative paths). */
export function legacyDefinitionCopies(root: string): string[] {
  return LEGACY_DEFINITION_PATHS.filter((relative) => fs.existsSync(path.join(root, relative)))
}

/** Reads a YAML file when it exists, otherwise returns null. */
export function readYamlIfExists<T>(file: string): T | null {
  return fs.existsSync(file) ? readYaml<T>(file) : null
}
