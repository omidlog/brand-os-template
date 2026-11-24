import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { parse, stringify } from 'yaml'
import { applyInit, engineQuestions, fieldRegistryEntry, STARTER_PROFILES, templatePages, writeStarterWorkspace } from '@brand-os/brand-core'
import { tokenBaseDir } from '@brand-os/design-tokens'
import { convertBrand } from '../scripts/engine/convert.js'

/**
 * Engine + data, part C: `brand-os convert` turns an older brand repository (a full template copy) into a data-only
 * one. Template code and unchanged template copies go; brand data and real edits stay. SYNTHETIC DEMO data only.
 */
process.env.BRAND_OS_DATA_KEY ??= crypto.randomBytes(32).toString('base64')
const repo = path.resolve(import.meta.dirname, '..')

function write(root: string, relative: string, text: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), text)
}

function olderBrand(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-convert-'))
  writeStarterWorkspace(root)
  applyInit(root, { name: 'Demo Person', slug: 'demo-person', industry: 'consulting', language: 'en', languages: ['en'], mascot: false, gamification: false, publish: 'private', profile: 'personal-brand', facets: ['consultant-expert'] })
  // Template code and tooling, as every older brand repository carries them.
  write(root, '.brand-os/sync.json', fs.readFileSync(path.join(repo, '.brand-os/sync.json'), 'utf8'))
  write(root, 'packages/brand-core/src/index.ts', 'export {}\n')
  write(root, 'scripts/brand.ts', 'console.log(1)\n')
  write(root, 'apps/docs/src/data/status.json', '{}\n')
  write(root, 'tests/x.test.ts', '\n')
  write(root, '.github/workflows/validate.yml', 'name: validate\n')
  write(root, 'package.json', JSON.stringify({ name: 'brand-os-template', workspaces: ['packages/*'], scripts: { 'brand:next': 'tsx scripts/brand.ts next' } }))
  write(root, 'package-lock.json', '{}\n')
  write(root, 'README.md', '# Brand OS template\n')
  write(root, 'CHANGELOG.md', '# Changelog\n')
  write(root, 'llms.txt', 'x\n')
  write(root, '.gitignore', 'node_modules/\nmy-own-ignore\n')
  write(root, 'notes/owner-file.md', 'The owner keeps this file outside brand/.\n')
  // Engine definitions copied into brand/.
  write(root, 'brand/interview/question-bank/brand.yaml', stringify({ questions: engineQuestions().slice(0, 3) }))
  write(root, 'brand/interview/field-registry.yaml', stringify({ fields: engineQuestions().map(fieldRegistryEntry) }))
  write(root, 'brand/interview/knowledge-graph.yaml', stringify({ edges: [] }))
  const starter = STARTER_PROFILES.find((profile) => profile.id === 'personal-brand')!
  write(root, 'brand/interview/profiles/personal-brand.yaml', stringify({ ...starter, question_ids: [...starter.question_ids.filter((id) => id !== 'brand.strategy.promise'), 'business.offer.summary'] }))
  write(root, 'brand/interview/profiles/founder-core.yaml', stringify(STARTER_PROFILES.find((profile) => profile.id === 'founder-core')))
  const pages = [...templatePages().entries()].filter(([relative]) => relative.endsWith('overview.md'))
  write(root, pages[0]![0], pages[0]![1])
  write(root, pages[1]![0], `${pages[1]![1]}\nOwner's own guidance sentence.\n`)
  write(root, 'brand/tokens/color.tokens.json', fs.readFileSync(path.join(tokenBaseDir(), 'color.tokens.json'), 'utf8'))
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'older brand'], { cwd: root })
  return root
}

function dataDigest(root: string): string {
  const files = execFileSync('git', ['ls-files', 'brand'], { cwd: root, encoding: 'utf8' }).split('\n').filter((file) => /^brand\/(instance|interview\/(answer-ledger|session-state|contradictions|evidence)|assets\/|tokens\/(generated|approvals)|brand\.config|publication-policy)/.test(file))
  const hash = crypto.createHash('sha256')
  for (const file of files.sort()) hash.update(file).update(fs.readFileSync(path.join(root, file)))
  return hash.digest('hex')
}

test('convert removes template code and unchanged copies, keeps brand data and real edits, and scaffolds', () => {
  const root = olderBrand()
  try {
    const before = dataDigest(root)
    const pages = [...templatePages().keys()].filter((relative) => relative.endsWith('overview.md'))
    const report = convertBrand(root)
    assert.equal(dataDigest(root), before, 'brand data is byte-identical')
    for (const gone of ['packages', 'scripts', 'apps', 'tests', '.brand-os/sync.json', 'package-lock.json', 'CHANGELOG.md', 'llms.txt', '.github/workflows/validate.yml', 'brand/interview/question-bank', 'brand/interview/field-registry.yaml', 'brand/interview/knowledge-graph.yaml', 'brand/interview/profiles', pages[0]!, 'brand/tokens/color.tokens.json']) {
      assert.equal(fs.existsSync(path.join(root, gone)), false, `${gone} removed`)
    }
    assert.ok(fs.existsSync(path.join(root, pages[1]!)), 'an edited guidance page stays as the brand override')
    assert.deepEqual(report.kept_edits, [pages[1]])
    assert.ok(fs.existsSync(path.join(root, 'notes/owner-file.md')), 'files the template never had are kept')
    assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /my-own-ignore/)
    // The personal-brand copy added one question and lacked one: only the addition becomes an override.
    const override = parse(fs.readFileSync(path.join(root, 'brand/overrides/profiles/personal-brand.yaml'), 'utf8')) as { add: string[] }
    assert.deepEqual(override.add, ['business.offer.summary'])
    assert.ok(report.notes.some((note) => note.includes('brand.strategy.promise')))
    assert.equal(fs.existsSync(path.join(root, 'brand/overrides/profiles/founder-core.yaml')), false, 'an unchanged profile needs no override')
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as Record<string, unknown> & { scripts: Record<string, string> }
    assert.equal('workspaces' in pkg, false)
    assert.equal(pkg.scripts['brand:next'], 'node .brand-os/engine/brand-os.mjs next')
    assert.ok(fs.existsSync(path.join(root, '.github/workflows/brand.yml')))
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /Brand OS template/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('convert refuses a folder that is not a brand repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brand-os-convert-empty-'))
  try {
    assert.throws(() => convertBrand(root), /not a Brand OS brand repository/i)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
