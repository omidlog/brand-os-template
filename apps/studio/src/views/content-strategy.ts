import { KPI_LABELS, MIX_LABELS, OBJECTIVE_LABELS, PERIOD_LABELS, type SharedContentStrategy, type StudioStrategyProjection } from '@brand-os/brand-core/content-bridge'
import type { ContentChannelPlan } from '@brand-os/brand-core/strategy'
import type { MessageKey } from '../i18n/index.js'
import { badge, banner, code, emptyState, shortSha } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'

/**
 * The read-only "Content strategy" page: the approved content strategy revision the owner explicitly shared
 * (`brand:content share-strategy`) and merged, from `brand/content-strategy/shared/<id>.json`. Per channel: role,
 * objective, audience, formats, cadence, the content mix as a bar, KPI targets, posting windows and rules. Every value
 * goes through the escaping `html` template; owner text is `dir="auto"`. No forms and no approve button.
 */

function mixBar(ctx: ViewContext, mix: NonNullable<ContentChannelPlan['mix']>): SafeHtml {
  const lang = ctx.i.locale
  let x = 0
  const label = mix.map((m) => `${MIX_LABELS[m.type][lang]} ${m.share}%`).join(', ')
  // Segments are drawn left to right in data order; the legend carries the same order in the reading direction.
  const segments = mix.map((m) => {
    const seg = html`<rect class="mix-seg mix-${m.type}" x="${x}" width="${m.share}" height="10"/>`
    x += m.share
    return seg
  })
  return html`<div class="mix">
    <svg class="mix-bar" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-label="${label}">${segments}</svg>
    <ul class="mix-legend">${mix.map((m) => html`<li><span class="mix-dot mix-${m.type}" aria-hidden="true"></span>${MIX_LABELS[m.type][lang]} ${ctx.i.number(m.share)}%</li>`)}</ul>
  </div>`
}

function channelCard(ctx: ViewContext, s: SharedContentStrategy, c: ContentChannelPlan): SafeHtml {
  const { i } = ctx
  const lang = i.locale
  const pillarName = (id: string) => s.pillars.find((p) => p.id === id)?.name ?? id
  const notDecided = html`<span class="muted">${i.t('strategy.notDecided')}</span>`
  return html`<li class="card note-card" id="channel-${c.channel}">
    <div class="note-card-head">
      <h3 class="note-title">${c.channel}</h3>
      <div class="note-badges">${c.objective ? badge(OBJECTIVE_LABELS[c.objective][lang], 'info') : ''}${c.cadence ? badge(i.t('strategy.cadenceValue', { count: i.number(c.cadence.target), per: PERIOD_LABELS[c.cadence.per][lang] }), 'neutral', 'clock') : ''}</div>
    </div>
    <dl class="meta-list kn-meta">
      <div><dt>${i.t('strategy.role')}</dt><dd dir="auto">${c.role ?? notDecided}</dd></div>
      ${c.audience ? html`<div><dt>${i.t('strategy.audience')}</dt><dd dir="auto">${c.audience}</dd></div>` : ''}
      <div><dt>${i.t('strategy.formats')}</dt><dd>${c.formats.length ? c.formats.map((f) => html`${code(f, 'small')} `) : notDecided}</dd></div>
      <div><dt>${i.t('strategy.cadence')}</dt><dd>${c.cadence ? i.t('strategy.cadenceValue', { count: i.number(c.cadence.target), per: PERIOD_LABELS[c.cadence.per][lang] }) : notDecided}</dd></div>
      <div><dt>${i.t('strategy.languages')}</dt><dd>${c.languages.length ? c.languages.map((l) => html`${code(l, 'small')} `) : i.t('strategy.all')}</dd></div>
      <div><dt>${i.t('strategy.pillars')}</dt><dd dir="auto">${c.pillars.length ? c.pillars.map(pillarName).join(' · ') : i.t('strategy.all')}</dd></div>
      ${c.posting_windows?.length ? html`<div><dt>${i.t('strategy.windows')}</dt><dd>${c.posting_windows.map((w) => html`${code(w, 'small')} `)}</dd></div>` : ''}
      ${c.fact_refs.length ? html`<div><dt>${i.t('strategy.cites')}</dt><dd>${c.fact_refs.map((id) => html`${code(id, 'small')} `)}</dd></div>` : ''}
    </dl>
    ${c.mix?.length ? html`<h4 class="small">${i.t('strategy.mix')}</h4>${mixBar(ctx, c.mix)}` : ''}
    ${c.kpis?.length
      ? html`<h4 class="small">${i.t('strategy.kpis')}</h4><ul class="kn-withheld">${c.kpis.map(
          (k) => html`<li>${KPI_LABELS[k.metric][lang]}: ${k.target === null ? html`<span class="muted">${i.t('strategy.noTarget')}</span>` : i.number(k.target)} <span class="muted">${PERIOD_LABELS[k.per][lang]}</span></li>`,
        )}</ul>`
      : ''}
    ${c.rules?.length ? html`<h4 class="small">${i.t('strategy.rules')}</h4><ul class="kn-withheld">${c.rules.map((rule) => html`<li dir="auto">${rule}</li>`)}</ul>` : ''}
  </li>`
}

function strategySection(ctx: ViewContext, s: SharedContentStrategy): SafeHtml {
  const { i } = ctx
  return html`<section class="card" aria-labelledby="strategy-${s.strategy_id}">
    <h2 class="card-title" id="strategy-${s.strategy_id}">${code(s.strategy_id)} ${badge(i.t('strategy.state.approved'), 'info', 'check')} ${badge(i.t(`strategy.status.${s.status}` as MessageKey), s.status === 'current' ? 'success' : 'warning')}</h2>
    <dl class="meta-list kn-meta">
      <div><dt>${i.t('strategy.revision')}</dt><dd>${code(`r${s.revision} ${s.content_sha256.slice(0, 12)}`, 'small')}</dd></div>
      <div><dt>${i.t('strategy.approvedAt')}</dt><dd>${i.dateTime(s.approved_at)}</dd></div>
      <div><dt>${i.t('strategy.sharedAt')}</dt><dd>${i.dateTime(s.shared_at)}</dd></div>
      <div><dt>${i.t('strategy.validity')}</dt><dd>${i.dateTime(s.validity.valid_from)} → ${i.dateTime(s.validity.valid_until)}</dd></div>
      <div><dt>${i.t('strategy.reviewDue')}</dt><dd>${i.dateTime(s.validity.review_due_at)}</dd></div>
      <div><dt>${i.t('strategy.languages')}</dt><dd>${s.languages.map((l) => html`${code(l, 'small')} `)}</dd></div>
    </dl>
    <h3>${i.t('strategy.pillars')}</h3>
    ${s.pillars.length
      ? html`<ul class="kn-withheld">${s.pillars.map((p) => html`<li><span dir="auto">${p.name}</span> ${code(p.id, 'small')} ${p.fact_refs.map((id) => html`${code(id, 'small')} `)}</li>`)}</ul>`
      : html`<p class="muted">${i.t('strategy.notDecided')}</p>`}
    <h3>${i.t('strategy.channels')}</h3>
    ${s.channels.length ? html`<ul class="note-list">${s.channels.map((c) => channelCard(ctx, s, c))}</ul>` : html`<p class="muted">${i.t('strategy.notDecided')}</p>`}
    ${s.gaps.length
      ? html`<h3>${i.t('strategy.gaps')}</h3><ul class="kn-withheld">${s.gaps.map((gap) => html`<li>${badge(i.t(`strategy.gap.${gap.reason}` as MessageKey), 'warning', 'alert')} ${code(gap.field, 'small')}</li>`)}</ul>`
      : ''}
  </section>`
}

function withheldSection(ctx: ViewContext, p: StudioStrategyProjection): SafeHtml {
  const { i } = ctx
  if (!p.withheld.length) return html``
  return html`<section class="card" aria-labelledby="strategy-withheld-title">
    <h2 class="card-title" id="strategy-withheld-title">${icon('lock')} ${i.t('strategy.withheldTitle')}</h2>
    <p class="muted">${i.t('strategy.withheldBody')}</p>
    <ul class="kn-withheld">${p.withheld.map((item) => html`<li>${code(item.path, 'small')} ${badge(i.t(`strategy.reason.${item.reason}` as MessageKey), 'warning', 'alert')}</li>`)}</ul>
  </section>`
}

export function contentStrategyPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const { i } = ctx
  const p = view.cached.projection
  const title = i.t('strategy.title')
  if (!p) return brandShell(ctx, view, 'content-strategy', title, html``, flash)
  const header = brandHeader(ctx, view, title, i.t('strategy.subtitle'))
  const s = p.strategy
  if (s === undefined) return brandShell(ctx, view, 'content-strategy', title, html`${header}${banner({ tone: 'info', body: i.t('strategy.pending') })}`, flash)
  if (s === null) return brandShell(ctx, view, 'content-strategy', title, html`${header}${banner({ tone: 'warning', body: i.t('strategy.unavailable') })}`, flash)
  if (s.total === 0) {
    const body = html`${header}${emptyState({ icon: 'layers', title: i.t('strategy.emptyTitle'), body: i.t('strategy.emptyBody') })}${withheldSection(ctx, s)}`
    return brandShell(ctx, view, 'content-strategy', title, body, flash)
  }
  const body = html`${header}
    ${banner({ tone: 'warning', body: i.t('strategy.banner') })}
    <p class="muted small">${icon('git')} ${i.t('strategy.commit', { sha: shortSha(view.cached.status.sha), time: i.dateTime(view.cached.status.synced_at) })}</p>
    ${s.strategies.map((item) => strategySection(ctx, item))}
    ${withheldSection(ctx, s)}`
  return brandShell(ctx, view, 'content-strategy', title, body, flash)
}
