import fs from 'node:fs'
import path from 'node:path'
import { validateRepo } from '@brand-os/brand-core'

/**
 * `brand-os check` (`npm run check`): the fast CI gate of a data-only brand repository. It validates the brand's own
 * data (facts, assets, tokens and contrast, mascot state, profiles and overrides, publication policy, secrets and
 * the restricted canary) against the engine's definitions. It runs no test suite: the engine's tests run once, in
 * the template, before a release.
 */
const root = process.cwd()
if (!fs.existsSync(path.join(root, 'brand', 'brand.config.yaml'))) {
  console.error('This is not a Brand OS brand repository: brand/brand.config.yaml is missing.')
  process.exit(2)
}
const report = validateRepo(root)
for (const warning of report.warnings) console.warn(`warning: ${warning}`)
if (!report.ok) {
  console.error(report.errors.join('\n'))
  process.exit(1)
}
console.log(`Brand check passed with ${report.warnings.length} warning(s). Engine ${process.env.BRAND_OS_ENGINE_VERSION ?? 'development'}.`)
