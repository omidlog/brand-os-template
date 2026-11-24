import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { buildMascotCatalog, CANONICAL_ANGLES, EXAMPLE_STAGES } from './content/mascot-catalog.js'

type Row = Record<string, unknown>

/**
 * Mascot definitions are engine data; a brand keeps its own `brand/mascot/*.yaml` only once it tracks mascot state
 * (statuses, artwork) or changes the stages. Each reader returns the brand's file when it exists, otherwise the
 * engine's definition, so a brand without a mascot never needs the 90-row catalog in its repository.
 */
function brandRows(root: string, relative: string, key: string): Row[] | null {
  const file = path.join(root, relative)
  if (!fs.existsSync(file)) return null
  const doc = parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown> | null
  const rows = doc && typeof doc === 'object' ? doc[key] : null
  return Array.isArray(rows) ? (rows as Row[]) : []
}

export function readMascotStates(root: string): Row[] {
  return brandRows(root, 'brand/mascot/catalog.yaml', 'states') ?? (buildMascotCatalog() as unknown as Row[])
}

export function readMascotStages(root: string): Row[] {
  return brandRows(root, 'brand/mascot/stages.yaml', 'stages') ?? (EXAMPLE_STAGES as unknown as Row[])
}

export function readMascotAngles(root: string): Row[] {
  return brandRows(root, 'brand/mascot/angles.yaml', 'angles') ?? (CANONICAL_ANGLES as unknown as Row[])
}
