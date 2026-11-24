import fs from 'node:fs'
import path from 'node:path'
import { tokenBaseDir } from '@brand-os/design-tokens'

/**
 * Copies the engine's EXAMPLE base token files into a fixture's `brand/tokens/`. Most tests do not need this:
 * `compileTokens` falls back to the engine's base files when a brand has none. Tests that edit a base file in
 * place (to test drift or overrides) use it to get their own copy. It never reads a brand repository's own
 * `brand/tokens/generated/` or `approvals.yaml`, which are real brand data. `_repo` is kept for older callers.
 */
export function copyTemplateTokens(_repo: string, root: string): void {
  const from = tokenBaseDir()
  const to = path.join(root, 'brand', 'tokens')
  fs.mkdirSync(to, { recursive: true })
  for (const name of fs.readdirSync(from)) {
    if (name.endsWith('.json')) fs.copyFileSync(path.join(from, name), path.join(to, name))
  }
}
