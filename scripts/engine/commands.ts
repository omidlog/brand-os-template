/**
 * The engine CLI's command table. Each `brand-os <command>` runs one of the scripts this repository already has, with
 * the same arguments, so a data-only brand repository keeps every `npm run brand:*` name it had before.
 *
 * `script` is the module under scripts/ (or a package CLI); `prefix` is put in front of the user's arguments.
 */
export interface EngineCommand {
  script: string
  prefix: string[]
  /** The npm script name a brand repository maps to this command; null when a brand does not get a script for it. */
  npm: string | null
  /** Set for scripts that only run when they recognise themselves as the entry point. */
  entry?: string
}

const BRAND_SUBCOMMANDS = [
  'init', 'interview', 'resume', 'next', 'propose', 'status', 'review', 'export', 'approve', 'publish', 'document',
  'tokens:generate', 'tokens:approve', 'tokens:publish', 'assets', 'query', 'agent-token', 'doctor', 'finance', 'backup',
  'restore', 'migrate', 'evidence', 'retract', 'reset',
] as const

const OWN_SCRIPTS = [
  'coach', 'knowledge', 'creative', 'seo', 'strategy', 'competitive', 'identity', 'visual-dna', 'content', 'social', 'runtime',
  'acceptance', 'assurance', 'assurance-review', 'assurance-link',
] as const

export const ENGINE_COMMANDS: Record<string, EngineCommand> = {
  ...Object.fromEntries(BRAND_SUBCOMMANDS.map((sub) => [sub, { script: 'brand', prefix: [sub], npm: `brand:${sub}` }])),
  // brand:validate (the brand CLI's validate) and validate (the repository check) are different commands.
  'brand-validate': { script: 'brand', prefix: ['validate'], npm: 'brand:validate' },
  ...Object.fromEntries(OWN_SCRIPTS.map((name) => [name, { script: name, prefix: [], npm: `brand:${name}` }])),
  'export-visual': { script: 'export-visual', prefix: [], npm: 'brand:export-visual', entry: 'export-visual' },
  mcp: { script: 'mcp', prefix: [], npm: 'mcp:serve' },
  validate: { script: 'validate', prefix: [], npm: 'validate' },
  // The docs portal is built from the template (its Docusaurus app); a data-only brand gets no script for these yet.
  'tokens:build': { script: 'tokens-build', prefix: [], npm: null },
  'prepare-docs': { script: 'prepare-docs', prefix: [], npm: null, entry: 'prepare-docs' },
  check: { script: 'check', prefix: [], npm: 'check' },
  scaffold: { script: 'scaffold', prefix: [], npm: 'brand-os:scaffold' },
  convert: { script: 'convert', prefix: [], npm: null },
}

/** npm scripts for a data-only brand repository: every command above, run through the committed engine. */
export function brandPackageScripts(engineFile = '.brand-os/engine/brand-os.mjs'): Record<string, string> {
  const scripts: Record<string, string> = {}
  for (const [command, spec] of Object.entries(ENGINE_COMMANDS)) if (spec.npm) scripts[spec.npm] = `node ${engineFile} ${command}`
  return Object.fromEntries(Object.entries(scripts).sort(([a], [b]) => a.localeCompare(b)))
}
