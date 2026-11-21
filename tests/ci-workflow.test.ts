import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { parse } from 'yaml'
import { writeStarterWorkspace } from '@brand-os/brand-core'
import { docsBuildPlan } from '../scripts/build-docs.js'
import { docsAudience } from '../scripts/docs-audience.js'
import { prepareDocs } from '../scripts/prepare-docs.js'
import { removeTempDir, tempDir } from './helpers/cleanup.js'

const REPO = path.resolve(import.meta.dirname, '..')

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  'timeout-minutes'?: number
}

interface Workflow {
  jobs: Record<string, { 'timeout-minutes'?: number; steps: Step[] }>
}

const workflow = parse(fs.readFileSync(path.join(REPO, '.github/workflows/validate.yml'), 'utf8')) as Workflow

/** The commands GitHub Actions would run for a brand with this docs audience. */
function commandsFor(publish: 'public' | 'private'): string[] {
  const commands: string[] = []
  for (const job of Object.values(workflow.jobs)) {
    for (const step of job.steps) {
      if (!step.run) continue
      if (step.if !== undefined) {
        const condition = step.if.replace(/\s+/g, ' ').trim()
        if (condition === "steps.docs.outputs.publish == 'public'") {
          if (publish !== 'public') continue
        } else if (condition === "steps.docs.outputs.publish != 'public'") {
          if (publish === 'public') continue
        } else {
          assert.fail(`the test does not understand the condition "${step.if}"; extend commandsFor()`)
        }
      }
      commands.push(step.run)
    }
  }
  return commands
}

/** Anything that builds or scans the PUBLIC docs. */
const PUBLIC_DOCS = [/--audience public/, /build:docs:nomascot/, /docs:build/, /scan-public/]

function brand(publish: 'public' | 'private'): string {
  const root = tempDir(`brand-os-ci-${publish}-`)
  writeStarterWorkspace(root)
  fs.cpSync(path.join(REPO, 'brand/tokens'), path.join(root, 'brand/tokens'), { recursive: true })
  const file = path.join(root, 'brand/brand.config.yaml')
  const config = fs.readFileSync(file, 'utf8').replace(/publish_docs:\s*\w+/, `publish_docs: ${publish}`)
  assert.match(config, new RegExp(`publish_docs: ${publish}`))
  fs.writeFileSync(file, config)
  return root
}

test('every CI job has a timeout, and the test step its own', () => {
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const minutes = job['timeout-minutes']
    assert.ok(typeof minutes === 'number' && minutes > 0 && minutes <= 30, `job ${name} needs timeout-minutes <= 30`)
    const testStep = job.steps.find((step) => step.run === 'npm run test')
    if (testStep) assert.ok((testStep['timeout-minutes'] ?? Infinity) <= minutes, 'the test step has a timeout')
  }
})

test('a private-docs brand: CI skips every public docs build and scan, and its remaining docs steps succeed', () => {
  const root = brand('private')
  try {
    assert.equal(docsAudience(root), 'private')

    // The workflow step writes the audience for the `if:` conditions.
    const output = path.join(root, 'github-output')
    const cli = spawnSync(process.execPath, ['--import', 'tsx', path.join(REPO, 'scripts/docs-audience.ts'), root], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output },
      timeout: 60_000,
    })
    assert.equal(cli.status, 0, cli.stderr)
    assert.equal(cli.stdout.trim(), 'private')
    assert.equal(fs.readFileSync(output, 'utf8'), 'publish=private\n')

    const commands = commandsFor('private')
    for (const command of commands) {
      for (const pattern of PUBLIC_DOCS) assert.doesNotMatch(command, pattern, `a private brand must not run: ${command}`)
    }
    assert.ok(commands.includes('npm run prepare:docs'))
    assert.ok(commands.some((command) => command.includes('--audience internal')), 'the internal docs build still compiles')

    // What those commands do: prepare:docs (no audience) picks internal, and a public build is refused.
    assert.doesNotThrow(() => prepareDocs(root, { rootIndex: false }))
    assert.throws(() => prepareDocs(root, { audience: 'public', rootIndex: false }), /publish_docs is private/)
  } finally {
    removeTempDir(root)
  }
})

test('a public-docs brand: CI builds and scans the public docs, with and without the mascot', () => {
  const root = brand('public')
  try {
    assert.equal(docsAudience(root), 'public')
    const commands = commandsFor('public').join('\n')
    for (const pattern of [/npm run build -w @brand-os\/docs/, /build:docs:nomascot/, /scan-public/]) assert.match(commands, pattern)
  } finally {
    removeTempDir(root)
  }
})

const scripts = (JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts

test('npm run build / ci: every docs build goes through build-docs, which follows publish_docs like CI', () => {
  for (const name of ['build', 'ci']) assert.doesNotMatch(scripts[name], /--audience public/, `${name} must not force a public build`)
  for (const name of ['docs:build', 'docs:build:fa', 'build:docs:nomascot']) assert.match(scripts[name], /scripts\/build-docs\.ts/, `${name} uses build-docs`)
  assert.match(scripts.build, /docs:build/)
  assert.match(scripts.ci, /npm run build\b/)
  assert.match(scripts.ci, /build:docs:nomascot/)

  const isPublic = (step: { args: string[] }) => step.args.join(' ').includes('--audience public')
  const priv = brand('private')
  const pub = brand('public')
  try {
    const main = docsBuildPlan(priv)
    assert.equal(main.audience, 'private')
    assert.ok(!main.steps.some(isPublic), 'a private brand never prepares public docs')
    assert.ok(main.steps.some((step) => step.args.join(' ').includes('--audience internal')), 'it compiles the internal docs instead')
    assert.match(main.note ?? '', /publish_docs is private/)
    const nomascot = docsBuildPlan(priv, { nomascot: true })
    assert.deepEqual(nomascot.steps, [])
    assert.match(nomascot.note ?? '', /no public docs build/)

    const fa = docsBuildPlan(pub, { extra: ['--locale', 'fa'] })
    assert.equal(fa.audience, 'public')
    assert.ok(fa.steps.some(isPublic))
    assert.deepEqual(fa.steps.at(-1)?.args.slice(-2), ['--locale', 'fa'])
    const pubNomascot = docsBuildPlan(pub, { nomascot: true }).steps[0].args.join(' ')
    assert.match(pubNomascot, /--audience public --mascot false --gamification false/)

    // The CLI itself: a private brand's nomascot build exits 0 without building anything.
    const cli = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), path.join(REPO, 'scripts/build-docs.ts'), '--nomascot'], { cwd: priv, encoding: 'utf8', timeout: 60_000 })
    assert.equal(cli.status, 0, cli.stderr)
    assert.match(cli.stdout, /publish_docs is private/)
  } finally {
    removeTempDir(priv)
    removeTempDir(pub)
  }
})
