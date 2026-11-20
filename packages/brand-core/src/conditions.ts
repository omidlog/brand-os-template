import type { AnswerRecord, BrandConfig } from './types.js'

export interface ConditionContext {
  config: BrandConfig
  answers: Map<string, AnswerRecord>
}

function answerValue(ctx: ConditionContext, id: string): string | null {
  const record = ctx.answers.get(id)
  if (!record || record.value === null || record.value === undefined) return null
  return String(record.value)
}

function configValue(config: BrandConfig, path: string): string | null {
  if (path === 'config.modules.mascot') return String(config.modules.mascot.enabled)
  if (path === 'config.modules.gamification') return String(config.modules.gamification.enabled)
  if (path.startsWith('config.capabilities.')) {
    const key = path.slice('config.capabilities.'.length)
    const value = config.capabilities[key]
    return value === undefined ? null : String(value)
  }
  if (path === 'config.brand.sector') return config.brand.sector
  return null
}

/**
 * Tiny predicate language used by question eligibility.
 * Supported forms:
 * - always | never
 * - config.modules.mascot == true|false
 * - config.modules.gamification == true|false
 * - config.capabilities.<flag> == true|false
 * - answers[<question-id>] == value
 * - answers[<question-id>] != value
 * - answers[<question-id>] in a,b
 * - answers[<question-id>] not_in a,b
 * Missing answers make comparisons false.
 */
export function disabledModule(questionId: string, ctx: ConditionContext): boolean {
  if (!ctx.config.modules.mascot.enabled && questionId.startsWith('brand.mascot.')) return true
  if (!ctx.config.modules.gamification.enabled && questionId.startsWith('brand.gamification.')) return true
  return false
}

export function evaluateCondition(expression: string | undefined, ctx: ConditionContext): boolean {
  if (!expression || expression.trim() === '' || expression.trim() === 'always') return true
  const expr = expression.trim()
  if (expr === 'never') return false

  const cmp = expr.match(/^([\w.]+)\s*(==|!=)\s*(.+)$/)
  if (cmp) {
    const left = cmp[1] ?? ''
    const op = cmp[2] ?? '=='
    const right = (cmp[3] ?? '').trim()
    const actual = configValue(ctx.config, left)
    if (actual === null) return false
    return op === '==' ? actual === right : actual !== right
  }

  const answerCmp = expr.match(/^answers\[([^\]]+)\]\s*(==|!=|in|not_in)\s*(.+)$/)
  if (answerCmp) {
    const id = answerCmp[1] ?? ''
    const op = answerCmp[2] ?? '=='
    const right = (answerCmp[3] ?? '').trim()
    const actual = answerValue(ctx, id)
    if (op === '==') return actual === right
    if (op === '!=') return actual !== null && actual !== right
    const options = right.split(',').map((part) => part.trim())
    if (actual === null) return false
    if (op === 'in') return options.includes(actual)
    return !options.includes(actual)
  }

  throw new Error(`Unsupported condition: ${expression}`)
}

export function shouldSkip(expression: string | undefined, ctx: ConditionContext): boolean {
  if (!expression) return false
  return evaluateCondition(expression, ctx)
}
