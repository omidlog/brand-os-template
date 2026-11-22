import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { RateLimiter } from './auth/rate-limit.js'
import { safeEqual, SessionStore } from './auth/session.js'
import { TotpVerifier } from './auth/totp.js'
import { GitHubError } from './github/client.js'
import { DeliveryLog, parsePush, verifyWebhookSignature } from './github/webhook.js'
import { BodyTooLarge, first, parseCookies, parseForm, readBody, redirect, safeLocalPath, securityHeaders, sendJson, serializeCookie } from './http.js'
import { i18n, isLocale, type Locale } from './i18n/index.js'
import type { BrandRecord } from './registry.js'
import { authRoutes } from './routes/auth.js'
import { createCore, withTimeout, type Handler, type RequestContext, type Route, type RouteInfo, type StudioDeps } from './routes/context.js'
import { requestGuards } from './routes/guards.js'
import { provisioningRoutes } from './routes/provisioning.js'
import { sendStatic, studioAssets } from './static-assets.js'
import { brandIsReady } from './sync.js'
import type { UpdateStatus } from './template-update.js'
import type { BrandView } from './views/layout.js'
import { knowledgeNotePage, knowledgePage, parseKnowledgeQuery } from './views/knowledge.js'
import * as pages from './views/pages.js'

export type { RouteInfo, StudioDeps } from './routes/context.js'

const STATIC_FILES: Record<string, string> = {
  'studio.css': 'text/css; charset=utf-8',
  'studio.js': 'text/javascript; charset=utf-8',
  'favicon.svg': 'image/svg+xml',
  'logo-omid-ataei-white.svg': 'image/svg+xml',
  'fonts/inter-var.woff2': 'font/woff2',
  'fonts/rajdhani-medium.woff2': 'font/woff2',
  'fonts/rajdhani-semibold.woff2': 'font/woff2',
  'fonts/rajdhani-bold.woff2': 'font/woff2',
  'fonts/vazirmatn-var.woff2': 'font/woff2',
}
const BRAND_SECTIONS = ['brand-book', 'design', 'assets', 'business', 'personal', 'knowledge', 'history', 'handoff'] as const

/**
 * The Studio HTTP application.
 *
 * Read-only by construction: the route table below is the complete list of endpoints. The only
 * non-GET routes are sign-in, sign-out, the owner-only provisioning routes (create, retry, discard a
 * failed attempt from Studio's own registry), the cache refresh, the signed GitHub webhook, and
 * "Open update PR" (Studio's second GitHub write: a new `template-update/<sha>` branch and a pull
 * request in a brand repository; never the default branch, never a merge). None of them writes brand
 * facts, documents or assets. Every brand route resolves the slug through the
 * server-side registry, so a forged slug cannot select a repository.
 */
export function createStudio(deps: StudioDeps): {
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  sessions: SessionStore
  routes: RouteInfo[]
} {
  const { config, registry, sync, provisioning, templateUpdates } = deps
  const now = deps.now ?? Date.now
  const sessions = new SessionStore(config.sessionTtlMs, config.idleTtlMs, now)
  const totp = config.ownerTotpSecret ? new TotpVerifier(config.ownerTotpSecret) : null
  const core = createCore(deps, sessions, totp)
  const { log, view, render, notFound, brandRecord } = core
  const refreshLimiter = new RateLimiter(1, 5_000, now)
  const testLimiter = new RateLimiter(5, 60_000, now)
  const updateLimiter = new RateLimiter(6, 10 * 60_000, now)
  const deliveries = new DeliveryLog()
  const autoRefreshAt = new Map<string, number>()
  const sessionCookie = core.cookies.session
  const langCookie = core.cookies.lang

  const { clientIp, hostAllowed, sameOrigin } = requestGuards(config)

  async function brandView(ctx: RequestContext, record: BrandRecord): Promise<BrandView> {
    let cached = sync.get(record.slug)
    if (cached.status.state === 'never' && !sync.isRefreshing(record.slug)) {
      // First view: read GitHub now, but never hang the page for long.
      cached = await Promise.race([sync.refresh(record.slug), new Promise<typeof cached>((resolve) => setTimeout(() => resolve(sync.get(record.slug)), 25_000))])
    } else if (sync.isStale(record.slug, cached.status) && !sync.isRefreshing(record.slug)) {
      const last = autoRefreshAt.get(record.slug) ?? 0
      if (now() - last > 30_000) {
        autoRefreshAt.set(record.slug, now())
        void sync.refresh(record.slug).catch(() => undefined)
      }
    }
    return { record, cached, stale: sync.isStale(record.slug, cached.status), refreshing: sync.isRefreshing(record.slug) }
  }

  /* ------------------------------------------------------------ handlers */

  /** Liveness and readiness in one: the process answers and its data directory is writable. Reveals nothing else. */
  const health: Handler = (ctx) => {
    let ok = true
    try {
      fs.accessSync(config.dataDir, fs.constants.W_OK)
    } catch {
      ok = false
    }
    ctx.res.statusCode = ok ? 200 : 503
    ctx.res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    ctx.res.setHeader('Cache-Control', 'no-store')
    ctx.res.end(ok ? 'ok\n' : 'unavailable\n')
  }

  const staticFile: Handler = (ctx, match) => {
    const name = match[1] ?? ''
    const type = STATIC_FILES[name]
    if (!type) return notFound(ctx)
    // Served from memory with an ETag; see static-assets.ts for the cache policy.
    sendStatic(ctx.req, ctx.res, name, type, studioAssets.get(name), ctx.url.searchParams.get('v'))
  }

  const { loginForm, login, logout } = authRoutes(core, { clientIp, sameOrigin })

  const home: Handler = (ctx) => redirect(ctx.res, '/brands', 302)

  const brands: Handler = (ctx) => {
    const synced = new Map<string, { sha: string | null; at: string | null }>()
    const updates = new Map<string, UpdateStatus>()
    // Never waits for GitHub: the cached template head, refreshed in the background when due.
    const head = templateUpdates.peekHead()
    for (const record of registry.list()) {
      const cached = sync.get(record.slug)
      const status = cached.status
      synced.set(record.slug, { sha: status.sha, at: status.committed_at ?? status.synced_at })
      if (brandIsReady(record) && cached.projection) updates.set(record.slug, templateUpdates.status(cached.projection, head, cached.history?.pulls ?? []))
    }
    render(ctx, 200, pages.brandsPage(view(ctx), { canCreate: provisioning.configured, synced, updates, discarded: ctx.url.searchParams.get('discarded') === '1' }))
  }

  const { newBrandForm, repoCheck, createBrand, provisioningStatus, provisioningJson, retryProvisioning, discardForm, discardProvisioning } = provisioningRoutes(core)

  const refresh: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const back = safeLocalPath(first(ctx.form.return), `/brands/${record.slug}`)
    const target = back === `/brands/${record.slug}` || back.startsWith(`/brands/${record.slug}/`) ? back : `/brands/${record.slug}`
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`)
    if (!refreshLimiter.take(record.slug).ok) return redirect(ctx.res, `${target}?sync=too-soon`)
    const result = await Promise.race([sync.refresh(record.slug), new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000))])
    const ok = result !== null && result.status.last_error === null
    redirect(ctx.res, `${target}?sync=${ok ? 'synced' : 'failed'}`)
  }

  function updateFlash(ctx: RequestContext, record: BrandRecord): pages.UpdatePanel['flash'] {
    const code = ctx.url.searchParams.get('update')
    const allowed = ['opened', 'exists', 'current', 'untracked', 'not_configured', 'busy', 'failed', 'pending', 'too_soon'] as const
    if (!allowed.includes(code as (typeof allowed)[number])) return null
    const number = Number(ctx.url.searchParams.get('pr') ?? '')
    const url = Number.isInteger(number) && number > 0 && number < 1e7 ? `https://github.com/${record.repo.owner}/${record.repo.name}/pull/${number}` : null
    return { code: code as (typeof allowed)[number], number: url ? number : null, url }
  }

  /** Studio's second GitHub write: opens (never merges) one template update pull request. */
  const openUpdatePull: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const back = `/brands/${record.slug}`
    if (!brandIsReady(record)) return redirect(ctx.res, `${back}/provisioning`)
    if (!updateLimiter.take('owner').ok) return redirect(ctx.res, `${back}?update=too_soon#template-update`)
    const actor = ctx.session?.login ?? 'owner'
    const result = await withTimeout(templateUpdates.openUpdatePull(record.slug, actor), 90_000)
    if (!result) return redirect(ctx.res, `${back}?update=pending#template-update`)
    if (result.ok && (result.code === 'opened' || result.code === 'exists')) {
      // The brand's open pull requests changed; the next view re-reads them.
      sync.markDirty(record.slug)
      return redirect(ctx.res, `${back}?update=${result.code}&pr=${result.pull.number}#template-update`)
    }
    redirect(ctx.res, `${back}?update=${result.code}#template-update`)
  }

  const assetFile: Handler = (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    const file = sync.previewFile(record.slug, match[2] ?? '')
    if (!file) return notFound(ctx)
    ctx.res.statusCode = 200
    ctx.res.setHeader('Content-Type', file.mime)
    ctx.res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    ctx.res.setHeader('Content-Disposition', 'inline; filename="asset"')
    ctx.res.setHeader('Cache-Control', 'private, max-age=300')
    ctx.res.end(fs.readFileSync(file.file))
  }

  const brandPage: Handler = async (ctx, match) => {
    const record = brandRecord(ctx, match[1] ?? '')
    if (!record) return
    if (!brandIsReady(record)) return redirect(ctx.res, `/brands/${record.slug}/provisioning`, 302)
    const section = (match[2] ?? 'overview') as (typeof BRAND_SECTIONS)[number] | 'overview'
    const brand = await brandView(ctx, record)
    const flash = ctx.url.searchParams.get('sync')
    const flashValue = flash === 'synced' || flash === 'failed' || flash === 'too-soon' ? flash : null
    const doc = ctx.url.searchParams.get('doc')
    const v = view(ctx)
    switch (section) {
      case 'overview': {
        // Waits briefly for a due template check; a slow or failing GitHub only makes the state "unknown".
        const head = (await withTimeout(templateUpdates.templateHead(), 3_000)) ?? templateUpdates.peekHead()
        const update: pages.UpdatePanel = {
          status: templateUpdates.status(brand.cached.projection, head, brand.cached.history?.pulls ?? []),
          canOpen: templateUpdates.canOpen(record),
          busy: templateUpdates.isBusy(record.slug),
          template: templateUpdates.template,
          flash: updateFlash(ctx, record),
        }
        return render(ctx, 200, pages.overviewPage(v, brand, flashValue, update))
      }
      case 'brand-book':
        return render(ctx, 200, pages.brandBookPage(v, brand, flashValue))
      case 'design':
        return render(ctx, 200, pages.designPage(v, brand, flashValue))
      case 'assets':
        return render(ctx, 200, pages.assetsPage(v, brand, flashValue))
      case 'business':
        return render(ctx, 200, pages.businessPage(v, brand, doc, flashValue))
      case 'personal':
        // The section exists only when the Personal Brand OS module is enabled in the repository.
        if (!brand.cached.projection?.personal) return notFound(ctx)
        return render(ctx, 200, pages.personalPage(v, brand, doc, flashValue))
      case 'knowledge': {
        // Read only. Query parameters only filter the already safe projection of merged shared notes.
        const query = parseKnowledgeQuery(ctx.url.searchParams)
        if (query.note === null) return render(ctx, 200, knowledgePage(v, brand, query, flashValue))
        const knowledge = brand.cached.projection?.knowledge
        const note = query.note ? knowledge?.notes.find((item) => item.id === query.note) : undefined
        if (!knowledge || !note) return notFound(ctx)
        return render(ctx, 200, knowledgeNotePage(v, brand, note, knowledge, flashValue))
      }
      case 'history':
        return render(ctx, 200, pages.historyPage(v, brand, flashValue))
      case 'handoff':
        return render(ctx, 200, pages.handoffPage(v, brand, flashValue))
    }
  }

  const account: Handler = async (ctx) => {
    let test: pages.AccountState['test'] = null
    if (ctx.url.searchParams.get('test') === '1' && testLimiter.take('owner').ok) {
      test = { read: null, provision: null, error: null }
      try {
        if (deps.readClient.configured) test.read = (await deps.readClient.viewer()).login
        if (deps.provisionClient.configured) test.provision = (await deps.provisionClient.viewer()).login
        if (!deps.readClient.configured && !deps.provisionClient.configured) test.error = ctx.i.t('common.notConfigured')
      } catch (error) {
        test.error = error instanceof GitHubError ? error.message : 'GitHub could not be reached.'
      }
    }
    const session = ctx.session!
    render(
      ctx,
      200,
      pages.accountPage(view(ctx), {
        mfa: totp !== null,
        sessionEndsAt: new Date(session.createdAt + config.sessionTtlMs).toISOString(),
        readConfigured: deps.readClient.configured,
        provisionConfigured: provisioning.configured,
        template: `${config.github.templateOwner}/${config.github.templateRepo}`,
        allowedOwners: config.github.allowedOwners,
        webhookConfigured: config.github.webhookSecret !== null,
        test,
      }),
    )
  }

  const webhook: Handler = (ctx) => {
    if (!verifyWebhookSignature(config.github.webhookSecret, ctx.raw, ctx.req.headers['x-hub-signature-256'] as string | undefined)) {
      log('webhook signature rejected')
      return sendJson(ctx.res, 401, { error: 'invalid_signature' })
    }
    const delivery = ctx.req.headers['x-github-delivery'] as string | undefined
    if (!deliveries.firstTime(delivery)) return sendJson(ctx.res, 200, { status: 'duplicate' })
    const event = ctx.req.headers['x-github-event']
    if (event === 'ping') return sendJson(ctx.res, 200, { status: 'pong' })
    if (event !== 'push') return sendJson(ctx.res, 202, { status: 'ignored' })
    let body: unknown
    try {
      body = JSON.parse(ctx.raw.toString('utf8'))
    } catch {
      return sendJson(ctx.res, 400, { error: 'invalid_json' })
    }
    const push = parsePush(body)
    if (!push) return sendJson(ctx.res, 400, { error: 'invalid_push' })
    const record = registry.byRepository(push.repositoryId, push.fullName)
    if (!record || !brandIsReady(record) || push.ref !== `refs/heads/${record.repo.default_branch}`) return sendJson(ctx.res, 202, { status: 'ignored' })
    // The payload is only a hint. Studio fetches the branch itself with its own read access.
    sync.markDirty(record.slug)
    void sync.refresh(record.slug).catch(() => undefined)
    log(`webhook push for ${record.slug}`)
    sendJson(ctx.res, 202, { status: 'refreshing' })
  }

  const SLUG = '([a-z0-9]+(?:-[a-z0-9]+)*)'
  const routes: Route[] = [
    { method: 'GET', pattern: /^\/healthz$/, auth: 'none', handle: health },
    { method: 'GET', pattern: /^\/static\/((?:fonts\/)?[a-z0-9.-]+)$/, auth: 'none', handle: staticFile },
    { method: 'GET', pattern: /^\/login$/, auth: 'none', handle: loginForm },
    { method: 'POST', pattern: /^\/login$/, auth: 'none', writes: 'creates an owner session', handle: login },
    { method: 'POST', pattern: /^\/logout$/, auth: 'session', writes: 'ends the owner session', handle: logout },
    { method: 'POST', pattern: /^\/webhooks\/github$/, auth: 'none', writes: 'marks a brand cache stale (signed GitHub push only)', handle: webhook },
    { method: 'GET', pattern: /^\/$/, auth: 'session', handle: home },
    { method: 'GET', pattern: /^\/account$/, auth: 'session', handle: account },
    { method: 'GET', pattern: /^\/brands$/, auth: 'session', handle: brands },
    { method: 'GET', pattern: /^\/brands\/new$/, auth: 'session', handle: newBrandForm },
    { method: 'GET', pattern: /^\/brands\/new\/repo-check\.json$/, auth: 'session', handle: repoCheck },
    { method: 'POST', pattern: /^\/brands\/new$/, auth: 'session', writes: 'provisions one new private brand repository (the first of two GitHub writes)', handle: createBrand },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning$`), auth: 'session', handle: provisioningStatus },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning\\.json$`), auth: 'session', handle: provisioningJson },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/provisioning/retry$`), auth: 'session', writes: 'retries a failed provisioning of a new repository', handle: retryProvisioning },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/provisioning/discard$`), auth: 'session', handle: discardForm },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/provisioning/discard$`), auth: 'session', writes: "removes a failed provisioning attempt from Studio's registry (never calls GitHub)", handle: discardProvisioning },
    { method: 'POST', pattern: new RegExp(`^/brands/${SLUG}/refresh$`), auth: 'session', writes: 'refreshes the Studio read cache from GitHub', handle: refresh },
    {
      method: 'POST',
      pattern: new RegExp(`^/brands/${SLUG}/template-update$`),
      auth: 'session',
      writes: 'opens one template update pull request on a new template-update/<sha> branch in the brand repository (never the default branch, never a merge)',
      handle: openUpdatePull,
    },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}/assets/file/([0-9a-f]{64})$`), auth: 'session', handle: assetFile },
    { method: 'GET', pattern: new RegExp(`^/brands/${SLUG}(?:/(${BRAND_SECTIONS.join('|')}))?$`), auth: 'session', handle: brandPage },
  ]

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    securityHeaders(res, config.secureCookies)
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://studio.invalid')
    } catch {
      res.statusCode = 400
      res.end()
      return
    }
    if (url.pathname !== '/healthz' && !hostAllowed(req)) {
      res.statusCode = 421
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end('Misdirected request.\n')
      return
    }
    const cookies = parseCookies(req.headers.cookie)
    const method = req.method === 'HEAD' ? 'GET' : (req.method ?? 'GET')
    const lang = url.searchParams.get('lang')
    if (method === 'GET' && isLocale(lang)) {
      res.setHeader('Set-Cookie', serializeCookie(langCookie, lang, { secure: config.secureCookies, maxAgeSeconds: 365 * 86400 }))
      url.searchParams.delete('lang')
      const rest = url.searchParams.toString()
      return redirect(res, `${url.pathname}${rest ? `?${rest}` : ''}`, 302)
    }
    const locale: Locale = isLocale(cookies[langCookie]) ? (cookies[langCookie] as Locale) : 'en'
    const sessionId = cookies[sessionCookie] ?? null
    const session = sessions.get(sessionId ?? undefined)
    const ctx: RequestContext = { req, res, url, locale, i: i18n(locale), session, sessionId: session ? sessionId : null, form: {}, raw: Buffer.alloc(0) }
    const candidates = routes.filter((route) => route.pattern.test(url.pathname))
    const route = candidates.find((item) => item.method === method)
    try {
      if (!route) {
        if (candidates.length) {
          res.setHeader('Allow', [...new Set(candidates.map((item) => item.method))].join(', '))
          if (!session) return sendJson(res, 405, { error: 'method_not_allowed' })
          return render(ctx, 405, pages.errorPage(view(ctx), 'method'))
        }
        if (!session) return redirect(res, '/login', 302)
        return notFound(ctx)
      }
      if (route.auth === 'session' && !session) {
        // Guests learn nothing, not even whether a brand slug exists.
        if (method === 'GET' && !url.pathname.endsWith('.json')) return redirect(res, `/login?next=${encodeURIComponent(url.pathname)}`, 302)
        return sendJson(res, 401, { error: 'authentication_required' })
      }
      if (method === 'POST') {
        const isWebhook = route.handle === webhook
        try {
          ctx.raw = await readBody(req, isWebhook ? 1024 * 1024 : 32 * 1024)
        } catch (error) {
          if (error instanceof BodyTooLarge) return sendJson(res, 413, { error: 'too_large' })
          throw error
        }
        if (!isWebhook) {
          const type = req.headers['content-type'] ?? ''
          if (!type.startsWith('application/x-www-form-urlencoded')) return sendJson(res, 415, { error: 'unsupported_media_type' })
          ctx.form = parseForm(ctx.raw)
        }
        if (route.auth === 'session') {
          if (!sameOrigin(req) || !safeEqual(first(ctx.form._csrf), session!.csrf)) return render(ctx, 403, pages.errorPage(view(ctx), 'forbidden'))
        }
      }
      await route.handle(ctx, url.pathname.match(route.pattern)!)
    } catch (error) {
      log(`error on ${method} ${url.pathname}: ${error instanceof Error ? error.message : 'unknown'}`)
      if (!res.headersSent) {
        if (session) render(ctx, 500, pages.errorPage(view(ctx), 'server'))
        else sendJson(res, 500, { error: 'server_error' })
      } else res.end()
    }
  }

  return {
    handle,
    sessions,
    routes: routes.map((route) => ({ method: route.method, pattern: route.pattern.source, auth: route.auth, writes: route.writes ?? null })),
  }
}
