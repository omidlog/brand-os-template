import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, KnowledgeError, openWorkspace, type KnowledgeWorkspace } from '@brand-os/brand-core'
import {
  addCandidate,
  asLang,
  buildLandscape,
  classifyCandidate,
  CompetitiveError,
  DIMENSION_LABELS,
  linkEvidence,
  readCandidate,
  scanCandidates,
  setScope,
  setStatus,
  verifyDomain,
  type Landscape,
} from '@brand-os/brand-core/competitive'
import { NETWORK_ENV, ResearchError, selectAdapter } from '@brand-os/brand-core/research'

/**
 * brand:competitive — the owner's local competitor index (Identity Slice B).
 *
 * Sources are recorded once, as Knowledge research notes, with `brand:seo research capture|replay` (topic
 * market_observation). This command only indexes candidates and cites those notes. It never fetches, never writes a
 * brand fact, price or asset, and is refused under an agent token. Records stay in brand/.private/competitive.
 */

const HELP = `brand:competitive <command> [options]

  scope --purposes identity,pricing,…          what the research is for (identity, positioning, marketing,
                                              pricing, seo, expansion); scopes the gap checklist
  add --name <name> [--relationship direct,…] [--geography local|regional|international]
      [--markets TR,US] [--domain rival.com] [--source owner_named|research_lead]
      [--distinct-from <cmp_id> --reason "<why another business>"]
                                              a name becomes an unverified candidate
  classify --id <cmp_id> [--relationship …] [--geography …] [--markets …]
  link --id <cmp_id> --note <kn_id|knowledge:kn_…@sha> --claim <claim_key> --dimension <d> --label "<short>"
       [--kind observed_claim|inference]
       [--offer Pro --amount 12 --currency USD --market US --period month|year|one_time|unknown
        --commitment monthly|annual|none|unknown --tax included|excluded|unknown
        --promotion none_observed|promotional|unknown --feature-scope "<short>"]   (dimension public_price)
  verify-domain --id <cmp_id> --note <kn_…> --claim <claim_key> [--domain rival.com]
                                              a source fetched from the domain verifies it
  status --id <cmp_id> --status candidate|owner_reviewed|disputed|archived [--reason "<why>"]
  list                                        candidates with assessment and domain state
  show --id <cmp_id>                          one candidate with every cited observation
  matrix [--lang en|fa|tr]                    landscape: matrix, prices (never ranked), gaps, limits

Dimensions: offer, audience, geography, public_price, public_message, visual_language, observable_channels,
strength_hypothesis, weakness_hypothesis (the last two are inferences).
Record sources first: npm run brand:seo -- research capture|replay (topic market_observation).
No network is used here; ${NETWORK_ENV} only changes what the gap list says about research.
Add --json for machine-readable output. Refused while ${AGENT_TOKEN_ENV} is set.`

const [command, ...rest] = process.argv.slice(2)
const root = process.cwd()

const OPTIONS = {
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
  purposes: { type: 'string' },
  name: { type: 'string' },
  relationship: { type: 'string' },
  geography: { type: 'string' },
  markets: { type: 'string' },
  domain: { type: 'string' },
  source: { type: 'string' },
  'distinct-from': { type: 'string' },
  reason: { type: 'string' },
  id: { type: 'string' },
  note: { type: 'string' },
  claim: { type: 'string' },
  dimension: { type: 'string' },
  label: { type: 'string' },
  kind: { type: 'string' },
  offer: { type: 'string' },
  amount: { type: 'string' },
  currency: { type: 'string' },
  market: { type: 'string' },
  period: { type: 'string' },
  commitment: { type: 'string' },
  tax: { type: 'string' },
  promotion: { type: 'string' },
  'feature-scope': { type: 'string' },
  status: { type: 'string' },
} as const

type Values = ReturnType<typeof parseArgs<{ args: string[]; options: typeof OPTIONS; allowPositionals: false; strict: true }>>['values']

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function need(values: Values, key: keyof Values): string {
  const value = values[key]
  if (typeof value !== 'string' || !value) usage(`--${key} is required.`)
  return value
}

function print(values: Values, data: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(data, null, 2) : text())
}

function landscapeText(view: Landscape): string {
  const dim = (d: keyof typeof DIMENSION_LABELS) => DIMENSION_LABELS[d][view.lang]
  const lines = [
    `Competitive landscape for ${view.brand_slug} (${view.state}). Draft, owner-only; authorizes nothing.`,
    `Research: ${view.research.adapter} ${view.research.state}${view.research.reason ? ` — ${view.research.reason}` : ''}`,
    `Scope: ${view.scope.purposes.join(', ') || 'not set'}. Target market fact ${view.target_market.fact_id}: ${view.target_market.state}.`,
    '',
  ]
  for (const c of view.candidates) {
    lines.push(`${c.display_name} [${c.competitor_id}] ${c.assessment}; ${c.relationship.join('/') || 'relationship ?'}; markets ${c.markets.join(',') || '?'}; domain ${c.official_domain ?? c.domain_state}`)
    for (const cell of view.matrix.filter((m) => m.competitor_id === c.competitor_id && m.state !== 'unknown')) lines.push(`  ${dim(cell.dimension)}: ${cell.state}`)
  }
  if (view.prices.rows.length) {
    lines.push('', `Public prices (listed, not ranked; no currency conversion): ${view.prices.comparison}${view.prices.reasons.length ? ` — ${view.prices.reasons.join(', ')}` : ''}`)
    for (const row of view.prices.rows) lines.push(`  ${row.offer_name}: ${row.amount} ${row.currency} ${row.billing_period}/${row.billing_commitment} ${row.market}, observed ${row.observed_at.slice(0, 10)}, ${row.cell}${row.caveats.length ? ` (${row.caveats.join(', ')})` : ''}`)
  }
  if (view.gaps.length) lines.push('', 'Gaps:', ...view.gaps.map((g) => `  - ${g.text}`))
  lines.push('', 'Never inferred:', ...view.prohibited_inferences.map((p) => `  - ${p.text}`))
  return lines.join('\n')
}

function priceOf(values: Values): Record<string, unknown> | null {
  if (values.amount === undefined && values.currency === undefined && values.offer === undefined) return null
  return {
    offer_name: values.offer,
    amount: values.amount,
    currency: values.currency,
    market: values.market,
    billing_period: values.period,
    billing_commitment: values.commitment,
    tax_inclusion: values.tax,
    promotion: values.promotion,
    feature_scope: values['feature-scope'],
  }
}

function landscape(ws: KnowledgeWorkspace, values: Values): Landscape {
  return buildLandscape(ws, { capability: selectAdapter({}).capability(ws.now()), lang: asLang(values.lang) })
}

function run(ws: KnowledgeWorkspace, values: Values): void {
  switch (command) {
    case 'scope': {
      const scope = setScope(ws, need(values, 'purposes'))
      print(values, { ok: true, scope }, () => `Scope: ${scope.purposes.join(', ')}. It only scopes the gap checklist.`)
      return
    }
    case 'add': {
      const record = addCandidate(ws, {
        display_name: need(values, 'name'),
        relationship: values.relationship,
        geography: values.geography,
        markets: values.markets,
        domain: values.domain ?? null,
        source: values.source as never,
        distinct_from: values['distinct-from'] ?? null,
        reason: values.reason ?? null,
      })
      print(values, { ok: true, candidate: record }, () => `Added ${record.display_name} as ${record.competitor_id}: an unverified candidate. Link research notes with: link --id ${record.competitor_id} …`)
      return
    }
    case 'classify': {
      const record = classifyCandidate(ws, { competitor_id: need(values, 'id'), relationship: values.relationship, geography: values.geography, markets: values.markets })
      print(values, { ok: true, candidate: record }, () => `${record.display_name}: ${record.relationship.join('/') || 'relationship ?'}; ${record.geographic_relevance.join('/') || 'geography ?'}; markets ${record.markets.join(',') || '?'}.`)
      return
    }
    case 'link': {
      const out = linkEvidence(ws, { competitor_id: need(values, 'id'), note: need(values, 'note'), claim_key: need(values, 'claim'), dimension: need(values, 'dimension'), statement_kind: values.kind, label: need(values, 'label'), price: priceOf(values) })
      print(values, { ok: true, outcome: out.outcome, observation: out.observation }, () => `${out.outcome === 'linked' ? 'Linked' : 'Already linked'} ${out.observation.observation_id}: ${out.observation.dimension} cites knowledge:${out.observation.evidence.note_id}@${out.observation.evidence.revision} (${out.observation.evidence.claim_key}). No quote was copied.`)
      return
    }
    case 'verify-domain': {
      const record = verifyDomain(ws, { competitor_id: need(values, 'id'), domain: values.domain ?? null, note: need(values, 'note'), claim_key: need(values, 'claim') })
      print(values, { ok: true, candidate: record }, () => `${record.display_name}: ${record.domain_claim} is verified while ${record.domain_evidence!.note_id} stays current.`)
      return
    }
    case 'status': {
      const record = setStatus(ws, { competitor_id: need(values, 'id'), status: need(values, 'status'), reason: values.reason ?? null })
      print(values, { ok: true, candidate: record }, () => `${record.display_name}: ${record.status}. This records assessment progress; it approves nothing.`)
      return
    }
    case 'list': {
      const view = landscape(ws, values)
      const skipped = scanCandidates(ws).skipped
      print(values, { ok: true, state: view.state, candidates: view.candidates.map(({ observations, ...c }) => ({ ...c, observations: observations.length })), skipped }, () =>
        view.candidates.length ? view.candidates.map((c) => `${c.competitor_id}  ${c.display_name}  ${c.assessment}  domain ${c.official_domain ?? c.domain_state}  ${c.observations.length} observation(s)`).join('\n') : 'No candidates yet.',
      )
      return
    }
    case 'show': {
      const id = need(values, 'id')
      readCandidate(ws, id)
      const view = landscape(ws, values)
      const candidate = view.candidates.find((c) => c.competitor_id === id)!
      print(values, { ok: true, candidate }, () =>
        [
          `${candidate.display_name} [${candidate.competitor_id}] ${candidate.assessment}; domain ${candidate.official_domain ?? candidate.domain_state}`,
          ...candidate.observations.map((o) => `  ${o.observation_id} ${o.dimension} ${o.statement_kind}: ${o.label} — ${o.cell} (${o.ref_state}, ${o.source_class ?? 'source unreadable'}) ${o.evidence.ref} ${o.evidence.claim_key}`),
          ...candidate.needs_review.map((n) => `  ! ${n}`),
        ].join('\n'),
      )
      return
    }
    case 'matrix': {
      const view = landscape(ws, values)
      print(values, { ok: true, landscape: view }, () => landscapeText(view))
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
  run(openWorkspace(root), values)
} catch (error) {
  if (error instanceof CompetitiveError || error instanceof KnowledgeError || error instanceof ResearchError) {
    if (values.json) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  console.error(`Unexpected error (${(error as Error)?.name ?? 'Error'}). Nothing about the brand was changed.`)
  process.exit(1)
}
