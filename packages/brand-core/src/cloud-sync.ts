import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Cloud-sync guard. A brand repository holds `brand/.private` (the approval secret, sealed approvals, owner drafts).
 * A cloud drive that syncs the folder uploads those files, and some uploaders hard-link files into a staging folder
 * while they upload (Google Drive for Desktop: `.tmp.driveupload`), which Brand OS then refuses to read
 * (`unsafe_path: … has more than one hard link`). This module only detects and explains; it never moves anything.
 *
 * Detection rules, strongest first. `certain` means the path itself is a provider folder; `likely` means a marker or a
 * macOS setting suggests it, and the message says "appears to be":
 *   1. under ~/Library/CloudStorage/<Provider>-…            (macOS File Provider: Google Drive, Dropbox, OneDrive, Box)
 *   2. under ~/Library/Mobile Documents/                     (iCloud Drive)
 *   3. an ancestor holds `.tmp.driveupload` or `.tmp.drivedownload`        (Google Drive for Desktop, mirrored folder)
 *   4. an ancestor holds `.dropbox` or `.dropbox.cache`                     (Dropbox)
 *   5. an ancestor is named `OneDrive` or `OneDrive - <org>`                (OneDrive)
 *   6. under ~/Documents or ~/Desktop while ~/Library/Mobile Documents/com~apple~CloudDocs/Documents (or Desktop)
 *      exists: iCloud "Desktop & Documents" is probably on. The folder can outlive the setting, so this is `likely`.
 * The `Icon\r` file some providers drop is not used: it also comes from any folder with a custom icon.
 */

export type CloudProvider = 'google_drive' | 'icloud' | 'dropbox' | 'onedrive' | 'box' | 'cloud_storage'

export interface CloudSyncDetection {
  provider: CloudProvider
  confidence: 'certain' | 'likely'
  /** What matched, as a path relative to the home folder when possible. Never file contents. */
  evidence: string
}

export interface CloudSyncOptions {
  /** Defaults to os.homedir(). Tests pass a temp folder. */
  home?: string
}

export const PROVIDER_NAMES: Record<CloudProvider, string> = {
  google_drive: 'Google Drive',
  icloud: 'iCloud Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  box: 'Box',
  cloud_storage: 'a cloud drive',
}

function real(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

function within(child: string, parent: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function exists(p: string): boolean {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function providerFromCloudStorage(name: string): CloudProvider {
  if (/^GoogleDrive/i.test(name)) return 'google_drive'
  if (/^Dropbox/i.test(name)) return 'dropbox'
  if (/^OneDrive/i.test(name)) return 'onedrive'
  if (/^Box/i.test(name)) return 'box'
  if (/^iCloud/i.test(name)) return 'icloud'
  return 'cloud_storage'
}

/** The cloud drive that likely syncs `target` (a file or folder), or null. Reads only directory entries. */
export function detectCloudSync(target: string, options: CloudSyncOptions = {}): CloudSyncDetection | null {
  const home = real(options.home ?? os.homedir())
  const at = real(target)
  const show = (p: string) => (within(p, home) ? `~/${path.relative(home, p).split(path.sep).join('/')}` : p)

  const cloudStorage = path.join(home, 'Library', 'CloudStorage')
  if (within(at, cloudStorage) && at !== cloudStorage) {
    const name = path.relative(cloudStorage, at).split(path.sep)[0] ?? ''
    return { provider: providerFromCloudStorage(name), confidence: 'certain', evidence: show(path.join(cloudStorage, name)) }
  }
  const mobile = path.join(home, 'Library', 'Mobile Documents')
  if (within(at, mobile) && at !== mobile) return { provider: 'icloud', confidence: 'certain', evidence: show(mobile) }

  let dir = at
  for (;;) {
    for (const marker of ['.tmp.driveupload', '.tmp.drivedownload']) {
      if (exists(path.join(dir, marker))) return { provider: 'google_drive', confidence: 'likely', evidence: show(path.join(dir, marker)) }
    }
    for (const marker of ['.dropbox', '.dropbox.cache']) {
      if (exists(path.join(dir, marker))) return { provider: 'dropbox', confidence: 'likely', evidence: show(path.join(dir, marker)) }
    }
    if (/^OneDrive( - .+)?$/.test(path.basename(dir)) && within(dir, home)) return { provider: 'onedrive', confidence: 'likely', evidence: show(dir) }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  for (const name of ['Documents', 'Desktop']) {
    const local = path.join(home, name)
    const icloud = path.join(mobile, 'com~apple~CloudDocs', name)
    if (within(at, local) && exists(icloud)) return { provider: 'icloud', confidence: 'likely', evidence: show(icloud) }
  }
  return null
}

export type SyncLang = 'en' | 'fa' | 'tr'

function moveCommand(root: string | null): string {
  if (!root) return 'mv <repository> ~/Code/<name>'
  return `mv "${root}" ~/Code/${path.basename(root)}`
}

/**
 * The reason and the fix, in the owner's language. `hardLinks` adds why a hard link appeared (the uploader made it).
 * With no detection, the text names the usual causes so a refused hard link is never a dead end.
 */
export function cloudSyncAdvice(detection: CloudSyncDetection | null, root: string | null, lang: SyncLang = 'en', hardLinks = false): string {
  const mv = moveCommand(root)
  const fix = 'npm run brand:doctor -- --fix-links'
  if (!detection) {
    const text: Record<SyncLang, string> = {
      en: `Hard links usually come from a cloud drive (Google Drive, iCloud, Dropbox, OneDrive) or a backup tool syncing this folder. If this folder is synced, move the repository outside synced folders, e.g. \`${mv}\`, then run \`${fix}\`.`,
      fa: `لینک سخت معمولاً از یک درایو ابری (Google Drive، iCloud، Dropbox، OneDrive) یا ابزار پشتیبان‌گیری می‌آید که این پوشه را همگام می‌کند. اگر این پوشه همگام می‌شود، مخزن را به بیرون از پوشه‌های همگام منتقل کنید، مثلاً \`${mv}\`، سپس \`${fix}\` را اجرا کنید.`,
      tr: `Sabit bağlantılar genellikle bu klasörü eşitleyen bir bulut sürücüsünden (Google Drive, iCloud, Dropbox, OneDrive) veya bir yedekleme aracından gelir. Klasör eşitleniyorsa depoyu eşitlenen klasörlerin dışına taşıyın, örneğin \`${mv}\`, sonra \`${fix}\` çalıştırın.`,
    }
    return text[lang]
  }
  const name = PROVIDER_NAMES[detection.provider]
  const appears = detection.confidence === 'certain'
  const why: Record<SyncLang, string> = hardLinks
    ? {
        en: detection.provider === 'google_drive' ? ' (files are hard-linked by its uploader)' : ' (its sync tool can hard-link or replace files while it uploads)',
        fa: detection.provider === 'google_drive' ? ' (بارگذار آن فایل‌ها را لینک سخت می‌کند)' : ' (ابزار همگام‌سازی آن هنگام بارگذاری ممکن است فایل‌ها را لینک سخت یا جایگزین کند)',
        tr: detection.provider === 'google_drive' ? ' (yükleyicisi dosyalara sabit bağlantı oluşturur)' : ' (eşitleme aracı yükleme sırasında dosyalara sabit bağlantı oluşturabilir veya onları değiştirebilir)',
      }
    : { en: '', fa: '', tr: '' }
  const text: Record<SyncLang, string> = {
    en: `This folder ${appears ? 'is' : 'appears to be'} synced by ${name}${why.en}, so brand/.private (the approval secret and sealed approvals) is uploaded to the cloud. Move the repository outside synced folders, e.g. \`${mv}\`, then run \`${fix}\`.`,
    fa: `این پوشه ${appears ? '' : 'احتمالاً '}توسط ${name} همگام می‌شود${why.fa}، پس brand/.private (رمز تأیید و تأییدهای مهرشده) در فضای ابری بارگذاری می‌شود. مخزن را به بیرون از پوشه‌های همگام منتقل کنید، مثلاً \`${mv}\`، سپس \`${fix}\` را اجرا کنید.`,
    tr: `Bu klasör ${appears ? '' : 'büyük olasılıkla '}${name} tarafından eşitleniyor${why.tr}; bu yüzden brand/.private (onay sırrı ve mühürlü onaylar) buluta yükleniyor. Depoyu eşitlenen klasörlerin dışına taşıyın, örneğin \`${mv}\`, sonra \`${fix}\` çalıştırın.`,
  }
  return text[lang]
}

/** The nearest ancestor holding brand/brand.config.yaml (the brand repository root), or null. */
export function findBrandRoot(from: string): string | null {
  let dir = path.resolve(from)
  for (;;) {
    if (exists(path.join(dir, 'brand', 'brand.config.yaml'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** The sentence appended to a refused hard-linked read: the likely cause and the fix. */
export function hardLinkAdvice(file: string, options: CloudSyncOptions = {}): string {
  const root = findBrandRoot(path.dirname(file))
  return cloudSyncAdvice(detectCloudSync(root ?? path.dirname(file), options), root, 'en', true)
}

// ---- --fix-links ---------------------------------------------------------------------------------------

export interface FixLinksResult {
  ok: boolean
  /** Set when the repository is still inside a synced folder: nothing was changed. */
  refused: string | null
  scanned: number
  hard_linked: number
  fixed: string[]
  failed: Array<{ path: string; reason: string }>
  dry_run: boolean
}

const SKIP_DIRS = new Set(['.git', 'node_modules'])

/**
 * Replaces every hard-linked regular file in the working tree (including brand/.private) with an independent copy:
 * copy to a temp file in the same folder, restore the mode, fsync, rename over the original. The other name (for
 * example the uploader's staging copy) keeps the old bytes; nothing is deleted. `.git` is skipped: Git itself
 * hard-links objects on a local clone, and object files are content-addressed and never edited in place. Symlinks
 * are not followed. Refused while the repository is still inside a synced folder, because the uploader would
 * hard-link the copies again.
 */
export function fixHardLinks(root: string, options: CloudSyncOptions & { dryRun?: boolean } = {}): FixLinksResult {
  const result: FixLinksResult = { ok: true, refused: null, scanned: 0, hard_linked: 0, fixed: [], failed: [], dry_run: Boolean(options.dryRun) }
  const synced = detectCloudSync(root, options)
  if (synced) {
    result.ok = false
    result.refused = cloudSyncAdvice(synced, path.resolve(root))
    return result
  }
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
        continue
      }
      if (!entry.isFile()) continue
      result.scanned += 1
      let stat: fs.Stats
      try {
        stat = fs.lstatSync(full)
      } catch {
        continue
      }
      if (!stat.isFile() || stat.nlink <= 1) continue
      result.hard_linked += 1
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (options.dryRun) {
        result.fixed.push(rel)
        continue
      }
      const tmp = path.join(dir, `.${entry.name}.unlink-${process.pid}.tmp`)
      try {
        fs.writeFileSync(tmp, fs.readFileSync(full), { mode: stat.mode & 0o777, flag: 'wx' })
        fs.chmodSync(tmp, stat.mode & 0o777)
        const fd = fs.openSync(tmp, 'r')
        try {
          fs.fsyncSync(fd)
        } finally {
          fs.closeSync(fd)
        }
        fs.renameSync(tmp, full)
        result.fixed.push(rel)
      } catch (error) {
        fs.rmSync(tmp, { force: true })
        result.failed.push({ path: rel, reason: (error as Error).message })
      }
    }
  }
  walk(path.resolve(root))
  result.ok = result.failed.length === 0
  return result
}
