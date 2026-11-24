import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { validateAssets } from '@brand-os/asset-catalog'
import { compileTokens } from '@brand-os/design-tokens'
import { buildMascotCatalog, CANONICAL_ANGLES, catalogCounts, CORE_MOTIONS, EXAMPLE_STAGES } from './content/mascot-catalog.js'
import { engineQuestions, engineSchemaPath, legacyDefinitionCopies, readYamlIfExists } from './engine-assets.js'
import { fieldRegistryEntry } from './question-text.js'
import { validateMascotLifecycle } from './mascot-lifecycle.js'
import { evaluateCondition } from './conditions.js'
import { templateConfig } from './config.js'
import { readYaml } from './fsutil.js'
import { readFacts } from './facts.js'
import { readIdentityIntake } from './identity-intake.js'
import { checkLogoMastersInRepo } from './logo-masters.js'
import { approvalGrantErrors } from './permissions.js'
import { canonicalReferenceErrors } from './personal.js'
import { profileErrors, profileExists } from './profiles.js'
import { llmConfigErrors } from './llm/provider.js'
import type { BrandConfig, FieldQuestion } from './types.js'
import { frameworkRegistryErrors } from './visual/framework-registry.js'

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const SECRET_PATTERNS = [/BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/, /ghp_[A-Za-z0-9]{20,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/]

export function validateRepo(root: string): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const questions = loadQuestions(errors)
  const modules = new Set(questions.map((question) => question.module))
  for (const moduleId of modules) {
    const count = questions.filter((question) => question.module === moduleId).length
    if (count < 5) errors.push(`Module ${moduleId} has only ${count} starter questions`)
  }
  const legacy = legacyDefinitionCopies(root)
  if (legacy.length > 0) {
    warnings.push(`Older template copies are no longer read (${legacy.join(', ')}): the engine supplies the question bank, registry and graph. They can be deleted; brand:convert removes them.`)
  }
  validateQuestionFiles(questions, errors)
  validateRegistry(questions, errors)
  validateConditions(questions, errors)
  errors.push(...profileErrors(root, questions))
  errors.push(...canonicalReferenceErrors(questions))
  const configFile = path.join(root, 'brand', 'brand.config.yaml')
  if (fs.existsSync(configFile)) {
    const config = readYaml<BrandConfig>(configFile)
    if (!profileExists(root, config.brand?.profile)) {
      warnings.push(`brand.config.yaml brand.profile ${config.brand?.profile} has no file in brand/interview/profiles/, so the full question bank is used`)
    }
    errors.push(...llmConfigErrors(config))
    const identity = readIdentityIntake(config)
    if (identity.state === 'invalid') warnings.push(`brand.config.yaml onboarding.identity is ignored (${identity.reason}); it reads as unknown / undecided`)
    warnings.push(...logoMastersWarnings(root, config))
  }
  validateMascot(root, errors)
  errors.push(...validateAssets(root))
  const registry = frameworkRegistryErrors(root)
  errors.push(...registry.errors)
  warnings.push(...registry.warnings)
  const compiled = compileTokens(root)
  errors.push(...compiled.errors)
  // A missing build output is not a brand problem: brand work never needs it, so validate stays quiet and the docs
  // build prints `tokenCssBuildNote` instead. A stale one that exists is still an error, since it would ship old values.
  const builtCss = tokenCssPath(root)
  if (fs.existsSync(builtCss) && fs.readFileSync(builtCss, 'utf8') !== compiled.css) errors.push('packages/design-tokens/dist/tokens.css is stale. Run npm run tokens:build.')
  scanSecrets(root, errors)
  scanCanary(root, errors)
  return { ok: errors.length === 0, errors, warnings }
}

/**
 * Template-owned question text that differs between the stored bank and the template source: the prompt in en, fa
 * and tr, `why_it_matters` and the examples, each in all three locales. A bank written before the fa/tr help text
 * existed (no `*_i18n` field at all) is not drift: it is reported once as `missingHelpLocales`, so old data stays valid.
 */
export function questionTextDrift(stored: FieldQuestion, source: FieldQuestion): { fields: string[]; missingHelpLocales: boolean } {
  const fields: string[] = []
  for (const locale of ['en', 'fa', 'tr'] as const) {
    if ((stored.prompt?.[locale] ?? '') !== source.prompt[locale]) fields.push(`prompt.${locale}`)
  }
  if (stored.why_it_matters !== source.why_it_matters) fields.push('why_it_matters.en')
  if (JSON.stringify(stored.examples ?? []) !== JSON.stringify(source.examples)) fields.push('examples.en')
  let missingHelpLocales = false
  for (const locale of ['fa', 'tr'] as const) {
    const sourceWhy = source.why_it_matters_i18n?.[locale]
    const sourceExamples = source.examples_i18n?.[locale]
    if (sourceWhy !== undefined) {
      if (stored.why_it_matters_i18n === undefined) missingHelpLocales = true
      else if (stored.why_it_matters_i18n[locale] !== sourceWhy) fields.push(`why_it_matters.${locale}`)
    }
    if (sourceExamples !== undefined) {
      if (stored.examples_i18n === undefined) missingHelpLocales = true
      else if (JSON.stringify(stored.examples_i18n[locale] ?? null) !== JSON.stringify(sourceExamples)) fields.push(`examples.${locale}`)
    }
  }
  return { fields, missingHelpLocales }
}

function tokenCssPath(root: string): string {
  return path.join(root, 'packages', 'design-tokens', 'dist', 'tokens.css')
}

/**
 * Informational note for the docs build only: the token CSS build output has not been written yet. Brand work
 * (interview, approval, validate) never needs it, so `validateRepo` does not report it.
 */
export function tokenCssBuildNote(root: string): string | null {
  if (fs.existsSync(tokenCssPath(root))) return null
  return 'Token CSS (packages/design-tokens/dist/tokens.css) has not been written yet. It matters only for a docs build: run npm run tokens:build first, or npm run build, which does both.'
}

/** BOS-16: the approved `brand.logo.masters` answer must name an asset exactly, or the brand book cannot find the master. */
function logoMastersWarnings(root: string, config: BrandConfig): string[] {
  try {
    const slug = config.brand?.slug
    if (typeof slug !== 'string' || !slug) return []
    const fact = readFacts(root, 'approved', slug)['brand.logo.masters']
    if (!fact || fact.status !== 'approved' || typeof fact.value !== 'string') return []
    const check = checkLogoMastersInRepo(root, fact.value)
    return check.message ? [check.message] : []
  } catch {
    return []
  }
}

function loadQuestions(errors: string[]): FieldQuestion[] {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const schema = JSON.parse(fs.readFileSync(engineSchemaPath('question.schema.json'), 'utf8')) as object
  const validate = ajv.compile(schema)
  const questions = engineQuestions()
  for (const question of questions) {
    if (!(validate(question) as boolean)) errors.push(`${question.id}: ${ajv.errorsText(validate.errors)}`)
  }
  const ids = new Set<string>()
  for (const question of questions) {
    if (ids.has(question.id)) errors.push(`Duplicate question id ${question.id}`)
    ids.add(question.id)
  }
  return questions
}

function validateQuestionFiles(questions: FieldQuestion[], errors: string[]): void {
  for (const question of questions) {
    if (question.related_outputs.length === 0) errors.push(`${question.id} has no output document`)
    for (const output of question.related_outputs) {
      if (output.includes('..') || (!output.startsWith('brand/generated/') && !output.startsWith('brand/restricted/'))) {
        errors.push(`${question.id} has an unsafe output path ${output}`)
      }
    }
    errors.push(...approvalGrantErrors(question))
    for (const dependency of question.depends_on) {
      if (!questions.some((item) => item.id === dependency)) errors.push(`${question.id} depends on missing ${dependency}`)
    }
  }
}

function validateRegistry(questions: FieldQuestion[], errors: string[]): void {
  // The field registry is built from the engine's questions; check the rules it must keep.
  const questionIds = new Set(questions.map((question) => question.id))
  for (const field of questions.map(fieldRegistryEntry)) {
    if (!field.question_ids.length) errors.push(`Field ${field.id} has no question`)
    for (const id of field.question_ids) {
      if (!questionIds.has(id)) errors.push(`Field ${field.id} points at missing question ${id}`)
    }
    if (field.required && (!field.documents || field.documents.length === 0)) errors.push(`Required field ${field.id} has no document`)
  }
}

function validateConditions(questions: FieldQuestion[], errors: string[]): void {
  const ctx = { config: templateConfig(), answers: new Map() }
  for (const question of questions) {
    for (const expression of [question.required_when, question.skip_when]) {
      if (!expression) continue
      try {
        evaluateCondition(expression, ctx)
      } catch (error) {
        errors.push(`${question.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
}

function validateMascot(root: string, errors: string[]): void {
  const expected = buildMascotCatalog()
  const counts = catalogCounts(expected)
  const expectedCounts: Record<string, number> = { emotion: 20, action: 20, ui: 15, learning: 15, prop: 10, seasonal: 10 }
  for (const [category, count] of Object.entries(expectedCounts)) {
    if (counts[category] !== count) errors.push(`Catalog builder ${category} is ${counts[category] ?? 0}, expected ${count}`)
  }
  if (expected.length !== 90) errors.push(`Catalog builder has ${expected.length} states, expected 90`)
  const file = path.join(root, 'brand', 'mascot', 'catalog.yaml')
  // A brand keeps the catalog only when it tracks mascot state; otherwise the engine's catalog applies.
  if (!fs.existsSync(file)) return
  const stored = readYaml<{ states: Array<{ id: string; category: string }> }>(file)
  const ajv = new Ajv({ allErrors: true, strict: false })
  const stateSchema = JSON.parse(fs.readFileSync(engineSchemaPath('mascot-state.schema.json'), 'utf8')) as object
  const validateState = ajv.compile(stateSchema)
  const storedIds = new Set(stored.states.map((state) => state.id))
  for (const state of stored.states) {
    if (!(validateState(state) as boolean)) errors.push(`Mascot state ${state.id}: ${ajv.errorsText(validateState.errors)}`)
  }
  for (const state of expected) {
    if (!storedIds.has(state.id)) errors.push(`Catalog file is missing ${state.id}`)
  }
  if (stored.states.length !== 90) errors.push(`Catalog file has ${stored.states.length} states, expected 90`)
  errors.push(...validateMascotLifecycle(root, stored.states as unknown as Array<Record<string, unknown>>))
  const stages = readYamlIfExists<{ stages: Array<{ id?: string; order?: number }> }>(path.join(root, 'brand', 'mascot', 'stages.yaml')) ?? { stages: EXAMPLE_STAGES }
  const stageIds = stages.stages.map((stage) => stage.id).filter((id): id is string => Boolean(id))
  if (stageIds.length !== stages.stages.length) errors.push('Every mascot stage needs an id')
  if (new Set(stageIds).size !== stageIds.length) errors.push('Mascot stage ids must be unique')
  const orders = stages.stages.map((stage) => stage.order).filter((order): order is number => typeof order === 'number')
  const sorted = [...orders].sort((a, b) => a - b)
  if (orders.length !== stages.stages.length || sorted.some((order, index) => order !== (sorted[0] ?? 1) + index)) {
    errors.push('Mascot stages need a contiguous order starting at their first number')
  }
  if (stages.stages.length < 1) errors.push('At least one mascot stage is required when the file exists')
  const angles = readYamlIfExists<{ angles: unknown[] }>(path.join(root, 'brand', 'mascot', 'angles.yaml')) ?? { angles: CANONICAL_ANGLES }
  if (angles.angles.length !== 8) errors.push('Expected 8 angles')
  const motions = readYamlIfExists<{ motions: unknown[] }>(path.join(root, 'brand', 'mascot', 'motions.yaml')) ?? { motions: CORE_MOTIONS }
  if (motions.motions.length !== 15) errors.push(`Expected 15 motions, found ${motions.motions.length}`)
}

function scanSecrets(root: string, errors: string[]): void {
  const skip = new Set(['node_modules', '.git', 'build', 'dist', '.docusaurus'])
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(md|yaml|yml|json|ts|tsx|js|css|svg|txt)$/.test(entry.name)) {
        const text = fs.readFileSync(full, 'utf8')
        for (const pattern of SECRET_PATTERNS) {
          if (pattern.test(text)) errors.push(`Possible secret in ${path.relative(root, full)}`)
        }
      }
    }
  }
  walk(root)
}

function scanCanary(root: string, errors: string[]): void {
  const canary = 'RESTRICTED_CANARY_DO_NOT_PUBLISH'
  const publicRoots = [path.join(root, 'brand', 'content'), path.join(root, 'brand', 'business-os'), path.join(root, 'brand', 'templates')]
  for (const dir of publicRoots) {
    if (!fs.existsSync(dir)) continue
    const walk = (current: string): void => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (fs.readFileSync(full, 'utf8').includes(canary)) errors.push(`Restricted canary leaked into ${path.relative(root, full)}`)
      }
    }
    walk(dir)
  }
}
