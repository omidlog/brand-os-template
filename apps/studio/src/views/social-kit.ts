import {
  localize,
  ruleText,
  snapshotLookup,
  socialKitText,
  styleSvg,
  SURFACE_SPECS,
  SURFACES,
  zoneRect,
  type FontResolution,
  type StudioSocialKitProjection,
  type StudioSocialStyle,
  type TokenLookup,
} from '@brand-os/brand-core/social-kit'
import type { I18n, MessageKey } from '../i18n/index.js'
import { badge, banner, code, colorSwatch, emptyState, shortSha, type Tone } from './components.js'
import { html, trusted, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * The read-only "Social style kit" page: the committed kit (`brand/social/style-kit.yaml`) per surface, each sibling
 * style as the same deterministic SVG wireframe `brand:social kit preview` writes (`styleSvg`), with its layers and
 * do / don't. A style is badged approved only when its content digest matches the approval summary the owner shared
 * (`brand/social/shared/approvals.json`); a hand-edited style shows as not verified. Fonts name the brand family for
 * the page language, labelled draft or template EXAMPLE until the token is approved. No forms, no write.
 */

const STATUS_TONE: Record<StudioSocialStyle['status'], Tone> = { approved: 'success', not_verified: 'danger', draft: 'warning', rejected: 'neutral' }

function fontBadge(i: I18n, info: FontResolution | null): SafeHtml {
  if (!info) return html``
  const states = socialKitText(i.locale).font_states
  const tone: Tone = info.state === 'approved' ? 'success' : info.state === 'draft' ? 'warning' : 'danger'
  return html`<span dir="auto">${info.family ?? info.ref}</span> ${code(info.token, 'small')} ${badge(states[info.state], tone)}`
}

/** styleSvg escapes every text it writes (ids, names, token labels), so its markup is safe to embed as is. */
function wireframe(style: StudioSocialStyle, tokens: TokenLookup, i: I18n, status: string): SafeHtml {
  return html`<div class="kit-svg" dir="ltr">${trusted(styleSvg(style.style, tokens, { status, lang: i.locale }))}</div>`
}

function styleCard(ctx: ViewContext, item: StudioSocialStyle, tokens: TokenLookup): SafeHtml {
  const { i } = ctx
  const lang = i.locale
  const t = socialKitText(lang)
  const style = item.style
  const status = i.t(`socialKit.status.${item.status}` as MessageKey)
  return html`<li class="card note-card kit-style" id="${style.id}">
    ${wireframe(item, tokens, i, status)}
    <div class="note-card-head">
      <h4 class="note-title" dir="auto">${localize(style.name, lang)}</h4>
      <div class="note-badges">${badge(status, STATUS_TONE[item.status], item.status === 'approved' ? 'check' : item.status === 'not_verified' ? 'alert' : undefined)}${item.reason ? badge(i.t(`socialKit.reason.${item.reason}` as MessageKey), 'danger') : ''}</div>
    </div>
    <dl class="meta-list kn-meta">
      <div><dt>ID</dt><dd>${code(style.id, 'small')}</dd></div>
      <div><dt>${i.t('socialKit.intent')}</dt><dd dir="auto">${localize(style.intent.use_when, lang)}</dd></div>
      <div><dt>${i.t('socialKit.variation')}</dt><dd dir="auto">${localize(style.variation, lang)}</dd></div>
      <div><dt>${i.t('socialKit.digest')}</dt><dd>${code(item.digest.slice(0, 12), 'small')}</dd></div>
      ${item.approved_at ? html`<div><dt>${i.t('socialKit.approvedAt')}</dt><dd>${i.dateTime(item.approved_at)}</dd></div>` : ''}
    </dl>
    <details>
      <summary>${i.t('socialKit.layers')} (${i.number(style.layers.length)})</summary>
      <ol class="kn-withheld">${style.layers.map((layer) => {
        const r = zoneRect(layer.zone)
        const zone = typeof layer.zone === 'string' ? layer.zone : `${r.x},${r.y} ${r.w}×${r.h}%`
        const limits = [layer.max_words ? `≤${layer.max_words}w` : '', layer.max_lines ? `≤${layer.max_lines}l` : ''].filter(Boolean).join(' ')
        return html`<li>${t.roles[layer.role]}${layer.optional ? html` <span class="muted">(${i.t('socialKit.optional')})</span>` : ''} ${code(zone, 'small')}${layer.color ? html` ${code(layer.color, 'small')}` : ''}${layer.font ? html` · ${fontBadge(i, tokens.fontInfo(layer.font, lang))}` : ''}${limits ? html` ${code(limits, 'small')}` : ''}${layer.rules?.length ? html`<br><span class="muted" dir="auto">${layer.rules.map((rule) => ruleText(rule, lang)).join(' ')}</span>` : ''}</li>`
      })}</ol>
    </details>
    ${style.do.length ? html`<p class="small"><strong>${i.t('socialKit.do')}:</strong> <span dir="auto">${style.do.map((rule) => ruleText(rule, lang)).join(' ')}</span></p>` : ''}
    ${style.dont.length ? html`<p class="small"><strong>${i.t('socialKit.dont')}:</strong> <span dir="auto">${style.dont.map((rule) => ruleText(rule, lang)).join(' ')}</span></p>` : ''}
  </li>`
}

function familyCard(ctx: ViewContext, kit: StudioSocialKitProjection, tokens: TokenLookup): SafeHtml {
  const { i } = ctx
  const family = kit.family
  if (!family) return html``
  const fonts = [family.type.headline, family.type.body, ...(family.type.accent ? [family.type.accent] : [])]
  return html`<section class="card" aria-labelledby="kit-family-title">
    <h2 class="card-title" id="kit-family-title">${i.t('socialKit.family')}</h2>
    <h3 class="small">${i.t('socialKit.fonts')}</h3>
    <ul class="kn-withheld">${fonts.map((ref) => html`<li>${code(ref, 'small')} → ${fontBadge(i, tokens.fontInfo(ref, i.locale))}</li>`)}</ul>
    <h3 class="small">${i.t('socialKit.palette')}</h3>
    <div class="swatch-grid">${Object.entries(family.palette).map(([role, ref]) => {
      const color = tokens.color(ref)
      return colorSwatch({ hex: color.resolved ? color.hex : null, name: role, meta: code(ref, 'small'), i })
    })}</div>
    <p class="small">${i.t('socialKit.logo')}: ${code(family.logo.placement, 'small')} ${code(`${family.logo.size_pct}%`, 'small')} ${code(family.logo.asset, 'small')}</p>
  </section>`
}

function withheldSection(ctx: ViewContext, kit: StudioSocialKitProjection): SafeHtml {
  const { i } = ctx
  if (!kit.withheld.length) return html``
  return html`<section class="card" aria-labelledby="kit-withheld-title">
    <h2 class="card-title" id="kit-withheld-title">${icon('lock')} ${i.t('socialKit.withheldTitle')}</h2>
    <p class="muted">${i.t('socialKit.withheldBody')}</p>
    <ul class="kn-withheld">${kit.withheld.map((item) => html`<li>${code(item.path, 'small')} ${badge(i.t(`socialKit.reason.${item.reason}` as MessageKey), 'warning', 'alert')}</li>`)}</ul>
  </section>`
}

export function socialKitPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  const title = i.t('socialKit.title')
  if (!p) return brandShell(ctx, view, 'social-kit', title, html``, flash)
  const header = brandHeader(ctx, view, title, i.t('socialKit.subtitle'))
  const kit = p.socialKit
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'social-kit', title, html`${header}${body}`, flash)
  if (!kit) return shell(emptyState({ icon: 'image', title: i.t('socialKit.emptyTitle'), body: i.t('socialKit.emptyBody') }))
  if (kit.state === 'invalid') return shell(html`${banner({ tone: 'warning', body: i.t('socialKit.invalid') })}${withheldSection(ctx, kit)}`)
  if (kit.state === 'unsafe') return shell(html`${banner({ tone: 'danger', body: i.t('socialKit.unsafe') })}${withheldSection(ctx, kit)}`)
  if (kit.state === 'missing' || !kit.tokens) return shell(html`${emptyState({ icon: 'image', title: i.t('socialKit.emptyTitle'), body: i.t('socialKit.emptyBody') })}${withheldSection(ctx, kit)}`)
  const tokens = snapshotLookup(kit.tokens)
  const labels = socialKitText(i.locale).surfaces
  const surfaces = SURFACES.filter((surface) => kit.styles.some((item) => item.style.surface === surface))
  return shell(html`
    ${banner({ tone: 'warning', body: i.t('socialKit.banner') })}
    <p class="muted small">${icon('git')} ${i.t('socialKit.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>
    <p>${i.t('socialKit.counts', { approved: i.number(kit.counts.approved), draft: i.number(kit.counts.draft), notVerified: i.number(kit.counts.not_verified), rejected: i.number(kit.counts.rejected) })}</p>
    ${kit.shared ? html`<p class="muted small">${i.t('socialKit.sharedAt', { time: i.dateTime(kit.shared.shared_at), count: i.number(kit.shared.count) })}</p>` : banner({ tone: 'info', body: i.t('socialKit.noShared') })}
    ${familyCard(ctx, kit, tokens)}
    ${surfaces.map((surface) => {
      const canvas = SURFACE_SPECS[surface].canvases.map((c) => `${c.width}×${c.height}`).join(', ')
      return html`<section class="card" aria-labelledby="kit-${surface}">
        <h2 class="card-title" id="kit-${surface}">${labels[surface]} ${code(canvas, 'small')}</h2>
        <ul class="note-list kit-grid">${kit.styles.filter((item) => item.style.surface === surface).map((item) => styleCard(ctx, item, tokens))}</ul>
      </section>`
    })}
    ${withheldSection(ctx, kit)}`)
}
