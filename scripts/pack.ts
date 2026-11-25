import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV } from '@brand-os/brand-core'
import { PACK_PROFILES, PackError, writePack } from './pack-lib.js'

/**
 * brand:pack — the owner exports a read-only brand pack (Markdown) for chat products without MCP: ChatGPT, Grok,
 * Claude.ai Projects. Approved context for one agent profile only; see scripts/pack-lib.ts and
 * docs-internal/AI_CONNECTORS.md ("Chat products without MCP").
 */

const HELP = `brand:pack --profile ${PACK_PROFILES.join('|')} [--lang en|fa|tr] [--out <dir>] [--json]

  Writes 00-README.md … 05-creative-preferences.md: the approved context an agent token of this profile would read,
  for upload as project knowledge. Default --out: brand/.private/exports/pack-<profile>-<date>/ (git-ignored).
  An --out inside the repository must be git-ignored. Drafts, restricted values and note text are never included.
  Uploading the files shares them with that product. Re-export after every approval. Refused while ${AGENT_TOKEN_ENV} is set.`

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

const argv = process.argv.slice(2)
if (argv[0] === 'help' || argv[0] === '--help') {
  console.log(HELP)
  process.exit(0)
}

let values: { profile?: string; lang?: string; out?: string; json?: boolean }
try {
  values = parseArgs({ args: argv, options: { profile: { type: 'string' }, lang: { type: 'string' }, out: { type: 'string' }, json: { type: 'boolean', default: false } }, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}
if (!values.profile) usage('--profile is required.')

try {
  const result = writePack(process.cwd(), { profile: values.profile, lang: values.lang, out: values.out })
  if (values.json) console.log(JSON.stringify({ ok: true, ...result }, null, 2))
  else {
    console.log(
      [
        `Wrote the ${result.profile} pack to ${result.out}:`,
        ...result.files.map((file) => `  ${file.name}  ${file.bytes} bytes`),
        `  ${result.counts.facts} approved facts (${result.counts.withheld_facts} not included), ${result.counts.strategies} content strategies, ${result.counts.weeks} weeks, ${result.counts.slots} slot briefs, ${result.counts.preferences} preferences.`,
        'Upload the files as project knowledge and paste 01-instructions.md into the project instructions.',
        'Uploading shares them with that product. Re-export after you approve anything. It authorizes nothing.',
      ].join('\n'),
    )
  }
} catch (error) {
  if (error instanceof PackError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing was shared.`)
  process.exit(1)
}
