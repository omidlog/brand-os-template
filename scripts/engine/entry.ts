import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENGINE_COMMANDS } from './commands.js'

/**
 * `brand-os <command> [args]`: the single entry of the bundled engine committed in a data-only brand repository at
 * `.brand-os/engine/brand-os.mjs`. It points the engine at its own assets, then runs the same script the template
 * runs, with the same arguments. The brand root is always the current directory.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const assets = path.join(here, 'assets')
if (fs.existsSync(assets)) process.env.BRAND_OS_ENGINE_ASSETS ??= assets
const versionFile = path.join(here, 'VERSION')
if (fs.existsSync(versionFile)) process.env.BRAND_OS_ENGINE_VERSION ??= fs.readFileSync(versionFile, 'utf8').trim()

const loaders: Record<string, () => Promise<unknown>> = {
  brand: () => import('../brand.js'),
  coach: () => import('../coach.js'),
  knowledge: () => import('../knowledge.js'),
  creative: () => import('../creative.js'),
  seo: () => import('../seo.js'),
  strategy: () => import('../strategy.js'),
  competitive: () => import('../competitive.js'),
  identity: () => import('../identity.js'),
  'visual-dna': () => import('../visual-dna.js'),
  content: () => import('../content.js'),
  runtime: () => import('../runtime.js'),
  acceptance: () => import('../acceptance.js'),
  assurance: () => import('../assurance.js'),
  'assurance-review': () => import('../assurance-review.js'),
  'assurance-link': () => import('../assurance-link.js'),
  'export-visual': () => import('../export-visual.js'),
  mcp: () => import('../mcp.js'),
  validate: () => import('../validate.js'),
  'tokens-build': () => import('../../packages/design-tokens/src/cli.js'),
  'prepare-docs': () => import('../prepare-docs.js'),
  check: () => import('./check.js'),
  scaffold: () => import('./scaffold-cli.js'),
  convert: () => import('./convert-cli.js'),
}

const [command, ...args] = process.argv.slice(2)
if (command === undefined || command === 'help' || command === '--help') {
  console.log(`Brand OS engine ${process.env.BRAND_OS_ENGINE_VERSION ?? '(development)'}\nUsage: brand-os <command> [args]\nCommands: ${Object.keys(ENGINE_COMMANDS).sort().join(', ')}\nIn a brand repository use the npm scripts (npm run brand:interview, npm run check …).`)
  process.exit(command === undefined ? 1 : 0)
}
if (command === 'version' || command === '--version') {
  console.log(process.env.BRAND_OS_ENGINE_VERSION ?? 'development')
  process.exit(0)
}
const spec = ENGINE_COMMANDS[command]
if (!spec) {
  console.error(`Unknown command ${command}. Run brand-os help for the list.`)
  process.exit(2)
}
const load = loaders[spec.script]
if (!load) throw new Error(`No loader for ${spec.script}`)
// The scripts read process.argv like a direct `tsx scripts/<name>.ts` run. Scripts that check whether they are the
// entry point see their own name in argv[1] or BRAND_OS_ENTRY.
process.argv = [process.argv[0] ?? 'node', path.join(here, spec.entry ?? spec.script), ...spec.prefix, ...args]
if (spec.entry) process.env.BRAND_OS_ENTRY = spec.entry
await load()
