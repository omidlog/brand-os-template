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
      kind: { type: 'string' },
      module: { type: 'string' },
      ids: { type: 'string' },
      'include-unapproved': { type: 'boolean', default: false },
    },
  })
  if (values['include-unapproved']) {
    console.error('--include-unapproved is ignored. It grants nothing: drafts, EXAMPLE tokens, and internal facts are never returned by this flag.')
  }
  const core = await import('@brand-os/brand-core')
  // Same resolution as the MCP server: the token comes from the environment, never from argv.
  let ctx
  try {
    ctx = core.resolveAgentContext(root, engine.config().brand.slug, process.env[core.AGENT_TOKEN_ENV])
  } catch (error) {
    console.error(error instanceof core.AgentTokenError ? error.message : 'Agent token resolution failed.')
    process.exit(1)
  }
  const tool = values.tool ?? 'get_brand_status'
  const q = values.query ?? ''
  const handlers: Record<string, () => unknown> = {
    brand_retrieve: () => {
      const kind = values.kind ?? 'facts'
      if (!(core.RETRIEVE_KINDS as readonly string[]).includes(kind)) {
        console.error(`--kind must be one of: ${core.RETRIEVE_KINDS.join(', ')}`)
        process.exit(1)
      }
      return core.brandRetrieve(engine, ctx, {
        kind: kind as (typeof core.RETRIEVE_KINDS)[number],
        module: values.module,
        ids: values.ids ? values.ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined,
        query: q || undefined,
      })
    },
    search_brand_docs: () => core.searchBrandDocs(engine, q, ctx),
    get_brand_tokens: () => core.getBrandTokens(engine, ctx),
    list_mascot_assets: () => core.listMascotAssets(engine, ctx),
    list_mascot_stages: () => core.listMascotStages(engine, ctx),
    search_mascot_assets: () => core.searchMascotAssets(engine, q, ctx),
    get_design_component: () => core.getDesignComponent(engine, q || 'button', ctx),
    get_social_template: () => core.getSocialTemplate(engine, q || 'unspecified', ctx),
    get_asset_metadata: () => core.getAssetMetadata(engine, q, ctx),
    get_brand_overview: () => core.getBrandOverview(engine, ctx),
    get_brand_guidelines: () => core.getBrandGuidelines(engine, ctx),
    get_logo_rules: () => core.getLogoRules(engine, ctx),
    get_mascot_guidelines: () => core.getMascotGuidelines(engine, ctx),
    get_mascot_profile: () => core.getMascotProfile(engine, ctx),
    get_motion_guidelines: () => core.getMotionGuidelines(engine, ctx),
    get_marketing_plan: () => core.getMarketingPlan(engine, ctx),
    get_business_plan: () => core.getBusinessPlan(engine, ctx),
    get_brand_status: () => core.getBrandStatus(engine, ctx),
  }
  const handler = handlers[tool]
  if (!handler) {
    console.error(`Unknown tool ${tool}. Tools: ${Object.keys(handlers).sort().join(', ')}`)
    process.exit(1)
  }
  console.log(JSON.stringify(handler(), null, 2))
} else if (command === 'agent-token') {
  const [action, ...tokenArgs] = rest
  const { values } = parseArgs({
    args: tokenArgs,
    options: { profile: { type: 'string' }, label: { type: 'string' }, id: { type: 'string' }, json: { type: 'boolean', default: false } },
  })
  const core = await import('@brand-os/brand-core')
  if (!['issue', 'list', 'revoke'].includes(action ?? '')) {
    console.error('Usage: brand:agent-token issue --profile <internal-read|design|marketing|finance> --label <name> | list | revoke --id <agt_…>')
    console.error('The approval proof is read from BRAND_OS_APPROVAL_PROOF or a hidden prompt. It is never accepted on the command line.')
    process.exit(1)
  }
  const proof = await readApprovalProof()
  if (!core.approvalProofMatches(root, proof)) {
    console.error('Approval proof rejected. Agent tokens are managed by the owner only. Nothing was changed.')
    process.exit(1)
  }
  if (action === 'issue') {
    if (!core.isAgentProfile(values.profile)) {
      console.error(`--profile must be one of: ${Object.keys(core.AGENT_PROFILES).join(', ')}`)
      process.exit(1)
    }
    const issued = core.issueAgentToken(root, { brandId: engine.config().brand.slug, profile: values.profile, label: values.label ?? '' })
    if (values.json) {
      console.log(JSON.stringify({ ...issued.record, token: issued.token }, null, 2))
    } else {
      console.log(`Issued ${issued.record.id} (${issued.record.profile}) for ${issued.record.brand_id}.`)
      console.log('Token (shown once, store it in your agent host as BRAND_OS_AGENT_TOKEN; only its hash is kept):')
      console.log(issued.token)
    }
  } else if (action === 'list') {
    const tokens = core.listAgentTokens(root)
    if (values.json) console.log(JSON.stringify(tokens, null, 2))
    else if (tokens.length === 0) console.log('No agent tokens issued.')
    else for (const item of tokens) console.log(`${item.id}  ${item.profile.padEnd(13)} ${item.revoked ? 'revoked ' : 'active  '} ${item.created_at}  ${item.label}`)
  } else {
    if (!values.id) {
      console.error('Need --id <agt_…>.')
      process.exit(1)
    }
    const revoked = core.revokeAgentToken(root, values.id)
    if (!revoked) {
      console.error(`No token ${values.id}.`)
      process.exit(1)
    }
    console.log(`Revoked ${revoked.id}. Restart any MCP server that was started with it.`)
  }
} else if (command === 'doctor') {
  const { values } = parseArgs({
    args: rest,
    options: { json: { type: 'boolean', default: false }, 'create-approval-secret': { type: 'boolean', default: false } },
  })
  const { ensureApprovalSecret, formatDoctor, runDoctor } = await import('@brand-os/brand-core')
  if (values['create-approval-secret']) {
    // Creates the file only when absent. The value is never printed; read it locally when you approve.
    ensureApprovalSecret(root)
    if (!values.json) console.log('Approval secret is at brand/.private/approval-secret (mode 0600). Its value is not printed.')
  }
  const report = runDoctor(root)
  console.log(values.json ? JSON.stringify(report, null, 2) : formatDoctor(report))
  if (!report.ok) process.exit(1)
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
  console.log(`Commands: init, interview, resume, status, review, validate, export, approve, query, agent-token, doctor, backup, restore, migrate, reset`)
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

/** Owner proof from the environment, a hidden TTY prompt, or the first line of piped stdin. Never argv. */
async function readApprovalProof(): Promise<string | undefined> {
  const fromEnv = process.env.BRAND_OS_APPROVAL_PROOF
  if (fromEnv) return fromEnv.trim()
  if (!input.isTTY) {
    const chunks: Buffer[] = []
    for await (const chunk of input) chunks.push(Buffer.from(chunk as Buffer))
    return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0]?.trim() || undefined
  }
  const { Writable } = await import('node:stream')
  let muted = false
  const sink = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) output.write(chunk, encoding)
      callback()
    },
  })
  const rl = readline.createInterface({ input, output: sink, terminal: true })
  try {
    const pending = rl.question('Approval proof (input hidden): ')
    muted = true
    const answer = await pending
    output.write('\n')
    return answer.trim() || undefined
  } finally {
    rl.close()
  }
}
