import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { migrateFactFiles } from './facts.js'
import { parse, stringify } from 'yaml'
import { dataKey } from './private-store.js'

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

export const ENGINE_VERSION = '0.3.0'
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
  const key = dataKey()
  const files = RELATIVE.flatMap((relative) => listFiles(root, relative))
    .filter((relative) => !relative.startsWith('brand/.private/backups/'))
    .filter((relative) => !relative.endsWith('/key') && !relative.endsWith('key'))
    .sort()
  const payload = {
    files: files.map((relative) => ({ path: relative, data: fs.readFileSync(path.join(root, relative)).toString('base64') })),
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const checksum = crypto.createHash('sha256').update(body).digest('hex')
  fs.writeFileSync(path.join(directory, 'backup.enc'), body)
  fs.writeFileSync(path.join(directory, 'backup-manifest.json'), `${JSON.stringify({ files: files.length, checksum, iv: iv.toString('base64'), tag: tag.toString('base64'), encrypted: true }, null, 2)}\n`)
  return { directory, files, checksum }
}

export function restoreBrand(root: string, backupDir: string): { restored: string[] } {
  const manifestPath = path.join(backupDir, 'backup-manifest.json')
  const encPath = path.join(backupDir, 'backup.enc')
  if (!fs.existsSync(manifestPath) || !fs.existsSync(encPath)) throw new Error('Encrypted backup is missing. Restore refused.')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { checksum: string; iv: string; tag: string }
  const body = fs.readFileSync(encPath)
  if (crypto.createHash('sha256').update(body).digest('hex') !== manifest.checksum) throw new Error('Backup checksum mismatch. Restore refused.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(manifest.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(manifest.tag, 'base64'))
  const payload = JSON.parse(Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')) as { files: Array<{ path: string; data: string }> }
  const restored: string[] = []
  for (const file of payload.files) {
    if (!file.path || file.path.includes('..') || path.isAbsolute(file.path) || !RELATIVE.some((prefix) => file.path === prefix || file.path.startsWith(`${prefix}/`)) || file.path.startsWith('brand/.private/backups/')) {
      throw new Error(`Unsafe backup path ${file.path}`)
    }
    writeAtomic(path.join(root, file.path), Buffer.from(file.data, 'base64'))
    restored.push(file.path)
  }
  return { restored }
}

export function migrateBrand(root: string): { from: string; to: string; content_rewritten: false } {
  const lockFile = path.join(root, 'brand', 'engine.lock')
  const current = fs.existsSync(lockFile) ? (JSON.parse(fs.readFileSync(lockFile, 'utf8')) as { version?: string }) : {}
  const from = current.version ?? '0.0.0'
  const logFile = path.join(root, 'brand', 'migrations.yaml')
  const log = fs.existsSync(logFile)
    ? (parse(fs.readFileSync(logFile, 'utf8')) as { schema_version?: number; applied?: Array<{ id: string; touched: string[] }> })
    : { schema_version: 1, applied: [] as Array<{ id: string; touched: string[] }> }
  if (!log || !Array.isArray(log.applied)) throw new Error('Invalid migration history; refusing to overwrite it.')
  const id = `${from}->${ENGINE_VERSION}`
  if (from !== ENGINE_VERSION && !log.applied.some((entry) => entry.id === id)) {
    log.applied.push({ id, touched: ['brand/engine.lock', 'brand/migrations.yaml'] })
  }
  writeAtomic(logFile, stringify(log, { lineWidth: 100 }))
  writeAtomic(
    lockFile,
    `${JSON.stringify({ version: ENGINE_VERSION, note: 'Migration rewrites fact files to canonical schema 2 and does not change fact values, catalogs, or assets.' }, null, 2)}\n`,
  )
  const configFile = path.join(root, 'brand', 'brand.config.yaml')
  const brandId = fs.existsSync(configFile) && fs.readFileSync(configFile, 'utf8').match(/slug:\s*(\S+)/)?.[1] ? fs.readFileSync(configFile, 'utf8').match(/slug:\s*(\S+)/)?.[1] ?? 'unknown' : 'unknown'
  migrateFactFiles(root, brandId.replace(/['"]/g, ''))
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
