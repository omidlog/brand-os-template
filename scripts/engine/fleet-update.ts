import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

/**
 * Engine fleet update, run by `.github/workflows/engine-release.yml` in the template after a green release build.
 * For each brand repository it opens one pull request that brings the brand to the new engine:
 *
 *   clone → replace .brand-os/engine/ → (first time: brand-os convert) → brand-os migrate → brand-os scaffold
 *   → brand-os check → commit on engine-update/<version> → push → pull request → close older engine-update PRs
 *   → when the repository has the topic `brand-os-auto-merge`: merge after its brand-check passes.
 *
 * It never pushes to the default branch and never force-pushes. Migrations change only engine-owned files and
 * structure, never an answer, fact or approval. Needs `git` and `gh` with GH_TOKEN (contents, pull requests and
 * workflows write on the brand repositories).
 *
 *   tsx scripts/engine/fleet-update.ts --engine dist/engine --template-dir . (--repos owner/a,owner/b | --discover owner1,owner2)
 */
const { values } = parseArgs({
  options: {
    engine: { type: 'string', default: 'dist/engine' },
    'template-dir': { type: 'string', default: '.' },
    repos: { type: 'string' },
    discover: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'merge-wait-seconds': { type: 'string', default: '600' },
  },
})

export const BRAND_TOPIC = 'brand-os-brand'
export const AUTO_MERGE_TOPIC = 'brand-os-auto-merge'

type Outcome = 'opened' | 'exists' | 'current' | 'merged' | 'auto_merge_waiting' | 'check_failed' | 'failed'
interface Result {
  repo: string
  outcome: Outcome
  pull?: string
  detail?: string
}

const engineDir = path.resolve(values.engine)
const templateDir = path.resolve(values['template-dir'])
const version = fs.readFileSync(path.join(engineDir, 'VERSION'), 'utf8').trim()
const branch = `engine-update/${version}`

function gh(args: string[], cwd?: string): string {
  return execFileSync('gh', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function discover(owners: string[]): string[] {
  const repos = new Set<string>()
  for (const owner of owners) {
    const out = gh(['api', '--paginate', `search/repositories?q=topic:${BRAND_TOPIC}+user:${owner}&per_page=100`, '--jq', '.items[].full_name'])
    for (const name of out.split('\n').filter(Boolean)) repos.add(name)
  }
  return [...repos].sort()
}

function topics(repo: string): string[] {
  return gh(['api', `repos/${repo}/topics`, '--jq', '.names[]']).split('\n').filter(Boolean)
}

function engine(args: string[], cwd: string): { ok: boolean; output: string } {
  const run = spawnSync(process.execPath, ['.brand-os/engine/brand-os.mjs', ...args], { cwd, encoding: 'utf8', env: { ...process.env, BRAND_OS_KEYCHAIN: 'off' } })
  return { ok: run.status === 0, output: `${run.stdout}${run.stderr}`.trim() }
}

function update(repo: string): Result {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-fleet-'))
  try {
    gh(['repo', 'clone', repo, work, '--', '--quiet'])
    if (git(['ls-remote', '--heads', 'origin', branch], work)) return { repo, outcome: 'exists', detail: `${branch} already exists` }
    git(['checkout', '-q', '-b', branch], work)
    const firstTime = !fs.existsSync(path.join(work, '.brand-os', 'engine', 'VERSION'))
    fs.rmSync(path.join(work, '.brand-os', 'engine'), { recursive: true, force: true })
    fs.cpSync(engineDir, path.join(work, '.brand-os', 'engine'), { recursive: true })
    const steps: Array<[string, string[]]> = [
      ...(firstTime ? ([['convert', ['convert', '--template-dir', templateDir]]] as Array<[string, string[]]>) : []),
      ['migrate', ['migrate']],
      ['scaffold', ['scaffold']],
    ]
    for (const [name, args] of steps) {
      const result = engine(args, work)
      if (!result.ok) return { repo, outcome: 'failed', detail: `${name}: ${result.output.slice(0, 500)}` }
    }
    const check = engine(['check'], work)
    git(['add', '-A'], work)
    if (!git(['status', '--porcelain'], work)) return { repo, outcome: 'current' }
    const title = firstTime ? `Convert to a data-only brand on Brand OS engine ${version}` : `Update Brand OS engine to ${version}`
    git(['-c', 'user.name=Brand OS engine', '-c', 'user.email=brand-os-engine@users.noreply.github.com', 'commit', '-q', '-m', `${title}\n\nWritten by the Brand OS engine release. Engine-owned files and migrations only; no answer, fact or approval changed.`], work)
    if (values['dry-run']) return { repo, outcome: 'opened', detail: 'dry run: nothing pushed' }
    git(['push', '-q', 'origin', branch], work)
    const body = [
      `Brings this brand to Brand OS engine \`${version}\`.`,
      '',
      firstTime
        ? '- **One-time conversion to a data-only repository:** template code is removed; the engine lives in `.brand-os/engine/`; unchanged template copies under `brand/` are removed; brand data is untouched.'
        : '- `.brand-os/engine/` is replaced; engine migrations and the engine-owned root files (package.json scripts, workflow, AGENTS.md, CLAUDE.md) are refreshed.',
      '- No answer, fact, approval, asset or evidence is changed.',
      `- \`brand-os check\`: ${check.ok ? 'passed' : 'FAILED — see below; this pull request is not merged automatically'}.`,
      ...(check.ok ? [] : ['', '```', check.output.slice(0, 3000), '```']),
    ].join('\n')
    const pull = gh(['pr', 'create', '--repo', repo, '--head', branch, '--title', title, '--body', body], work)
    // One open engine update at a time: older ones are closed as superseded.
    const older = gh(['pr', 'list', '--repo', repo, '--state', 'open', '--search', 'head:engine-update/', '--json', 'number,headRefName', '--jq', `.[] | select(.headRefName != "${branch}") | .number`])
    for (const number of older.split('\n').filter(Boolean)) gh(['pr', 'close', number, '--repo', repo, '--comment', `Superseded by ${pull}.`])
    if (!check.ok) return { repo, outcome: 'check_failed', pull, detail: check.output.slice(0, 500) }
    if (!topics(repo).includes(AUTO_MERGE_TOPIC)) return { repo, outcome: 'opened', pull }
    // Auto-merge only after the brand's own check passes on GitHub.
    const deadline = Date.now() + Number(values['merge-wait-seconds']) * 1000
    while (Date.now() < deadline) {
      const watched = spawnSync('gh', ['pr', 'checks', pull, '--repo', repo, '--watch', '--interval', '10', '--fail-fast'], { encoding: 'utf8', timeout: Math.max(1000, deadline - Date.now()) })
      if (watched.status === 0) {
        gh(['pr', 'merge', pull, '--repo', repo, '--merge'])
        return { repo, outcome: 'merged', pull }
      }
      if (watched.status === 1) return { repo, outcome: 'check_failed', pull, detail: 'brand-check failed on GitHub' }
      // status 8 (checks pending) or no checks reported yet: wait and try again.
      spawnSync('sleep', ['10'])
    }
    return { repo, outcome: 'auto_merge_waiting', pull, detail: 'brand-check did not finish in time; merge it by hand' }
  } catch (error) {
    return { repo, outcome: 'failed', detail: error instanceof Error ? error.message.slice(0, 500) : String(error) }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

const repos = values.repos ? values.repos.split(',').map((item) => item.trim()).filter(Boolean) : values.discover ? discover(values.discover.split(',').map((item) => item.trim()).filter(Boolean)) : []
if (!repos.length) {
  console.error('No brand repositories: pass --repos owner/name,… or --discover owner,… (repositories with the topic brand-os-brand).')
  process.exit(2)
}
const results = repos.map(update)
const lines = results.map((result) => `| ${result.repo} | ${result.outcome} | ${result.pull ?? ''} | ${(result.detail ?? '').replace(/\n/g, ' ').slice(0, 200)} |`)
const summary = [`### Brand OS engine ${version}`, '', '| Brand | Result | Pull request | Detail |', '| --- | --- | --- | --- |', ...lines, ''].join('\n')
console.log(summary)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
if (results.some((result) => result.outcome === 'failed')) process.exitCode = 1
