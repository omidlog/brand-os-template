import fs from 'node:fs'
import path from 'node:path'
import { GitHubError, type GitHubClient, type PullSummary } from './github/client.js'
import type { StudioProjection } from './projection.js'
import type { BrandRecord, Registry } from './registry.js'
import { brandIsReady } from './sync.js'

/**
 * Engine updates for brand repositories (engine + data).
 *
 * - **Check** (read-only): compare the engine version a brand commits in `.brand-os/engine/VERSION` (from the sync
 *   projection) with the template's newest `engine-v<version>` release. The release is cached; errors and rate limits
 *   back off and never break a page.
 * - **Update** (one brand) and **Update all brands**: start the template's `engine-release` workflow
 *   (`workflow_dispatch`). That workflow, not Studio, opens one `engine-update/<version>` pull request per brand.
 *   Studio itself never writes to a brand repository for an update, never moves a default branch and never merges.
 *   A brand that opted in with the topic `brand-os-auto-merge` is merged by GitHub after its own brand-check passes.
 */
export const UPDATE_BRANCH_PREFIXES = ['engine-update/', 'template-update/'] as const
export const BRAND_TOPIC = 'brand-os-brand'

export type UpdateState = 'current' | 'available' | 'untracked' | 'unknown'

export interface UpdateStatus {
  state: UpdateState
  /** Engine version the brand commits (null: not on the engine yet). */
  from: string | null
  /** Newest engine release Studio last saw. */
  to: string | null
  /** An open engine update pull request in the sync history, if any. */
  pull: PullSummary | null
}

export type OpenResult =
  | { ok: true; code: 'dispatched' }
  | { ok: false; code: 'not_configured' | 'busy' | 'failed'; message?: string; rateLimited?: boolean }

export interface TemplateUpdateDeps {
  registry: Registry
  /** The provisioning credential: reads the template's releases and starts its engine-release workflow. */
  github: GitHubClient
  templateOwner: string
  templateRepo: string
  allowedOwners: string[]
  dataDir: string
  now?: () => number
  log?: (line: string) => void
  /** How long a release read is trusted. */
  ttlMs?: number
}

interface ReleaseCache {
  version: string | null
  at: number
  /** No new GitHub read before this time (TTL, or a back-off after an error). */
  until: number
  error: string | null
  rateLimited: boolean
}

export function isUpdatePull(pull: PullSummary): boolean {
  return UPDATE_BRANCH_PREFIXES.some((prefix) => pull.head_ref.startsWith(prefix))
}

export class TemplateUpdateService {
  private release: ReleaseCache | null = null
  private inflight: Promise<string | null> | null = null
  private readonly busy = new Set<string>()
  private readonly now: () => number
  private readonly ttlMs: number

  constructor(private readonly deps: TemplateUpdateDeps) {
    this.now = deps.now ?? Date.now
    this.ttlMs = deps.ttlMs ?? 10 * 60_000
  }

  get configured(): boolean {
    return this.deps.github.configured
  }

  get template(): string {
    return `${this.deps.templateOwner}/${this.deps.templateRepo}`
  }

  /** Whether Studio may start an engine update for this brand's repository. */
  canOpen(record: BrandRecord): boolean {
    return this.configured && this.deps.allowedOwners.some((owner) => owner.toLowerCase() === record.repo.owner.toLowerCase())
  }

  isBusy(slug: string): boolean {
    return this.busy.has(slug)
  }

  /** The cached newest engine version without waiting; starts a background read when it is due. */
  peekHead(): string | null {
    if (this.configured && (!this.release || this.now() >= this.release.until)) void this.templateHead().catch(() => null)
    return this.release?.version ?? null
  }

  /**
   * The newest engine release of the template (GET only). Cached for the TTL; a failure keeps the last good value and
   * backs off (longer after a rate limit) so a broken GitHub never slows every page.
   */
  templateHead(options: { force?: boolean } = {}): Promise<string | null> {
    if (!this.configured) return Promise.resolve(null)
    if (!options.force && this.release && this.now() < this.release.until) return Promise.resolve(this.release.version)
    if (this.inflight) return this.inflight
    const job = (async () => {
      const at = this.now()
      try {
        const version = await this.deps.github.latestEngineRelease(this.deps.templateOwner, this.deps.templateRepo)
        this.release = { version, at, until: at + this.ttlMs, error: null, rateLimited: false }
      } catch (error) {
        const limited = error instanceof GitHubError && error.kind === 'rate_limited'
        const message = error instanceof GitHubError ? error.message : 'The template releases could not be read.'
        this.release = { version: this.release?.version ?? null, at: this.release?.at ?? at, until: at + (limited ? 15 * 60_000 : 2 * 60_000), error: message, rateLimited: limited }
        this.deps.log?.(`engine release check failed: ${error instanceof GitHubError ? error.kind : 'internal'}`)
      }
      return this.release.version
    })().finally(() => {
      this.inflight = null
    })
    this.inflight = job
    return job
  }

  /** Outcome of the last release read: an error message (null when it worked) and whether GitHub rate-limited it. */
  get headError(): { error: string | null; rateLimited: boolean } {
    return { error: this.release?.error ?? null, rateLimited: this.release?.rateLimited ?? false }
  }

  /** Compares a brand's engine version with the newest release. Pure. */
  status(projection: StudioProjection | null, latest: string | null, pulls: PullSummary[] = []): UpdateStatus {
    const pull = pulls.find(isUpdatePull) ?? null
    const engine = projection?.engine
    if (engine === undefined) return { state: 'unknown', from: null, to: latest, pull }
    // A brand that is still a full template copy: the next engine update converts it.
    if (engine === null) return { state: 'untracked', from: null, to: latest, pull }
    if (!latest) return { state: 'unknown', from: engine.version, to: null, pull }
    return { state: engine.version === latest ? 'current' : 'available', from: engine.version, to: latest, pull }
  }

  /** Starts the engine update for one brand (the template workflow opens its pull request). One run per brand at a time. */
  async openUpdatePull(slug: string, actor: string): Promise<OpenResult> {
    const record = this.deps.registry.get(slug)
    if (!record || !brandIsReady(record)) return { ok: false, code: 'failed', message: 'The brand is not ready.' }
    if (!this.canOpen(record)) {
      this.audit({ actor, scope: slug, repos: `${record.repo.owner}/${record.repo.name}`, result: 'not_configured' })
      return { ok: false, code: 'not_configured' }
    }
    if (this.busy.has(slug)) return { ok: false, code: 'busy' }
    this.busy.add(slug)
    try {
      return await this.dispatch(actor, slug, `${record.repo.owner}/${record.repo.name}`)
    } finally {
      this.busy.delete(slug)
    }
  }

  /** Starts the engine update for every brand of the allowed owners (the workflow finds them by topic). */
  async updateAll(actor: string): Promise<OpenResult> {
    if (!this.configured) return { ok: false, code: 'not_configured' }
    if (this.busy.has('*')) return { ok: false, code: 'busy' }
    this.busy.add('*')
    try {
      return await this.dispatch(actor, '*', '')
    } finally {
      this.busy.delete('*')
    }
  }

  /** Marks a repository Studio just created as a Brand OS brand and starts its first engine update (conversion). */
  async enrollNewBrand(record: BrandRecord, actor: string): Promise<void> {
    if (!this.canOpen(record)) return
    try {
      await this.deps.github.addTopics(record.repo.owner, record.repo.name, [BRAND_TOPIC])
      await this.dispatch(actor, record.slug, `${record.repo.owner}/${record.repo.name}`)
    } catch (error) {
      this.deps.log?.(`engine enrollment of ${record.slug} failed: ${error instanceof GitHubError ? error.kind : 'internal'}`)
    }
  }

  private async dispatch(actor: string, scope: string, repos: string): Promise<OpenResult> {
    try {
      await this.deps.github.dispatchEngineUpdate(this.deps.templateOwner, this.deps.templateRepo, { repos })
      this.audit({ actor, scope, repos: repos || 'all', result: 'dispatched' })
      return { ok: true, code: 'dispatched' }
    } catch (error) {
      const limited = error instanceof GitHubError && error.kind === 'rate_limited'
      this.audit({ actor, scope, repos: repos || 'all', result: 'failed', error: error instanceof GitHubError ? error.kind : 'internal' })
      return { ok: false, code: 'failed', message: error instanceof GitHubError ? error.message : 'The engine update could not be started.', rateLimited: limited }
    }
  }

  private audit(entry: { actor: string; scope: string; repos: string; result: string } & Record<string, unknown>): void {
    const line = JSON.stringify({ at: new Date(this.now()).toISOString(), action: 'engine_update_dispatch', ...entry })
    try {
      fs.appendFileSync(path.join(this.deps.dataDir, 'audit.jsonl'), `${line}\n`, { mode: 0o600 })
    } catch {
      this.deps.log?.('audit log could not be written')
    }
    this.deps.log?.(`engine update ${entry.result} for ${entry.scope} by ${entry.actor}`)
  }
}
