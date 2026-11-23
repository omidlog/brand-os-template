import type { BusinessModelCanvasBlock, VisualLang } from '@brand-os/brand-core/visual'
import { fillVisual, visualCatalog } from '@brand-os/brand-core/visual'
import { studioAssets } from '../static-assets.js'
import { banner, emptyState } from './components.js'
import { html, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import type { BrandView, ViewContext } from './layout.js'
import { brandHeader, brandShell } from './pages.js'
import { canvasView, detailsView, frameworkPanel, legend, miniMap, printDocument, relationshipsPanel, summaryView } from './visual.js'

/**
 * The read-only "Business model" page and its print view. GET only: no form, no link that changes anything. The
 * page shows the internal edition (approved, labelled drafts, gaps, withheld restricted values); the print view
 * can show the public edition, which leaves drafts out.
 */

function canvasBlock(doc: { blocks: Array<{ type: string }> }): BusinessModelCanvasBlock {
  return doc.blocks.find((block) => block.type === 'business_model_canvas') as BusinessModelCanvasBlock
}

function extraHead(): SafeHtml {
  return html`<link rel="stylesheet" href="${studioAssets.url('visual.css')}">`
}

export function visualPage(ctx: ViewContext, view: BrandView, flash: string | null): SafeHtml {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const p = view.cached.projection
  const shell = (body: SafeHtml) => brandShell(ctx, view, 'visual', cat.text.canvasTitle, body, flash, extraHead())
  if (!p) return shell(html``)
  const header = brandHeader(ctx, view, cat.text.canvasTitle, cat.text.decisionBody)
  const visual = p.visual
  if (visual === undefined) return shell(html`${header}${banner({ tone: 'info', body: cat.text.pending })}`)
  if (visual === null) return shell(html`${header}${banner({ tone: 'warning', body: cat.text.unavailable })}`)
  if (!visual.bmc.applies) return shell(html`${header}${emptyState({ icon: 'briefcase', title: cat.text.notApplicableTitle, body: cat.text.notApplicableBody })}`)
  const doc = visual.bmc.internal
  const canvas = canvasBlock(doc)
  const base = `/brands/${view.record.slug}/visual`
  const asOf = doc.as_of ? new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(doc.as_of)) : null
  const body = html`${header}
    <div class="vz-screen">
      <div class="vz-toolbar">
        <p class="vz-edition-line"><span class="vz-edition vz-edition--internal">${cat.text.editionInternal}</span></p>
        <div class="vz-actions">
          <a class="btn btn-secondary btn-sm" href="${base}/print">${icon('book')}<span>${cat.text.openPrint}</span></a>
          <a class="btn btn-ghost btn-sm" href="${base}/print?edition=public">${icon('globe')}<span>${cat.text.openPrintPublic}</span></a>
        </div>
      </div>
      <section class="vz-overview" aria-label="${cat.text.summaryTitle}">
        <div class="vz-overview-map">
          <p class="vz-overline">${cat.text.zoneIndex}</p>
          ${miniMap(cat, canvas, 'bmc', true)}
        </div>
        <div class="vz-overview-summary">
          <p class="vz-overline">${cat.text.summaryTitle} · ${asOf ? fillVisual(cat.text.asOf, { date: asOf }) : cat.text.asOfNone}</p>
          ${summaryView(cat, doc, lang)}
        </div>
      </section>
      ${canvasView(cat, canvas, { lang, mode: 'screen', showNext: true, idPrefix: 'bmc' })}
      ${legend(cat, ['approved', 'stale', 'assumption', 'recommendation', 'withheld', 'missing', 'not_applicable'])}
      ${detailsView(cat, canvas, html`${relationshipsPanel(cat)}${frameworkPanel(cat, doc.framework_refs[0]!, lang, 'screen')}`, cat.text.editionInternalNote, true)}
    </div>`
  return shell(body)
}

/** Full-page print document (A3 landscape). Read-only; the only control is the browser's own print command. */
export function visualPrintPage(ctx: ViewContext, view: BrandView, edition: 'internal' | 'public'): SafeHtml | null {
  const lang = ctx.i.locale as VisualLang
  const cat = visualCatalog(lang)
  const visual = view.cached.projection?.visual
  if (!visual || !visual.bmc.applies) return null
  const doc = edition === 'public' ? visual.bmc.public : visual.bmc.internal
  const toolbar = html`<nav class="vz-print-toolbar" aria-label="${cat.text.printTitle}">
    <a class="vz-print-back" href="/brands/${view.record.slug}/visual">${icon('chevron', 'vz-back-icon')}<span>${cat.text.backToCanvas}</span></a>
    <p class="vz-print-hint">${cat.text.printHint} ${cat.text.printOnly}</p>
    <button type="button" class="vz-print-button" data-print hidden>${cat.text.printButton}</button>
  </nav>`
  return printDocument({
    doc,
    lang,
    commit: view.cached.status.sha,
    head: html`<link rel="icon" href="/static/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${studioAssets.url('visual.css')}"><script src="${studioAssets.url('visual.js')}" defer></script>`,
    toolbar,
  })
}
