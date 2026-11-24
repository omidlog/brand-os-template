import { parseArgs } from 'node:util'
import { readTemplateRecord } from '@brand-os/brand-core'
import { convertBrand } from './convert.js'

/**
 * `brand-os convert [--template-dir <template clone>] [--from <commit>] [--dry-run] [--json]`: one-time conversion of an
 * older brand repository into a data-only one. The engine must already be at .brand-os/engine/. Commit the result
 * on a branch and open a pull request; nothing is pushed.
 */
const { values } = parseArgs({
  options: {
    'template-dir': { type: 'string' },
    from: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
})
const root = process.cwd()
const fromCommit = values.from ?? readTemplateRecord(root)?.commit ?? null
const report = convertBrand(root, { templateDir: values['template-dir'], fromCommit, dryRun: values['dry-run'] })
if (values.json) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`${values['dry-run'] ? 'DRY RUN: would remove' : 'Removed'} ${report.deleted.length} template file(s).`)
  if (report.kept_edits.length) console.log(`Kept ${report.kept_edits.length} edited page(s) or token file(s) as brand overrides:\n  ${report.kept_edits.join('\n  ')}`)
  if (report.overrides.length) console.log(`Profile overrides: ${report.overrides.join(', ')}`)
  for (const note of report.notes) console.log(`note: ${note}`)
  if (report.scaffolded.length) console.log(`Wrote ${report.scaffolded.join(', ')}.`)
}
