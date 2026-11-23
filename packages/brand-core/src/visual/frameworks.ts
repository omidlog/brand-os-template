import path from 'node:path'
import { FRAMEWORK_REGISTRY_PATH, readRegistry, validateFrameworkRegistry, type FrameworkRegistry } from './framework-registry.js'
import type { FrameworkRef } from './model.js'

/**
 * The renderers' view of the framework registry: the copy that ships with this template code (not the brand
 * repository's copy), so a page can only cite a framework this code knows how to draw.
 */
const TEMPLATE_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..')

let cached: ReadonlyMap<string, FrameworkRef> | null = null

/** The template's own registry, validated once. Throws when it is invalid, so a bad registry fails CI loudly. */
export function frameworkRegistry(): ReadonlyMap<string, FrameworkRef> {
  if (cached) return cached
  const { doc, schema } = readRegistry(TEMPLATE_ROOT)
  const errors = validateFrameworkRegistry(doc, schema)
  if (errors.length) throw new Error(`Invalid framework registry: ${errors.join('; ')}`)
  cached = new Map((doc as FrameworkRegistry).frameworks.map((ref) => [ref.framework_id, Object.freeze({ ...ref })]))
  return cached
}

export function frameworkRef(id: string): FrameworkRef {
  const ref = frameworkRegistry().get(id)
  if (!ref) throw new Error(`Framework ${id} is not in ${FRAMEWORK_REGISTRY_PATH}`)
  return ref
}

/**
 * Business Model Canvas registry entry. The nine-zone logic is drawn as an original layout; Strategyzer's own
 * artwork is not copied and no licence is implied. Claim: informed by, never "official" or "certified".
 */
export const BMC_FRAMEWORK: FrameworkRef = frameworkRef('BMC')
