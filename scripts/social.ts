import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AGENT_TOKEN_ENV, InterviewEngine, openWorkspace } from '@brand-os/brand-core'
import {
  approveKit,
  evaluateKit,
  initKit,
  localize,
  previewFiles,
  readKit,
  rejectKit,
  shareKitApprovals,
  SHARED_SOCIAL_APPROVALS_FILE,
  repoTokenLookup,
  reviewKit,
  ruleText,
  SOCIAL_KIT_FILE,
  SOCIAL_LANGS,
  SocialKitError,
  socialKitText,
  SURFACE_SPECS,
  SURFACES,
  zoneRect,
  type ReviewResult,
  type SocialLang,
  type SocialSurface,
  type StyleState,
} from '@brand-os/brand-core/social-kit'
import { readOwnerProof } from './proof.js'

/**
 * brand:social — the owner's social style kit (docs-internal/SOCIAL_STYLE_KIT.md).
 *
 * Every command is the owner's: all refuse while BRAND_OS_AGENT_TOKEN is set (agents read approved styles through the
 * MCP tool social_style_kit or `brand:query -- --tool social_style_kit`). Approval needs the owner's approval proof
 * (env, piped stdin, Keychain or hidden prompt; never argv) and the digest kit review printed.
 */

const HELP = `brand:social kit <command> [options]   (owner only; all take --json and --lang en|fa|tr)

  kit init [--surfaces post,story,…] [--styles 1-4] [--force]
      Write the starter draft kit to ${SOCIAL_KIT_FILE}. Refuses an existing file unless --force;
      --force replaces draft styles only (approved and rejected styles are always kept).
  kit show [--surface <s>]
      Every style with its effective status (draft, approved, rejected, invalid approval).
  kit review --style <id> | --surface <s>
      The digest to approve (--expect-sha) and the exact approve command.
  kit approve --style <id> | --surface <s> --expect-sha <sha256>
      Owner approval (proof from BRAND_OS_APPROVAL_PROOF, piped stdin, Keychain or a hidden prompt).
  kit reject --style <id> | --surface <s>
      Decline styles. They stay in the file and are never served.
  kit preview [--surface <s>] --out <dir>
      Deterministic SVG wireframes per style and one index.html contact sheet per surface. Fonts show the
      brand family for the --lang (display-fa for fa when it exists), labelled draft or template EXAMPLE
      until the font token is approved.
  kit share [--dry-run]
      Write ${SHARED_SOCIAL_APPROVALS_FILE}: which styles are approved here, with their digest and
      approval time (no seals or secrets), so Studio can show them. You commit and merge it.

Surfaces: ${SURFACES.join(', ')}.
Nothing here publishes, schedules or approves a post. Approval of a style is design guidance only.`

const OPTIONS = {
  surfaces: { type: 'string' },
  surface: { type: 'string' },
  styles: { type: 'string' },
  style: { type: 'string' },
  'expect-sha': { type: 'string' },
  out: { type: 'string' },
  force: { type: 'boolean', default: false },
  'dry-run': { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  lang: { type: 'string' },
} as const

const [group, command, ...rest] = process.argv.slice(2)

function usage(message: string): never {
  console.error(`${message}\n\n${HELP}`)
  process.exit(2)
}

function langOf(value: string | undefined): SocialLang {
  if (value === undefined) return 'en'
  if (!(SOCIAL_LANGS as readonly string[]).includes(value)) usage('--lang is en, fa or tr.')
  return value as SocialLang
}

function surfaceOf(value: string | undefined): SocialSurface | undefined {
  if (value === undefined) return undefined
  if (!(SURFACES as readonly string[]).includes(value)) usage(`--surface is one of ${SURFACES.join(', ')}.`)
  return value as SocialSurface
}

function surfacesOf(value: string | undefined): SocialSurface[] | undefined {
  if (value === undefined) return undefined
  const list = value.split(',').map((item) => item.trim()).filter(Boolean)
  for (const item of list) surfaceOf(item)
  if (list.length === 0) usage('--surfaces lists one or more surfaces.')
  return list as SocialSurface[]
}

function showText(states: StyleState[], lang: SocialLang, surface?: SocialSurface): string {
  const t = socialKitText(lang)
  const lines = [`${t.labels.kit} — ${SOCIAL_KIT_FILE}`]
  for (const current of SURFACES.filter((item) => !surface || item === surface)) {
    const mine = states.filter((state) => state.style.surface === current)
    if (mine.length === 0) continue
    const spec = SURFACE_SPECS[current]
    lines.push('', `${t.surfaces[current]} (${spec.canvases.map((canvas) => `${canvas.width}×${canvas.height}`).join(', ')})`)
    for (const state of mine) {
      const style = state.style
      lines.push(`  [${t.statuses[state.status]}] ${style.id} — ${localize(style.name, lang)}  sha ${state.digest.slice(0, 12)}`)
      lines.push(`    ${t.labels.intent}: ${localize(style.intent.use_when, lang)}`)
      lines.push(`    ${t.labels.variation}: ${localize(style.variation, lang)}`)
      lines.push(`    ${t.labels.layers}: ${style.layers.map((layer) => {
        const r = zoneRect(layer.zone)
        return `${t.roles[layer.role]}@${r.x},${r.y},${r.w}×${r.h}`
      }).join(' · ')}`)
      lines.push(`    ${t.labels.do}: ${style.do.map((item) => ruleText(item, lang)).join(' ') || t.labels.none}`)
      lines.push(`    ${t.labels.dont}: ${style.dont.map((item) => ruleText(item, lang)).join(' ') || t.labels.none}`)
      lines.push(`    ${t.labels.references}: ${style.reference_assets === 'missing' ? 'missing' : style.reference_assets.join(', ')}`)
    }
  }
  return lines.join('\n')
}

function reviewText(review: ReviewResult, lang: SocialLang): string {
  const t = socialKitText(lang)
  const lines = review.items.map((item) => `  [${t.statuses[item.status]}] ${item.style_id}  ${item.digest}${item.invalid_reason ? `  (${item.invalid_reason})` : ''}`)
  if (review.safety_problems.length) lines.push(`  ! ${review.safety_problems.join(', ')}`)
  lines.push(`${t.labels.digest}: ${review.expect_sha ?? t.labels.none}`)
  if (review.approve_with) lines.push(`${t.labels.approve_with}: ${review.approve_with}`)
  return lines.join('\n')
}

async function main(): Promise<void> {
  if (!group || group === 'help' || group === '--help') {
    console.log(HELP)
    return
  }
  if (group !== 'kit') usage(`Unknown command ${group}.`)
  const { values } = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true })
  const lang = langOf(values.lang)
  const t = socialKitText(lang)
  const print = (data: unknown, text: () => string): void => console.log(values.json ? JSON.stringify(data, null, 2) : text())
  if (process.env[AGENT_TOKEN_ENV]) {
    throw new SocialKitError('refused', `The social style kit is the owner's to edit, review and approve. Refusing while ${AGENT_TOKEN_ENV} is set. Agents read approved styles with npm run brand:query -- --tool social_style_kit.`)
  }
  const engine = new InterviewEngine(process.cwd())
  const ws = openWorkspace(engine.workspaceRoot())

  switch (command) {
    case 'init': {
      const styles = values.styles === undefined ? undefined : Number(values.styles)
      const result = initKit(ws, { surfaces: surfacesOf(values.surfaces), styles, force: values.force, personal: engine.config().modules.personal?.enabled === true })
      print({ ok: true, ...result }, () => `${t.labels.init_done}\n${t.labels.wrote}: ${result.path} (${result.written.length} drafts${result.kept.length ? `, kept ${result.kept.join(', ')}` : ''})`)
      return
    }
    case 'show': {
      const surface = surfaceOf(values.surface)
      const read = readKit(ws.root, ws.brandSlug)
      if (read.state === 'missing') {
        print({ ok: true, kit_state: 'missing', styles: [] }, () => t.labels.missing_kit)
        return
      }
      if (read.state === 'invalid') throw new SocialKitError('invalid_kit', read.error)
      const states = evaluateKit(ws.root, read.kit).filter((state) => !surface || state.style.surface === surface)
      print(
        { ok: true, kit_state: 'ok', family: read.kit.family, styles: states.map((state) => ({ ...state.style, effective_status: state.status, digest: state.digest, invalid_reason: state.invalid_reason })) },
        () => showText(states, lang, surface),
      )
      return
    }
    case 'review': {
      const review = reviewKit(ws, { style_id: values.style, surface: values.surface })
      print({ ok: true, ...review }, () => reviewText(review, lang))
      return
    }
    case 'approve': {
      if (!values.style && !values.surface) usage('kit approve needs --style <id> or --surface <s>.')
      const proof = await readOwnerProof({ prompt: 'Owner approval proof (input hidden): ' })
      const result = approveKit(ws, { style_id: values.style, surface: values.surface, expected_sha256: values['expect-sha'], proof })
      print({ ok: true, ...result }, () => `${t.labels.approved}: ${result.approved.map((item) => item.style_id).join(', ')}`)
      return
    }
    case 'reject': {
      const result = rejectKit(ws, { style_id: values.style, surface: values.surface })
      print({ ok: true, ...result }, () => `${t.labels.rejected}: ${result.rejected.join(', ')}`)
      return
    }
    case 'preview': {
      if (!values.out) usage('kit preview needs --out <dir>.')
      const surface = surfaceOf(values.surface)
      const read = readKit(ws.root, ws.brandSlug)
      if (read.state === 'missing') throw new SocialKitError('not_found', t.labels.missing_kit)
      if (read.state === 'invalid') throw new SocialKitError('invalid_kit', read.error)
      const files = previewFiles(read.kit, evaluateKit(ws.root, read.kit), repoTokenLookup(ws.root), { surface, lang })
      const out = path.resolve(values.out)
      for (const file of files) {
        const target = path.join(out, ...file.path.split('/'))
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, file.contents)
      }
      print({ ok: true, out, files: files.map((file) => file.path) }, () => `${t.labels.preview_done}\n${files.filter((file) => file.path.endsWith('index.html')).map((file) => `  ${path.join(out, file.path)}`).join('\n')}`)
      return
    }
    case 'share': {
      const result = shareKitApprovals(ws, { dryRun: values['dry-run'] })
      print({ ok: true, ...result, authorizes: [] }, () =>
        result.written ? `${t.labels.shared}: ${result.path} (${result.summary.styles.length})` : `${t.labels.share_preview}.\n${JSON.stringify(result.summary, null, 2)}`,
      )
      return
    }
    default:
      usage(`Unknown kit command ${command ?? ''}.`)
  }
}

main().catch((error: unknown) => {
  if (error instanceof SocialKitError) {
    if (process.argv.includes('--json')) console.log(JSON.stringify({ ok: false, error: { code: error.code, message: error.message }, authorizes: [] }, null, 2))
    else console.error(`${error.code}: ${error.message}`)
    process.exit(1)
  }
  if (error instanceof Error && 'code' in error && typeof (error as { code?: unknown }).code === 'string' && (error as { code: string }).code.startsWith('ERR_PARSE_ARGS')) usage(error.message)
  throw error
})
