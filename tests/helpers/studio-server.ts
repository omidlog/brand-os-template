import crypto from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { buildStudio } from '../../apps/studio/src/app.js'
import { hashPassword } from '../../apps/studio/src/auth/password.js'
import { totpAt } from '../../apps/studio/src/auth/totp.js'
import type { StudioConfig } from '../../apps/studio/src/config.js'
import { FakeGitHub, templateTree } from './fake-github.js'
import { OWNER, PROVISION_TOKEN, READ_TOKEN, TEMPLATE } from './studio.js'
import { closeServer, removeTempDir, tempDir } from './cleanup.js'

export const OWNER_LOGIN = 'owner'
export const OWNER_PASSWORD = 'correct horse battery staple'
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
export const WEBHOOK_SECRET = 'test-webhook-secret-0123456789'
export const SESSION_SECRET = crypto.randomBytes(32)
// Cheap scrypt parameters for tests only; production uses the defaults.
const PASSWORD_HASH = hashPassword(OWNER_PASSWORD, { N: 2 ** 12, r: 8, p: 1 })

export interface RunningStudio {
  url: string
  origin: string
  github: FakeGitHub
  studio: ReturnType<typeof buildStudio>
  config: StudioConfig
  /** Stops the server; removes the data directory it created unless `keepData` (a caller-supplied dataDir is never removed). */
  close: (options?: { keepData?: boolean }) => Promise<void>
}

export async function startStudio(overrides: Partial<StudioConfig> = {}, githubOverrides: Partial<StudioConfig['github']> = {}): Promise<RunningStudio> {
  const github = new FakeGitHub()
  github.addRepo(TEMPLATE.owner, TEMPLATE.repo, templateTree(), { private: false, is_template: true })
  const ownsData = overrides.dataDir === undefined
  const dataDir = overrides.dataDir ?? tempDir('studio-server-')
  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const origin = `http://127.0.0.1:${port}`
  const config: StudioConfig = {
    host: '127.0.0.1',
    port,
    publicOrigin: origin,
    dataDir,
    ownerLogin: OWNER_LOGIN,
    ownerPasswordHash: PASSWORD_HASH,
    ownerTotpSecret: TOTP_SECRET,
    sessionSecret: SESSION_SECRET,
    sessionTtlMs: 3600_000,
    idleTtlMs: 1800_000,
    syncTtlMs: 300_000,
    templateCheck: { intervalMs: 0, autoOpen: false },
    secureCookies: false,
    trustProxy: false,
    ...overrides,
    github: {
      readToken: READ_TOKEN,
      provisionToken: PROVISION_TOKEN,
      templateOwner: TEMPLATE.owner,
      templateRepo: TEMPLATE.repo,
      allowedOwners: [OWNER],
      webhookSecret: WEBHOOK_SECRET,
      ...githubOverrides,
    },
  }
  const studio = buildStudio(config, { fetch: github.fetch, sleep: async () => undefined })
  server.on('request', (req, res) => void studio.handle(req, res))
  return {
    url: origin,
    origin,
    github,
    studio,
    config,
    close: async (options = {}) => {
      try {
        await studio.provisioning.settled()
        await studio.sync.settled()
      } finally {
        await closeServer(server)
        if (ownsData && !options.keepData) removeTempDir(dataDir)
      }
    },
  }
}

/**
 * TOTP steps already used by a sign-in in this test process. Studio refuses a reused code, and the server accepts the
 * previous, current and next 30-second step, so each sign-in (HTTP client or browser) takes an accepted step that no
 * earlier sign-in used. A per-call drift is not enough: a `+30 s` code followed by a `0` code one step later is the
 * same code, and Studio refuses it as reused.
 */
const usedTotpSteps = new Set<number>()

/**
 * A TOTP code for a step no sign-in in this process has used. Never starts within 8 s of a step boundary, so the
 * previous step's code is still accepted when a slow request or a browser form reaches the server.
 */
export async function freshTotp(): Promise<string> {
  for (;;) {
    const now = Date.now()
    const left = 30_000 - (now % 30_000)
    if (left >= 8_000) {
      const step = Math.floor(now / 30_000)
      for (const candidate of [step, step + 1, step - 1]) {
        if (usedTotpSteps.has(candidate)) continue
        usedTotpSteps.add(candidate)
        return totpAt(TOTP_SECRET, candidate * 30_000 + 1_000)
      }
    }
    await new Promise((resolve) => setTimeout(resolve, left + 50))
  }
}

/** A tiny browser: cookie jar, manual redirects, Origin header on POST. */
export class Client {
  cookies = new Map<string, string>()

  constructor(readonly base: string) {}

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  }

  private store(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair = ''] = line.split(';')
      const index = pair.indexOf('=')
      const name = pair.slice(0, index)
      const value = pair.slice(index + 1)
      if (/Max-Age=0/i.test(line) || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async request(method: string, pathname: string, options: { form?: Record<string, string | string[]>; headers?: Record<string, string>; body?: string | Buffer; origin?: string | null } = {}): Promise<Response> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) }
    if (this.cookies.size) headers.cookie = this.cookieHeader()
    let body: string | Buffer | undefined = options.body
    if (options.form) {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(options.form)) for (const item of [value].flat()) params.append(key, item)
      body = params.toString()
      headers['content-type'] = 'application/x-www-form-urlencoded'
    }
    if (method !== 'GET' && options.origin !== null) headers.origin = options.origin ?? this.base
    const res = await fetch(`${this.base}${pathname}`, { method, headers, body: typeof body === 'string' || body === undefined ? body : new Uint8Array(body), redirect: 'manual' })
    this.store(res)
    return res
  }

  get(pathname: string): Promise<Response> {
    return this.request('GET', pathname)
  }

  async page(pathname: string): Promise<{ res: Response; text: string }> {
    const res = await this.get(pathname)
    return { res, text: await res.text() }
  }

  async csrf(pathname: string): Promise<string> {
    const { text } = await this.page(pathname)
    const match = text.match(/name="_csrf" value="([^"]+)"/)
    if (!match) throw new Error(`no csrf on ${pathname}`)
    return match[1]!
  }

  async login(): Promise<void> {
    const token = await this.csrf('/login')
    // Each login uses an unused TOTP step so replay protection does not reject repeated logins in one test.
    const code = await freshTotp()
    const res = await this.request('POST', '/login', { form: { _csrf: token, login: OWNER_LOGIN, password: OWNER_PASSWORD, totp: code, next: '/brands' } })
    if (res.status !== 303) throw new Error(`login failed: ${res.status} ${await res.text()}`)
  }
}
