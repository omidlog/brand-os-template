import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, KnowledgeError, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import {
  brandSettings,
  buildContentStrategy,
  CLI_TEXT,
  contentLang,
  contentStrategyView,
  fill,
  parseCadence,
  parseChannels,
  parseFormats,
  ROLE_LABELS,
  type ContentLang,
  type ContentStrategyDraft,
  type ContentStrategyView,
} from '@brand-os/brand-core/content-bridge'
import { proposeRevision, StrategyError, validateStrategyId } from '@brand-os/brand-core/strategy'

/**
 * brand:content — Content Bridge (Slice A): the brand's content strategy, derived from approved facts.
 *
 * `strategy` builds a proposal: voice, audience, messaging and claims are cited by fact id (never rewritten), and
 * whatever facts cannot decide is an explicit gap. It is stored, if asked, as a draft `content` strategy revision in
 * the existing strategy store; review and approval are the existing brand:strategy review / approve (owner proof,
 * hash-bound). `show` is the owner's voice rules projection of the approved revision. Nothing here posts, schedules
 * or publishes, and no agent reads content strategies yet.
 */

const HELP = `brand:content <command> [options]

  strategy [--id content-main] [--channels instagram,linkedin] [--cadence instagram=3/week]
           [--formats instagram=reel+carousel] [--languages en,fa] [--markets tr]
           [--out <proposal.json>] [--store]
                                  propose a content strategy from approved facts, with explicit gaps.
                                  Without --out or --store nothing is written.
  show [--id <id>]                the approved content strategy with its voice rules, resolved from
                                  approved facts (drafts are never shown)

Review and approve with: npm run brand:strategy -- review / approve (owner proof).
Options: --lang en|fa|tr (default: the brand default locale), --json. Refused while ${AGENT_TOKEN_ENV} is set.`

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  id: { type: 'string' },
  channels: { type: 'string' },
  cadence: { type: 'string' },
  formats: { type: 'string' },
  languages: { type: 'string' },
  markets: { type: 'string' },
  out: { type: 'string' },
  store: { type: 'boolean', default: false },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

const [command, ...rest] = process.argv.slice(2)

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function codes(value: string | undefined, flag: string): string[] | undefined {
  if (!value) return undefined
  const list = value.split(',').map((item) => item.trim()).filter(Boolean)
  for (const item of list) if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(item)) throw new StrategyError('invalid_input', `${flag} takes language or market codes such as en,fa,tr (got ${item}).`)
  return list
}

function draftText(draft: ContentStrategyDraft, lang: ContentLang): string {
  const t = (key: string) => CLI_TEXT[key]![lang]
  const block = draft.block
  const lines = [t('draft_header'), '', `${t('sources')}:`]
  for (const source of draft.sources) lines.push(`  [${source.state}] ${source.fact_id} (${ROLE_LABELS[source.role]![lang]})`)
  lines.push('', `${t('pillars')}: ${block.pillars.map((p) => `${p.id} ${p.name}`).join(' · ') || '—'}`)
  lines.push(`${t('channels')}:`)
  for (const c of block.channels) lines.push(`  ${c.channel}: ${c.formats.join('+') || t('not_decided')}, ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t('not_decided')}`)
  if (!block.channels.length) lines.push('  —')
  lines.push('', `${t('gaps')}:`)
  if (!draft.gaps.length) lines.push(`  ${t('no_gaps')}`)
  for (const gap of draft.gaps) lines.push(`  - [${gap.reason}] ${gap.field}: ${gap.text}`)
  lines.push('', `${t('notes')}:`, ...draft.notes.map((note) => `  ${note}`))
  return lines.join('\n')
}

function viewText(view: ContentStrategyView, lang: ContentLang): string {
  const t = (key: string) => CLI_TEXT[key]![lang]
  const lines = [
    `${view.strategy_id} r${view.revision} (${view.status}) ${view.digests.content_sha256.slice(0, 12)}`,
    `  ${view.languages.join(', ')} · ${view.validity.valid_from.slice(0, 10)} → ${view.validity.valid_until.slice(0, 10)}`,
    '',
    `${t('voice')}:`,
    ...view.voice.sources.map((src) => `  ${src.fact_id}: ${src.value}`),
    ...view.voice.do.map((rule) => `  ${t('do')}: ${rule.text}`),
    ...view.voice.dont.map((rule) => `  ${t('dont')}: ${rule.text}`),
    '',
    `${t('banned')}:`,
    ...view.claims.banned.map((rule) => `  - ${rule.text}`),
    ...(view.claims.availability_rule ? [`  - ${view.claims.availability_rule}`] : []),
    '',
    `${t('pillars')}: ${view.pillars.map((p) => p.name).join(' · ') || '—'}`,
    `${t('channels')}:`,
    ...view.channels.map((c) => `  ${c.channel}: ${c.role ?? t('not_decided')}; ${c.formats.join('+') || t('not_decided')}; ${c.cadence ? `${c.cadence.target}/${c.cadence.per}` : t('not_decided')}; ${c.languages.join(',') || t('all')}`),
    '',
    `${t('gaps')}:`,
    ...(view.gaps.length ? view.gaps.map((gap) => `  - ${gap.field}: ${gap.text}`) : [`  ${t('no_gaps')}`]),
    '',
    ...view.notice.map((line) => `note: ${line}`),
  ]
  return lines.join('\n')
}

function run(ws: KnowledgeWorkspace, values: Values): void {
  const lang = contentLang(values.lang, contentLang(brandSettings(ws).default_locale.slice(0, 2)))
  if (values.lang && values.lang !== lang) usage('--lang is en, fa or tr.')
  const print = (data: unknown, text: () => string) => console.log(values.json ? JSON.stringify(data, null, 2) : text())
  switch (command) {
    case 'strategy': {
      const id = validateStrategyId(values.id ?? 'content-main')
      const draft = buildContentStrategy(ws, {
        lang,
        channels: values.channels ? parseChannels(values.channels) : undefined,
        cadence: values.cadence ? parseCadence(values.cadence) : undefined,
        formats: values.formats ? parseFormats(values.formats) : undefined,
        languages: codes(values.languages, '--languages'),
        markets: codes(values.markets, '--markets'),
      })
      const after: string[] = []
      let stored: { revision: number; content_sha256: string; path: string } | null = null
      if (values.out) {
        const out = path.resolve(values.out)
        if (fs.existsSync(out)) throw new StrategyError('exists', 'The --out file exists. Choose a new path; nothing was overwritten.')
        fs.writeFileSync(out, `${JSON.stringify(draft.proposal, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
        after.push(fill(CLI_TEXT.written![lang], { list: values.out, id }))
      }
      if (values.store) {
        const result = proposeRevision(ws, { strategy_id: id, proposal: draft.proposal })
        stored = { revision: result.revision.revision, content_sha256: result.revision.content_sha256, path: result.path }
        after.push(fill(CLI_TEXT.stored![lang], { id, n: result.revision.revision }))
      }
      if (!values.out && !values.store) after.push(CLI_TEXT.store_hint![lang])
      print({ ok: true, strategy_id: id, stored, gaps: draft.gaps, sources: draft.sources, notes: draft.notes, proposal: draft.proposal }, () => [draftText(draft, lang), '', ...after].join('\n'))
      return
    }
    case 'show': {
      const result = contentStrategyView(ws, { lang, strategy_id: values.id ? validateStrategyId(values.id) : undefined })
      print({ ok: true, ...result }, () => {
        const withheld = Object.entries(result.withheld).map(([status, n]) => `${status}: ${n}`).join(', ')
        const body = result.views.length ? result.views.map((view) => viewText(view, lang)).join('\n\n') : CLI_TEXT.none_approved![lang]
        return withheld ? `${body}\n${CLI_TEXT.withheld![lang]}: ${withheld}` : body
      })
      return
    }
    default:
      usage(command ? `Unknown command ${command}.` : 'No command given.')
  }
}

if (!command || command === 'help' || command === '--help') {
  console.log(HELP)
  process.exit(command ? 0 : 2)
}

let values: Values
try {
  values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values
} catch (error) {
  usage((error as Error).message)
}

try {
  run(openWorkspace(process.cwd()), values)
} catch (error) {
  if (error instanceof StrategyError || error instanceof KnowledgeError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing was approved or published.`)
  process.exit(1)
}
