import { redirect } from '../http.js'
import { brandIsReady } from '../sync.js'
import type { BrandView } from '../views/layout.js'
import { visualPage, visualPrintPage } from '../views/visual-page.js'
import type { Handler, StudioCore } from './context.js'

/**
 * Visual Blueprint P0: the business model canvas page and its static print view. GET only, read from the sync
 * cache; nothing here writes, refreshes or calls GitHub. A brand that was never synced is sent to its overview,
 * which performs the first read.
 */
export function visualRoutes(core: StudioCore): { visual: Handler } {
  const { sync, view, render, notFound, brandRecord } = core

  const visual: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`, 302)
    const cached = sync.get(record.slug)
    if (cached.status.state === 'never') return redirect(ctx.res, `/brands/${record.slug}`, 302)
    const brand: BrandView = { record, cached, stale: sync.isStale(record.slug, cached.status), refreshing: sync.isRefreshing(record.slug) }
    const flash = ctx.url.searchParams.get('sync')
    const flashValue = flash === 'synced' || flash === 'failed' || flash === 'too-soon' ? flash : null
    if (match[2] !== 'print') return render(ctx, 200, visualPage(view(ctx), brand, flashValue))
    const edition = ctx.url.searchParams.get('edition') === 'public' ? 'public' : 'internal'
    const page = visualPrintPage(view(ctx), brand, edition)
    if (!page) return notFound(ctx)
    render(ctx, 200, page)
  }

  return { visual }
}
