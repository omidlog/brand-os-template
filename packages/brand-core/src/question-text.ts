import fs from 'node:fs'
import path from 'node:path'
import { allQuestions } from './content/index.js'
import { readYaml, writeYaml } from './fsutil.js'
import type { FieldQuestion } from './types.js'

/**
 * Template-owned question text: the prompt (en, fa, tr), `why_it_matters` and the examples, with their fa and tr
 * locale data. `brand:validate` reports drift in exactly these fields (`questionTextDrift`).
 */
const TEXT_FIELDS = ['prompt', 'why_it_matters', 'why_it_matters_i18n', 'examples', 'examples_i18n'] as const

/**
 * Brings the question text in `brand/interview/question-bank/*.yaml` up to the template's wording. Only the text
 * fields above change, and only for question ids the template defines; ids, types, conditions, priorities and every
 * answer, fact and approval stay as they are. Returns the bank files it rewrote (relative paths). Idempotent.
 */
export function refreshQuestionText(root: string): string[] {
  const dir = path.join(root, 'brand', 'interview', 'question-bank')
  if (!fs.existsSync(dir)) return []
  const source = new Map(allQuestions().map((question) => [question.id, question]))
  const touched: string[] = []
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith('.yaml')).sort()) {
    const file = path.join(dir, name)
    const bank = readYaml<{ questions?: FieldQuestion[] }>(file)
    let changed = false
    const questions = (bank.questions ?? []).map((stored) => {
      const template = source.get(stored.id)
      if (!template) return stored
      const next: FieldQuestion = { ...stored }
      for (const field of TEXT_FIELDS) {
        const value = template[field]
        if (JSON.stringify(stored[field]) === JSON.stringify(value)) continue
        changed = true
        if (value === undefined) delete (next as Partial<FieldQuestion>)[field]
        else (next as unknown as Record<string, unknown>)[field] = value
      }
      return next
    })
    if (!changed) continue
    writeYaml(file, { ...bank, questions: orderLikeTemplate(questions) })
    touched.push(path.relative(root, file).split(path.sep).join('/'))
  }
  return touched
}

/** Keeps each question's keys in the template's order, so a refreshed bank diffs only in the changed text. */
function orderLikeTemplate(questions: FieldQuestion[]): FieldQuestion[] {
  const order = ['id', 'module', 'field_path', 'label', 'prompt', 'why_it_matters', 'why_it_matters_i18n', 'question_type', 'examples', 'examples_i18n']
  return questions.map((question) => {
    const out: Record<string, unknown> = {}
    for (const key of order) if (key in question) out[key] = (question as unknown as Record<string, unknown>)[key]
    for (const [key, value] of Object.entries(question)) if (!(key in out)) out[key] = value
    return out as unknown as FieldQuestion
  })
}
