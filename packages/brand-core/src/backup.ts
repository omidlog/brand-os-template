import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const RELATIVE = [
  'brand/interview',
  'brand/instance',
  'brand/content',
  'brand/business-os',
  'brand/mascot',
  'brand/assets',
  'brand/tokens',
  'brand/templates',
  'brand/generated',
  'brand/brand.config.yaml',
  'brand/brand-manifest.json',
  'brand/publication-policy.yaml',
  'brand/.private',
]

export const ENGINE_VERSION = '0.2.0'
export const RESET_CONFIRMATION = 'I understand this deletes interview state'

export function writeAtomic(file: string, contents: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, contents)
  const fd = fs.openSync(tmp, 'r+')
  fs.fsyncSync(fd)
  fs.closeSync(fd)
  fs.renameSync(tmp, file)
}

function listFiles(root: string, relative: string): string[] {
  const full = path.join(root, relative)
  if (!fs.existsSync(full)) return []
  const stat = fs.lstatSync(full)
  if (stat.isSymbolicLink()) return []
  if (stat.isFile()) return [relative.split(path.sep).join('/')]
  const out: string[] = []
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    out.push(...listFiles(root, path.join(relative, entry.name)))
  }
  return out
}

export function backupBrand(root: string, destination?: string): { directory: string; files: string[]; checksum: string } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const directory = destination ?? path.join(root, 'brand', '.private', 'backups', stamp)
  if (fs.existsSync(directory) && fs.readdirSync(directory).length > 0) {
    throw new Error(`Refusing to overwrite backup destination ${directory}`)
  }
  fs.mkdirSync(directory, { recursive: true })
  const files = RELATIVE.flatMap((relative) => listFiles(root, relative)).sort()
  const hash = crypto.createHash('sha256')
  for (const relative of files) {
    const target = path.join(directory, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const bytes = fs.readFileSync(path.join(root, relative))
    fs.writeFileSync(target, bytes)
    hash.update(relative)
    hash.update(bytes)
  }
  const checksum = hash.digest('hex')
  fs.writeFileSync(path.join(directory, 'backup-manifest.json'), `${JSON.stringify({ files, checksum }, null, 2)}\n`)
  return { directory, files, checksum }
}

export function restoreBrand(root: string, backupDir: string): { restored: string[] } {
  const manifestPath = path.join(backupDir, 'backup-manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('Backup manifest is missing. Restore refused.')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { files: string[]; checksum: string }
  const hash = crypto.createHash('sha256')
  for (const relative of manifest.files) {
    if (relative.includes('..') || path.isAbsolute(relative)) throw new Error(`Unsafe backup path ${relative}`)
    const bytes = fs.readFileSync(path.join(backupDir, relative))
    hash.update(relative)
    hash.update(bytes)
  }
  if (hash.digest('hex') !== manifest.checksum) throw new Error('Backup checksum mismatch. Restore refused.')
  const restored: string[] = []
  for (const relative of manifest.files) {
    const target = path.join(root, relative)
    writeAtomic(target, fs.readFileSync(path.join(backupDir, relative)))
    restored.push(relative)
  }
  return { restored }
}

export function migrateBrand(root: string): { from: string; to: string; content_rewritten: false } {
  const lockFile = path.join(root, 'brand', 'engine.lock')
  const current = fs.existsSync(lockFile) ? (JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { version?: string }) : {}
  const from = current.version ?? '0.0.0'
  const logFile = path.join(root, 'brand', 'migrations.yaml')
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : 'schema_version: 1\napplied: []\n'
  const id = `${from}->${ENGINE_VERSION}`
  const next = log.includes(id) ? log : `${log.trimEnd()}\n  - id: "${id}"\n    touched: [brand/engine.lock, brand/migrations.yaml]\n`
  writeAtomic(logFile, next.endsWith('\n') ? next : `${next}\n`)
  writeAtomic(
    lockFile,
    `${JSON.stringify({ version: ENGINE_VERSION, note: 'Migration records the engine version. It does not rewrite brand facts, catalogs, or assets.' }, null, 2)}\n`,
  )
  const gitignore = path.join(root, '.gitignore')
  const required = ['brand/.private/', 'brand/restricted/facts.yaml', 'brand/restricted/drafts/', 'brand/generated/artifacts/']
  const text = fs.existsSync(gitignore) ? fs.readFileSync(gitignore, 'utf8') : ''
  const missing = required.filter((line) => !text.includes(line))
  if (missing.length > 0) fs.appendFileSync(gitignore, `${text.endsWith('\n') || text.length === 0 ? '' : '\n'}${missing.join('\n')}\n`)
  return { from, to: ENGINE_VERSION, content_rewritten: false }
}

export function resetInterviewState(root: string, confirmation: string): { backup: string } {
  if (confirmation !== RESET_CONFIRMATION) throw new Error('Reset requires the exact confirmation sentence.')
  const backup = backupBrand(root)
  const writes: Record<string, string> = {
    'brand/interview/answer-ledger.yaml': 'schema_version: 1\nrecords: []\n',
    'brand/interview/contradictions.yaml': 'schema_version: 1\nderived: true\nitems: []\n',
    'brand/interview/evidence-index.yaml': 'schema_version: 1\nitems: []\n',
    'brand/interview/session-state.yaml': 'schema_version: 1\nsession_id: null\nstatus: idle\nlocale: en\nhistory: []\ndeferred: []\npending_suggestions: []\ncursor_question_id: null\npending_proposals: []\nstarted_at: null\nupdated_at: null\nlast_answer_id: null\n',
    'brand/instance/draft-facts.yaml': 'schema_version: 1\nfacts: {}\n',
    'brand/instance/approved-facts.yaml': 'schema_version: 1\nfacts: {}\n',
  }
  for (const [relative, body] of Object.entries(writes)) writeAtomic(path.join(root, relative), body)
  return { backup: backup.directory }
}
