import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { stdin as input, stdout as output } from 'node:process'
import { applyInit, backupBrand, InterviewEngine, migrateBrand, RESET_CONFIRMATION, resetInterviewState, restoreBrand } from '@brand-os/brand-core'

const [command, ...rest] = process.argv.slice(2)
const root = process.cwd()
const engine = new InterviewEngine(root)

if (command === 'init') {
  const { values } = parseArgs({
    args: rest,
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      industry: { type: 'string', default: 'TBD' },
      sector: { type: 'string' },
      language: { type: 'string', default: 'en' },
      languages: { type: 'string', default: 'en,fa,tr' },
      website: { type: 'string' },
      mascot: { type: 'string', default: 'false' },
      gamification: { type: 'string', default: 'false' },
      publish: { type: 'string', default: 'private' },
      profile: { type: 'string', default: 'universal' },
      yes: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
    },
  })
  if (!values.name || !values.slug) {
    console.error('brand:init needs --name and --slug. Example: npm run brand:init -- --name "Northwind" --slug northwind --yes')
    process.exit(1)
  }
  if (!values.yes) {
    console.error('Refusing to reset interview state without --yes.')
    process.exit(1)
  }
  const config = applyInit(root, {
    name: values.name,
    slug: values.slug,
    industry: values.industry ?? 'TBD',
    sector: values.sector,
    language: values.language ?? 'en',
    languages: (values.languages ?? 'en').split(',').map((item) => item.trim()),
    website: values.website ?? null,
    mascot: values.mascot === 'true',
    gamification: values.gamification === 'true',
    publish: values.publish === 'public' ? 'public' : 'private',
    profile: values.profile,
    reset: values.reset === true,
  })
  console.log(`Initialized ${config.brand.name} (${config.brand.slug}). Mascot ${config.modules.mascot.enabled ? 'on' : 'off'}.`)
  console.log(engine.statusText())
} else if (command === 'interview' || command === 'resume') {
  const { values } = parseArgs({
    args: rest,
    options: {
      batch: { type: 'string' },
      question: { type: 'string' },
      answer: { type: 'string' },
    },
  })
  if (values.batch) {
    const answers = JSON.parse(fs.readFileSync(path.resolve(values.batch), 'utf8')) as Record<string, string>
    let steps = 0
    while (steps < 500) {
      const current = engine.current()
      if (!current) break
      const raw = answers[current.id]
      if (raw === undefined) break
      const result = engine.submit(raw)
      console.log(`\n${current.id}\n${result.message}`)
      if (result.kind === 'error' || result.kind === 'exit') break
      steps += 1
    }
    console.log(`\n${engine.statusText()}`)
  } else if (values.question && values.answer) {
    const current = engine.current()
    if (!current || current.id !== values.question) {
      console.error(`Next question is ${current?.id ?? 'none'}, not ${values.question}.`)
      process.exit(1)
    }
    console.log(engine.submit(values.answer).message)
  } else {
    await interactive()
  }
} else if (command === 'status') {
  console.log(engine.statusText())
} else if (command === 'review') {
  console.log(engine.reviewText(false))
} else if (command === 'validate') {
  const { validateRepo } = await import('@brand-os/brand-core')
  const report = validateRepo(root)
  if (!report.ok) {
    console.error(report.errors.join('\n'))
    process.exit(1)
  }
  console.log('Brand validation passed.')
} else if (command === 'export') {
  const { values } = parseArgs({ args: rest, options: { public: { type: 'boolean', default: false } } })
  const snapshot = engine.exportSnapshot(values.public ? 'public' : 'full')
  const dir = path.join(root, 'brand', 'exports')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, values.public ? 'public-snapshot.json' : 'latest-snapshot.json')
  fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${path.relative(root, file)}. Full snapshots can contain restricted answers and are gitignored.`)
} else if (command === 'approve') {
  const { values } = parseArgs({
    args: rest,
    options: { question: { type: 'string' }, actor: { type: 'string', default: 'owner' }, proof: { type: 'string' } },
  })
  if (!values.question || !values.proof) {
    console.error('Need --question <id> --proof <human-secret>. --actor alone cannot approve.')
    process.exit(1)
  }
  const result = engine.approve(values.question, values.actor ?? 'owner', values.proof)
  console.log(result.message)
  if (result.kind === 'error') process.exit(1)
} else if (command === 'query') {
  const { values } = parseArgs({
    args: rest,
    options: {
      tool: { type: 'string' },
      query: { type: 'string', default: '' },
      'include-unapproved': { type: 'boolean', default: false },
    },
  })
  const { getBrandStatus, getBrandTokens, getDesignComponent, getSocialTemplate, listMascotAssets, searchBrandDocs } = await import('@brand-os/brand-core')
  const tool = values.tool ?? 'get_brand_status'
  const result =
    tool === 'search_brand_docs'
      ? searchBrandDocs(engine, values.query ?? '')
      : tool === 'get_brand_tokens'
        ? getBrandTokens(engine)
        : tool === 'list_mascot_assets'
          ? listMascotAssets(engine)
          : tool === 'get_design_component'
            ? getDesignComponent(engine, values.query ?? 'button')
            : tool === 'get_social_template'
              ? getSocialTemplate(engine, values.query ?? 'unspecified')
              : getBrandStatus(engine)
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'backup') {
  const saved = backupBrand(root)
  console.log(`Backed up ${saved.files.length} files to ${path.relative(root, saved.directory)}`)
} else if (command === 'restore') {
  const { values } = parseArgs({ args: rest, options: { from: { type: 'string' } } })
  if (!values.from) {
    console.error('Need --from <backup-directory>.')
    process.exit(1)
  }
  const restored = restoreBrand(root, path.resolve(values.from))
  console.log(`Restored ${restored.restored.length} files.`)
} else if (command === 'migrate') {
  const migrated = migrateBrand(root)
  console.log(`Migrated ${migrated.from} -> ${migrated.to}. Content files were not rewritten.`)
} else if (command === 'reset') {
  const { values } = parseArgs({ args: rest, options: { confirm: { type: 'string' } } })
  if (values.confirm !== RESET_CONFIRMATION) {
    console.error(`Refusing reset. Pass --confirm "${RESET_CONFIRMATION}"`)
    process.exit(1)
  }
  const result = resetInterviewState(root, values.confirm)
  console.log(`Interview state cleared. Backup: ${path.relative(root, result.backup)}`)
} else {
  console.log(`Commands: init, interview, resume, status, review, validate, export, approve, query, backup, restore, migrate, reset`)
  process.exit(command ? 1 : 0)
}

async function interactive(): Promise<void> {
  const rl = readline.createInterface({ input, output })
  console.log('Brand OS interview. Type help for commands. exit pauses the session.')
  try {
    while (true) {
      const question = engine.current()
      if (!question) {
        console.log(engine.statusText())
        break
      }
      const locale = engine.session().locale
      const prompt = engine.promptText(question, locale)
      console.log(`\n${question.id} [${question.priority}]`)
      if (prompt.fellBack) console.log(`No ${locale} prompt stored. Showing English.`)
      console.log(prompt.text)
      console.log(`Why: ${question.why_it_matters}`)
      if (question.options) console.log(`Options: ${question.options.join(', ')}`)
      const raw = await rl.question('> ')
      const result = engine.submit(raw)
      console.log(result.message)
      if (result.kind === 'exit') break
    }
  } finally {
    rl.close()
  }
}
