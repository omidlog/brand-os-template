import type {
  CitationListBlock,
  ColorPaletteBlock,
  ContrastPair,
  DataState,
  FrameworkRef,
  LogoConstructionBlock,
  TypeRole,
  TypographySpecimenBlock,
  VisualCatalog,
  VisualDocument,
  VisualEntry,
  VisualLang,
} from '@brand-os/brand-core/visual'
import { fillVisual, visualCatalog } from '@brand-os/brand-core/visual'
import { contrastRatio } from '@brand-os/design-tokens'
import { html, join, safeHex, type SafeHtml } from './html.js'
import { icon } from './icons.js'
import { dateOnly, ghostChart, illustrativeStamp, legend, stateChip, two, type GhostVariant } from './visual-primitives.js'

/**
 * Brand Book "Visual identity" chapter renderers (Visual Blueprint V2.1): colour palette, typography specimen and
 * logo construction, each with a designed "awaiting approved asset" page. Editorial book layout: numbered plates,
 * a wide measure, hairline rules, specimens that carry the page. Read-only; no inline style or script (strict CSP):
 * colours and families are SVG presentation attributes, everything else is a class in `static/visual.css`.
 * Technical ids (question and asset ids) appear only in the details disclosure and the print appendix.
 */

export interface IdentityContext {
  cat: VisualCatalog
  lang: VisualLang
  mode: 'screen' | 'print'
  doc: VisualDocument
  /** Owner-only steps; the public edition leaves them out. */
  showNext: boolean
  assetUrl: (key: string) => string | null
}

function numbers(lang: VisualLang): Intl.NumberFormat {
  return new Intl.NumberFormat(lang, { maximumFractionDigits: 2 })
}

function ratioText(ctx: IdentityContext, ratio: number): string {
  return fillVisual(ctx.cat.identity.ratio, { ratio: numbers(ctx.lang).format(ratio) })
}

/** Plate header: section number, title, lead. The numbering is the chapter's own, not a claim about the book. */
function plateHead(n: number, id: string, title: string, lead: string, state: SafeHtml): SafeHtml {
  return html`<header class="vz-plate-head">
    <p class="vz-plate-num"><span>${two(n)}</span>${state}</p>
    <h2 class="vz-plate-title" id="${id}-t">${title}</h2>
    <p class="vz-plate-lead">${lead}</p>
  </header>`
}

function plateFoot(ctx: IdentityContext, entry: VisualEntry, extra: string[] = []): SafeHtml {
  const approved = dateOnly(entry.approved_at, ctx.lang)
  const parts = [html`<span class="vz-foot-label" dir="auto">${entry.label}</span>`]
  if (entry.version !== null) parts.push(html`<span>${fillVisual(ctx.cat.text.version, { version: entry.version })}</span>`)
  if (approved) parts.push(html`<span>${fillVisual(ctx.cat.text.asOf, { date: approved })}</span>`)
  for (const item of extra) parts.push(html`<span dir="auto">${item}</span>`)
  return html`<p class="vz-foot"><span class="vz-foot-kind">${ctx.cat.text.sourceShort}</span> ${join(parts, '<span class="vz-foot-sep" aria-hidden="true"> · </span>')} ${stateChip(ctx.cat, entry.state)}</p>`
}

/** The designed "awaiting approved asset" page: ghost geometry, what it waits for, and (owner only) the next steps. */
function awaiting(ctx: IdentityContext, input: { variant: GhostVariant; title: string; body: string; reasons: Array<{ text: string; state: DataState | null }>; steps: string[] }): SafeHtml {
  const t = ctx.cat.identity
  return html`<div class="vz-await">
    <div class="vz-await-art">${ghostChart({ title: t.awaitingKicker, variant: input.variant })}</div>
    <div class="vz-await-copy">
      <p class="vz-await-kicker">${icon('clock')}<span>${t.awaitingKicker}</span></p>
      <h3 class="vz-await-title">${input.title}</h3>
      <p class="vz-await-body">${input.body}</p>
      <ul class="vz-await-reasons">${input.reasons.map((reason) => html`<li>${reason.state ? stateChip(ctx.cat, reason.state) : ''}<span>${reason.text}</span></li>`)}</ul>
      ${ctx.showNext && input.steps.length ? html`<div class="vz-await-steps"><p class="vz-await-steps-title">${t.awaitingStepsTitle}</p><ol>${input.steps.map((step) => html`<li dir="auto">${step}</li>`)}</ol></div>` : ''}
    </div>
  </div>`
}

/** Why an entry is not drawable, in the reader's language. */
function entryReason(ctx: IdentityContext, entry: VisualEntry): { text: string; state: DataState } {
  const t = ctx.cat.identity
  if (entry.state === 'assumption' || entry.state === 'recommendation') return { text: t.awaitingDraft, state: entry.state }
  if (entry.state === 'withheld') return { text: t.awaitingWithheld, state: 'withheld' }
  return { text: entry.missing_reason ? ctx.cat.missingReason[entry.missing_reason] : ctx.cat.text.noValueYet, state: entry.state }
}

/** Readable text colour on a swatch: whichever of near-black or white measures higher. Display only. */
function inkOn(hex: string): string {
  return contrastRatio('#121212', hex) >= contrastRatio('#FFFFFF', hex) ? '#121212' : '#FFFFFF'
}

function levelMarks(ctx: IdentityContext, pair: ContrastPair): SafeHtml {
  const t = ctx.cat.identity
  const mark = (ok: boolean, label: string) => html`<li class="vz-level vz-level--${ok ? 'pass' : 'fail'}">${icon(ok ? 'checkCircle' : 'circle')}<span><span class="vz-level-verdict">${ok ? t.passes : t.fails}</span> ${label}</span></li>`
  return html`<ul class="vz-levels">${mark(pair.aa_normal, t.normalText)}${mark(pair.aa_large, t.largeText)}${mark(pair.aaa_normal, t.enhanced)}</ul>`
}

export function colorPaletteView(block: ColorPaletteBlock, ctx: IdentityContext): SafeHtml {
  const t = ctx.cat.identity
  const id = 'vi-color'
  const ready = block.colors.length > 0
  const head = plateHead(1, id, t.colorTitle, t.colorLead, ready ? html`<span class="vz-plate-state vz-plate-state--ready">${t.ready}</span>` : html`<span class="vz-plate-state">${t.waiting}</span>`)
  if (!ready) {
    const steps = [fillVisual(t.stepApprove, { label: block.source.label })]
    return html`<section class="vz-plate vz-plate--color" id="${id}" aria-labelledby="${id}-t">${head}${awaiting(ctx, { variant: 'swatches', title: t.awaitingColorTitle, body: t.awaitingColorBody, reasons: [entryReason(ctx, block.source)], steps })}</section>`
  }
  const hexOf = new Map(block.colors.map((color) => [color.role, color.hex]))
  const swatches = html`<ul class="vz-swatches" aria-label="${t.rolesTitle}">${block.colors.map((color) => {
    const hex = safeHex(color.hex) ?? '#000000'
    return html`<li class="vz-swatch">
      <svg class="vz-swatch-chip" dir="ltr" role="img" aria-label="${color.role} ${hex}"><rect width="100%" height="100%" fill="${hex}"/><rect width="100%" height="100%" fill="none" class="vz-swatch-edge"/><text x="10" y="88%" fill="${inkOn(hex)}" direction="ltr" class="vz-swatch-aa">Aa</text></svg>
      <p class="vz-swatch-role" dir="ltr">${color.role}</p>
      <p class="vz-swatch-values" dir="ltr"><span>${hex}</span><span>RGB ${color.rgb.join(' ')}</span></p>
    </li>`
  })}</ul>`
  const combos = block.combinations.length
    ? html`<ul class="vz-combos">${block.combinations.map((pair) => {
        const fg = safeHex(hexOf.get(pair.foreground)) ?? '#000000'
        const bg = safeHex(hexOf.get(pair.background)) ?? '#FFFFFF'
        const label = fillVisual(t.textOn, { fg: pair.foreground, bg: pair.background })
        return html`<li class="vz-combo">
          <svg class="vz-combo-chip" dir="ltr" viewBox="0 0 240 120" role="img" aria-label="${label}"><rect width="240" height="120" fill="${bg}"/><rect x="0.5" y="0.5" width="239" height="119" fill="none" class="vz-swatch-edge"/><text x="18" y="70" fill="${fg}" direction="ltr" class="vz-combo-aa">Aa</text><text x="18" y="100" fill="${fg}" direction="ltr" class="vz-combo-sample">${t.sample}</text></svg>
          <div class="vz-combo-meta"><p class="vz-combo-label" dir="ltr">${label}</p><p class="vz-combo-ratio"><bdi dir="ltr">${ratioText(ctx, pair.ratio)}</bdi></p>${levelMarks(ctx, pair)}</div>
        </li>`
      })}</ul>`
    : html`<p class="vz-note">${t.combinationsNone}</p>`
  const grid = block.grid
    ? html`<div class="vz-grid-wrap" ${ctx.mode === 'screen' ? html`tabindex="0" role="region" aria-label="${t.gridTitle}"` : ''}><table class="vz-cgrid">
        <caption>${t.gridHint}</caption>
        <thead><tr><th scope="col" class="vz-cgrid-corner">${t.gridCorner}</th>${block.grid.roles.map((role) => html`<th scope="col" dir="ltr"><svg class="vz-cgrid-dot" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" fill="${safeHex(hexOf.get(role)) ?? '#000000'}"/></svg>${role}</th>`)}</tr></thead>
        <tbody>${block.grid.roles.map((fg, row) => html`<tr><th scope="row" dir="ltr"><svg class="vz-cgrid-dot" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" fill="${safeHex(hexOf.get(fg)) ?? '#000000'}"/></svg>${fg}</th>${block.grid!.roles.map((bg, col) => {
          if (row === col) return html`<td class="vz-cgrid-self">—</td>`
          const ratio = block.grid!.ratios[row]![col]!
          const level = ratio >= 7 ? 'aaa' : ratio >= 4.5 ? 'aa' : ratio >= 3 ? 'large' : 'low'
          return html`<td class="vz-cgrid-cell vz-cgrid--${level}"><span class="vz-cgrid-ratio">${numbers(ctx.lang).format(ratio)}</span></td>`
        })}</tr>`)}</tbody>
      </table></div>`
    : html`<p class="vz-note">${fillVisual(t.gridOmitted, { count: 10 })}</p>`
  return html`<section class="vz-plate vz-plate--color" id="${id}" aria-labelledby="${id}-t">
    ${head}
    <h3 class="vz-sub">${t.rolesTitle}</h3>
    ${swatches}
    <div class="vz-plate-split">
      <div><h3 class="vz-sub">${t.combinationsTitle}</h3><p class="vz-note">${t.combinationsLead}</p>${combos}</div>
      <div><h3 class="vz-sub">${t.contrastTitle}</h3><p class="vz-note">${t.contrastLead}</p>${grid}<p class="vz-grid-key"><span class="vz-key vz-cgrid--aaa">7+</span><span class="vz-key vz-cgrid--aa">4.5+</span><span class="vz-key vz-cgrid--large">3+</span><span class="vz-key vz-cgrid--low">&lt; 3</span></p></div>
    </div>
    ${plateFoot(ctx, block.source)}
  </section>`
}

/** Fonts Studio ships (OFL). A family of the same name is drawn with the bundled file so the specimen is the face. */
const BUNDLED: Record<string, string> = { inter: 'Studio Inter', rajdhani: 'Studio Rajdhani', vazirmatn: 'Studio Vazirmatn' }

function familyList(role: TypeRole, script: 'en' | 'fa' | 'tr'): string {
  const names = [role.family, ...role.fallback].map((name) => name.replace(/["'<>&;{}\\]/g, '').trim()).filter(Boolean)
  const withBundled = names.flatMap((name) => (BUNDLED[name.toLowerCase()] ? [BUNDLED[name.toLowerCase()]!, name] : [name]))
  // Persian lines fall back to Vazirmatn (owner decision) before the generic family.
  if (script === 'fa') {
    const generic = withBundled.findIndex((name) => /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-[a-z-]+)$/i.test(name))
    const at = generic === -1 ? withBundled.length : generic
    withBundled.splice(at, 0, 'Studio Vazirmatn', 'Vazirmatn')
  }
  return withBundled.map((name) => (/\s/.test(name) ? `'${name}'` : name)).join(', ')
}

/** Whole words of the sample that fit one line at this size (an estimate; the SVG clips anything beyond). */
function fit(sample: string, size: number, width: number): string {
  const max = Math.max(8, Math.floor(width / (size * 0.55)))
  if (sample.length <= max) return sample
  const words = sample.split(' ')
  let out = ''
  for (const word of words) {
    if ((out ? `${out} ${word}` : word).length > max) break
    out = out ? `${out} ${word}` : word
  }
  return out || sample.slice(0, max)
}

export function typographySpecimenView(block: TypographySpecimenBlock, ctx: IdentityContext): SafeHtml {
  const t = ctx.cat.identity
  const id = 'vi-type'
  const ready = block.roles.length > 0
  const head = plateHead(2, id, t.typeTitle, t.typeLead, ready ? html`<span class="vz-plate-state vz-plate-state--ready">${t.ready}</span>` : html`<span class="vz-plate-state">${t.waiting}</span>`)
  if (!ready) {
    return html`<section class="vz-plate vz-plate--type" id="${id}" aria-labelledby="${id}-t">${head}${awaiting(ctx, { variant: 'specimen', title: t.awaitingTypeTitle, body: t.awaitingTypeBody, reasons: [entryReason(ctx, block.source)], steps: [fillVisual(t.stepApprove, { label: block.source.label })] })}</section>`
  }
  const n = numbers(ctx.lang)
  const roles = block.roles.map((role) => {
    const size = role.size_px ?? 16
    const lh = role.line_height ?? 1.3
    const rowH = Math.ceil(size * lh + 18)
    const lines = block.scripts.map((script) => {
      const sample = fit(t.specimenLine[script], size, ctx.mode === 'print' ? 440 : 620)
      const rtl = script === 'fa'
      // No viewBox: one user unit is one CSS pixel, so the specimen is set at its true size on screen and in print.
      return html`<div class="vz-spec-line"><p class="vz-spec-script">${t.scriptName[script]}</p><svg class="vz-spec-svg" dir="${rtl ? 'rtl' : 'ltr'}" width="100%" height="${rowH}" role="img" aria-label="${role.role}, ${t.scriptName[script]}: ${sample}"><text x="${rtl ? '100%' : 0}" y="${Math.round(size * 0.95 + 6)}" font-family="${familyList(role, script)}" font-size="${size}" direction="${rtl ? 'rtl' : 'ltr'}" text-anchor="start" class="vz-spec-text" ${rtl ? html`lang="fa"` : html`lang="${script}"`}>${sample}</text></svg></div>`
    })
    return html`<li class="vz-type-role">
      <div class="vz-type-meta">
        <p class="vz-type-name" dir="ltr">${role.role}</p>
        <svg class="vz-type-aa" dir="ltr" viewBox="0 0 120 96" role="img" aria-label="${role.family}"><text x="0" y="78" font-family="${familyList(role, 'en')}" font-size="84" direction="ltr" class="vz-spec-text">Aa</text></svg>
        <dl class="vz-type-dl">
          <div><dt class="vz-vh">${t.familyLabel}</dt><dd class="vz-type-family" dir="ltr">${role.family}</dd></div>
          <div><dt>${t.fallbackLabel}</dt><dd dir="ltr">${role.fallback.join(', ')}</dd></div>
          <div><dt class="vz-vh">${t.scaleLabel}</dt><dd>${role.size_px !== null ? fillVisual(t.sizeLabel, { size: n.format(role.size_px) }) : t.sizeUnset}${role.line_height !== null ? html` · ${fillVisual(t.lineHeightLabel, { value: n.format(role.line_height) })}` : ''}</dd></div>
        </dl>
      </div>
      <div class="vz-type-specimen">${lines}</div>
    </li>`
  })
  return html`<section class="vz-plate vz-plate--type" id="${id}" aria-labelledby="${id}-t">
    ${head}
    <ol class="vz-type-roles">${roles}</ol>
    <p class="vz-note vz-type-note">${t.fontNote}</p>
    ${plateFoot(ctx, block.source)}
  </section>`
}

/** Clear space in units of a mark drawn 100 units tall. */
function clearUnits(spec: NonNullable<LogoConstructionBlock['spec']>): number {
  return spec.clear_space.unit === 'x' ? spec.clear_space.value * 100 : (spec.clear_space.value / spec.min_size_px) * 100
}

function constructionDrawing(ctx: IdentityContext, block: LogoConstructionBlock): SafeHtml {
  const t = ctx.cat.identity
  const spec = block.spec!
  const master = block.master!
  const known = master.width !== null && master.height !== null && master.width > 0 && master.height > 0
  const markH = 100
  const markW = known ? Math.min(600, Math.max(20, (master.width! / master.height!) * 100)) : 100
  const c = Math.min(200, clearUnits(spec))
  const pad = 46
  const W = markW + 2 * c + 2 * pad
  const H = markH + 2 * c + 2 * pad
  const x0 = pad + c
  const y0 = pad + c
  const url = ctx.assetUrl(master.preview_key)
  const clearLabel = spec.clear_space.unit === 'x' ? fillVisual(t.clearSpaceX, { value: numbers(ctx.lang).format(spec.clear_space.value) }) : fillVisual(t.clearSpacePx, { value: numbers(ctx.lang).format(spec.clear_space.value) })
  const mark = url
    ? html`<image href="${url}" x="${x0}" y="${y0}" width="${markW}" height="${markH}" preserveAspectRatio="xMidYMid meet"/>`
    : html`<g class="vz-mockmark"><rect x="${x0}" y="${y0}" width="${markW}" height="${markH}"/><text x="${x0 + markW / 2}" y="${y0 + markH / 2 + 6}" text-anchor="middle">${t.mockMark}</text></g>`
  const tick = (x1: number, y1: number, x2: number, y2: number) => html`<line class="vz-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
  return html`<svg class="vz-construct" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t.clearSpace}: ${clearLabel}" dir="ltr">
    <rect class="vz-clear-zone" x="${pad}" y="${pad}" width="${markW + 2 * c}" height="${markH + 2 * c}"/>
    <rect class="vz-mark-box" x="${x0}" y="${y0}" width="${markW}" height="${markH}"/>
    ${mark}
    ${tick(pad, pad - 14, x0, pad - 14)}${tick(pad, pad - 20, pad, pad - 8)}${tick(x0, pad - 20, x0, pad - 8)}
    <text class="vz-dim-label" x="${pad + c / 2}" y="${pad - 24}" text-anchor="middle">${spec.clear_space.unit === 'x' ? `${spec.clear_space.value}x` : `${spec.clear_space.value}px`}</text>
    ${spec.clear_space.unit === 'x'
      ? html`${tick(x0 + markW + c + 14, y0, x0 + markW + c + 14, y0 + markH)}${tick(x0 + markW + c + 8, y0, x0 + markW + c + 20, y0)}${tick(x0 + markW + c + 8, y0 + markH, x0 + markW + c + 20, y0 + markH)}<text class="vz-dim-label" x="${x0 + markW + c + 26}" y="${y0 + markH / 2 + 5}">x</text>`
      : ''}
  </svg>`
}

export function logoConstructionView(block: LogoConstructionBlock, ctx: IdentityContext): SafeHtml {
  const t = ctx.cat.identity
  const id = 'vi-logo'
  const ready = block.spec !== null && block.master !== null
  const head = plateHead(3, id, t.logoTitle, t.logoLead, ready ? html`<span class="vz-plate-state vz-plate-state--ready">${t.ready}</span>` : html`<span class="vz-plate-state">${t.waiting}</span>`)
  if (!ready) {
    const reasons: Array<{ text: string; state: DataState | null }> = []
    const steps: string[] = []
    if (!block.spec) {
      const reason = entryReason(ctx, block.source)
      reasons.push({ text: `${t.awaitingSpec} ${reason.text}`, state: reason.state })
      steps.push(fillVisual(t.stepApprove, { label: block.source.label }))
    }
    if (!block.master) {
      reasons.push({ text: t.awaitingMaster[block.master_state === 'approved' ? 'missing' : block.master_state], state: null })
      steps.push(block.master_state === 'ambiguous' ? t.stepMasterAmbiguous : t.stepMaster)
    }
    return html`<section class="vz-plate vz-plate--logo" id="${id}" aria-labelledby="${id}-t">${head}${awaiting(ctx, { variant: 'mark', title: t.awaitingLogoTitle, body: t.awaitingLogoBody, reasons, steps })}</section>`
  }
  const spec = block.spec!
  const master = block.master!
  const n = numbers(ctx.lang)
  const url = ctx.assetUrl(master.preview_key)
  const clearLabel = spec.clear_space.unit === 'x' ? fillVisual(t.clearSpaceX, { value: n.format(spec.clear_space.value) }) : fillVisual(t.clearSpacePx, { value: n.format(spec.clear_space.value) })
  const minimum = url
    ? html`<img class="vz-min-img" src="${url}" alt="${master.name}" height="${spec.min_size_px}" decoding="async">`
    : html`<svg class="vz-min-img" viewBox="0 0 ${Math.round((master.width && master.height ? master.width / master.height : 1) * spec.min_size_px)} ${spec.min_size_px}" height="${spec.min_size_px}" width="${Math.round((master.width && master.height ? master.width / master.height : 1) * spec.min_size_px)}" role="img" aria-label="${t.mockMark}"><rect class="vz-mockmark-min" width="100%" height="100%"/></svg>`
  const known = master.width !== null && master.height !== null
  // Internal edition only (the core leaves badges empty in public): a draft tag or an unpublished file is said plainly.
  const badges = ctx.doc.audience === 'internal' && master.badges.length
    ? html`<span class="vz-master-badges">${master.badges.map((badge) => html`<span class="vz-chip vz-chip--draft vz-master-badge" data-badge="${badge}">${t.masterBadge[badge]}</span>`)}</span>`
    : ''
  return html`<section class="vz-plate vz-plate--logo" id="${id}" aria-labelledby="${id}-t">
    ${head}
    <div class="vz-logo-layout">
      <figure class="vz-logo-figure">${constructionDrawing(ctx, block)}<figcaption class="vz-note">${t.constructionNote}${known ? '' : html` ${t.constructionUnknownSize}`}</figcaption></figure>
      <div class="vz-logo-side">
        <dl class="vz-spec">
          <div><dt>${t.clearSpace}</dt><dd>${clearLabel}</dd></div>
          <div><dt>${t.minSize}</dt><dd>${fillVisual(t.sizeLabel, { size: n.format(spec.min_size_px) })}</dd></div>
          <div><dt>${t.minPrint}</dt><dd>${spec.min_print_mm !== null ? html`<bdi dir="ltr">${n.format(spec.min_print_mm)} mm</bdi>` : t.notSet}</dd></div>
          <div><dt>${t.masterFile}</dt><dd dir="auto">${master.name}${master.version ? html` <span class="vz-muted" dir="ltr">v${master.version}</span>` : ''}${badges}</dd></div>
        </dl>
        <figure class="vz-min"><div class="vz-min-stage">${minimum}</div><figcaption class="vz-note">${t.drawnAtMin}</figcaption></figure>
      </div>
    </div>
    ${plateFoot(ctx, block.source, [master.name])}
  </section>`
}

/** Sources appendix: field and asset ids live here (and in the screen's details), never on the plates. */
export function identitySources(block: CitationListBlock, ctx: IdentityContext): SafeHtml {
  const cat = ctx.cat
  const logo = ctx.doc.blocks.find((item): item is LogoConstructionBlock => item.type === 'logo_construction')
  return html`<section class="vz-panel vz-sources" aria-labelledby="vi-sources-title">
    <h2 class="vz-panel-title" id="vi-sources-title">${cat.text.sourcesTitle}</h2>
    <p class="vz-muted">${cat.identity.sourcesIntro}</p>
    <table class="vz-table">
      <thead><tr><th scope="col">${cat.text.colField}</th><th scope="col">${cat.text.colState}</th><th scope="col">${cat.text.colVersion}</th><th scope="col">${cat.text.colApproved}</th></tr></thead>
      <tbody>${block.items.map((item) => html`<tr>
        <th scope="row"><span class="vz-entry-label" dir="auto">${item.label}</span><code class="vz-code" dir="ltr">${item.id}</code></th>
        <td>${stateChip(cat, item.state)}</td>
        <td>${item.version !== null ? fillVisual(cat.text.version, { version: item.version }) : '—'}</td>
        <td>${dateOnly(item.approved_at, ctx.lang) ?? '—'}</td>
      </tr>`)}
      ${logo?.master ? html`<tr><th scope="row"><span class="vz-entry-label" dir="auto">${cat.identity.masterFile}: ${logo.master.name}</span><code class="vz-code" dir="ltr">${logo.master.asset_id}</code></th><td>${stateChip(cat, 'approved')}</td><td>${logo.master.version ? html`<span dir="ltr">v${logo.master.version}</span>` : '—'}</td><td>—</td></tr>` : ''}
      </tbody>
    </table>
  </section>`
}

export function frameworkNote(cat: VisualCatalog, ref: FrameworkRef, mode: 'screen' | 'print', lang: VisualLang): SafeHtml {
  return html`<section class="vz-panel vz-framework" aria-labelledby="vi-fw-${ref.framework_id}">
    <h2 class="vz-panel-title" id="vi-fw-${ref.framework_id}">${cat.text.frameworkTitle}</h2>
    <p class="vz-claim"><span class="vz-claim-kind">${cat.claim[ref.permitted_claim]}</span> <span dir="ltr">${ref.title}</span> <span class="vz-muted" dir="ltr">· ${ref.authority} · ${ref.edition}</span></p>
    <p class="vz-muted" dir="ltr">${ref.usage_note}</p>
    <dl class="vz-meta">
      <div><dt>${cat.text.licence}</dt><dd><code class="vz-code" dir="ltr">${ref.license_status}</code></dd></div>
      <div><dt>${cat.text.sourceLink}</dt><dd>${mode === 'screen' ? html`<a href="${ref.source_url}" target="_blank" rel="noopener noreferrer" dir="ltr">${ref.source_url}</a>` : html`<span dir="ltr">${ref.source_url}</span>`}</dd></div>
      <div><dt>${cat.text.checked}</dt><dd>${ref.verified_on ? dateOnly(ref.verified_on, lang) : cat.text.notVerified}</dd></div>
    </dl>
  </section>`
}

function plateState(doc: VisualDocument, type: 'color_palette' | 'typography_specimen' | 'logo_construction'): boolean {
  const block = doc.blocks.find((item) => item.type === type)
  return block !== undefined && block.data_state !== 'missing'
}

/** Chapter opener: kicker, title, lead, and a contents list with dotted leaders and each plate's state. */
export function chapterOpener(ctx: IdentityContext, linked: boolean): SafeHtml {
  const t = ctx.cat.identity
  const asOf = dateOnly(ctx.doc.as_of, ctx.lang)
  const items: Array<[string, string, boolean]> = [
    ['vi-color', t.colorTitle, plateState(ctx.doc, 'color_palette')],
    ['vi-type', t.typeTitle, plateState(ctx.doc, 'typography_specimen')],
    ['vi-logo', t.logoTitle, plateState(ctx.doc, 'logo_construction')],
  ]
  return html`<header class="vz-opener">
    <p class="vz-kicker"><span class="vz-kicker-bar" aria-hidden="true"></span>${t.chapterKicker}</p>
    <h1 class="vz-opener-title">${t.chapterTitle}</h1>
    <p class="vz-opener-brand" dir="auto">${ctx.doc.brand_name}</p>
    <p class="vz-opener-lead">${t.chapterLead}</p>
    <nav class="vz-toc" aria-label="${t.contents}">
      <p class="vz-toc-title">${t.contents}</p>
      <ol>${items.map(([target, title, ready], index) => html`<li class="vz-toc-item${ready ? ' is-ready' : ''}">${linked ? html`<a href="#${target}">` : ''}<span class="vz-toc-num">${two(index + 1)}</span><span class="vz-toc-name">${title}</span><span class="vz-toc-leader" aria-hidden="true"></span><span class="vz-toc-state">${ready ? t.ready : t.waiting}</span>${linked ? html`</a>` : ''}</li>`)}</ol>
    </nav>
    <p class="vz-opener-asof">${asOf ? fillVisual(ctx.cat.text.asOf, { date: asOf }) : ctx.cat.text.asOfNone}</p>
  </header>`
}

export interface IdentityPrintInput {
  doc: VisualDocument
  lang: VisualLang
  commit: string | null
  head: SafeHtml
  toolbar: SafeHtml
  assetUrl: (key: string) => string | null
}

/**
 * Static print view of the chapter, A4 portrait (named page): opener, one plate per page, then the sources and
 * framework appendix. Uses the existing print path (browser Print → PDF); not the V1.2 book engine.
 */
export function identityPrintDocument(input: IdentityPrintInput, render: (block: VisualDocument['blocks'][number], ctx: IdentityContext) => SafeHtml): SafeHtml {
  const { doc, lang } = input
  const cat = visualCatalog(lang)
  const t = cat.identity
  const ctx: IdentityContext = { cat, lang, mode: 'print', doc, showNext: false, assetUrl: input.assetUrl }
  const internal = doc.audience === 'internal'
  const edition = internal ? cat.text.editionInternal : cat.text.editionPublic
  const foot = (label: string) => html`<footer class="vz-print-foot"><span>${t.runningHead}</span><span dir="auto">${doc.brand_name}</span><span>${internal ? cat.text.classInternal : cat.text.classPublic}</span><span>${label}</span></footer>`
  const plates: Array<[string, VisualDocument['blocks'][number] | undefined]> = [
    [t.pageColor, doc.blocks.find((block) => block.type === 'color_palette')],
    [t.pageType, doc.blocks.find((block) => block.type === 'typography_specimen')],
    [t.pageLogo, doc.blocks.find((block) => block.type === 'logo_construction')],
  ]
  const citations = doc.blocks.find((block): block is CitationListBlock => block.type === 'citation_list')
  return html`<!doctype html>
<html lang="${lang}" dir="${cat.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${t.chapterTitle} · ${doc.brand_name}</title>
${input.head}
</head>
<body class="vz-print-body vz-book-body${doc.illustrative ? ' vz-is-mock' : ''}">
${input.toolbar}
<main class="vz-print" id="main">
  <section class="vz-page vz-page--book vz-page--opener" aria-label="${t.chapterTitle}">
    ${illustrativeStamp(cat, doc)}
    ${chapterOpener(ctx, false)}
    <dl class="vz-print-meta vz-book-meta">
      <div><dt>${cat.text.classification}</dt><dd><span class="vz-edition vz-edition--${doc.audience}">${edition}</span></dd></div>
      <div><dt>${cat.text.commit}</dt><dd><code class="vz-code" dir="ltr">${input.commit ? input.commit.slice(0, 12) : '—'}</code></dd></div>
    </dl>
    ${foot(t.chapterTitle)}
  </section>
  ${plates.map(([label, block]) => (block ? html`<section class="vz-page vz-page--book vz-page--plate" aria-label="${label}">${illustrativeStamp(cat, doc)}${render(block, ctx)}${foot(label)}</section>` : ''))}
  <section class="vz-page vz-page--book vz-page--appendix" aria-label="${t.pageSources}">
    ${illustrativeStamp(cat, doc)}
    ${citations ? identitySources(citations, ctx) : ''}
    ${legend(cat, ['approved', 'stale', 'assumption', 'withheld', 'missing'])}
    ${join(doc.framework_refs.map((ref) => frameworkNote(cat, ref, 'print', lang)))}
    <p class="vz-muted vz-edition-note">${internal ? cat.text.editionInternalNote : cat.text.editionPublicNote}</p>
    ${foot(t.pageSources)}
  </section>
</main>
</body>
</html>`
}
