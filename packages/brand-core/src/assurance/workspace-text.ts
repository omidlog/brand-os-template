/**
 * Human text for the owner-local workspace bridge (GAP-09), in en / fa / tr, and the plain-text
 * renderers for a snapshot and a verify result.
 *
 * Like `report.ts`, these print only what the snapshot carries: ids, revisions (shortened), states and
 * closed-vocabulary values. No brand value can be printed, because the snapshot holds none. The gap
 * report itself is the existing `renderGapReport`; nothing about it is redone here.
 */

import { fill, type AssuranceLang } from './i18n.js'
import type { AssuranceSnapshot, MissingItem, MissingKind, SubjectSource, VerifyResult } from './workspace.js'
import type { FactPresence } from './assess.js'
import type { SubjectField } from './controls.js'

type T = Record<AssuranceLang, string>
type Catalog = Record<string, T>

export const BRIDGE_TEXT: Catalog = {
  title: { en: 'Assurance snapshot — owner-local', fa: 'تصویر لحظه‌ای ارزیابی — فقط محلی و برای مالک', tr: 'Güvence anlık görüntüsü — yalnızca sahibin yerel ortamı' },
  disclaimer: {
    en: 'Internal assessment against Brand OS’s own method. It is not a certification, not a compliance statement and not an independent audit.',
    fa: 'ارزیابی داخلی بر پایهٔ متد خود Brand OS. این گواهی‌نامه، اظهارِ انطباق یا ممیزی مستقل نیست.',
    tr: 'Brand OS’un kendi yöntemine göre iç değerlendirme. Bir sertifika, uyumluluk beyanı veya bağımsız denetim değildir.',
  },
  brand: { en: 'Brand', fa: 'برند', tr: 'Marka' },
  digest: { en: 'Snapshot digest', fa: 'چکیدهٔ تصویر لحظه‌ای', tr: 'Anlık görüntü özeti' },
  bridge: { en: 'Bridge version', fa: 'نسخهٔ پل', tr: 'Köprü sürümü' },
  subject: { en: 'Subject', fa: 'موضوع ارزیابی', tr: 'Değerlendirilen' },
  reproduce: {
    en: 'Re-run with --as-of {as_of} --audience {audience} --paid-media {paid} on the same workspace to get the same digest.',
    fa: 'برای گرفتن همین چکیده، روی همین فضای کاری دوباره با ‎--as-of {as_of} --audience {audience} --paid-media {paid}‎ اجرا کنید.',
    tr: 'Aynı özeti almak için aynı çalışma alanında --as-of {as_of} --audience {audience} --paid-media {paid} ile yeniden çalıştırın.',
  },
  scoreable: {
    en: 'Nothing blocking: the existing evaluator may give a completeness ratio.',
    fa: 'هیچ مانعی نیست: ارزیاب موجود می‌تواند نسبت کامل‌بودن را بدهد.',
    tr: 'Engelleyen bir şey yok: mevcut değerlendirici bir tamlık oranı verebilir.',
  },
  not_scoreable: {
    en: 'No score. The snapshot is incomplete; these items must be resolved first:',
    fa: 'امتیازی داده نمی‌شود. تصویر لحظه‌ای ناقص است؛ اول این موارد باید حل شوند:',
    tr: 'Puan yok. Anlık görüntü eksik; önce şunlar çözülmeli:',
  },
  gaps: { en: 'Gaps (counted as not complete, never filled in):', fa: 'کمبودها (ناکامل شمرده می‌شوند و هرگز پر نمی‌شوند):', tr: 'Eksikler (tamamlanmamış sayılır, asla doldurulmaz):' },
  nothing_missing: { en: 'Nothing is missing.', fa: 'چیزی کم نیست.', tr: 'Eksik bir şey yok.' },
  authorizes: {
    en: 'authorizes: [] — this snapshot approves, publishes, spends and changes nothing.',
    fa: 'authorizes: [] — این تصویر لحظه‌ای هیچ چیزی را تأیید، منتشر، هزینه یا تغییر نمی‌دهد.',
    tr: 'authorizes: [] — bu anlık görüntü hiçbir şeyi onaylamaz, yayımlamaz, harcamaz veya değiştirmez.',
  },
  verify_title: { en: 'Snapshot verification', fa: 'راستی‌آزمایی تصویر لحظه‌ای', tr: 'Anlık görüntü doğrulaması' },
  verify_same: {
    en: 'Reproduced: the workspace gives the same digest as the kept snapshot.',
    fa: 'بازتولید شد: فضای کاری همان چکیدهٔ تصویر نگه‌داشته‌شده را می‌دهد.',
    tr: 'Yeniden üretildi: çalışma alanı saklanan anlık görüntüyle aynı özeti veriyor.',
  },
  verify_diff: {
    en: 'Not reproduced: the workspace changed since the snapshot was kept.',
    fa: 'بازتولید نشد: فضای کاری از زمان نگه‌داشتن این تصویر تغییر کرده است.',
    tr: 'Yeniden üretilemedi: anlık görüntü saklandığından beri çalışma alanı değişti.',
  },
  expected: { en: 'Kept digest', fa: 'چکیدهٔ نگه‌داشته', tr: 'Saklanan özet' },
  actual: { en: 'Digest now', fa: 'چکیدهٔ کنونی', tr: 'Şimdiki özet' },
  changed_refs: { en: 'Cited sources that changed:', fa: 'منابع ارجاع‌شده‌ای که تغییر کرده‌اند:', tr: 'Değişen kaynaklar:' },
  refused_agent: {
    en: 'Assurance on a real brand is the owner’s local review. Refusing while BRAND_OS_AGENT_TOKEN is set; no agent profile covers it.',
    fa: 'ارزیابی روی برند واقعی بازبینی محلی مالک است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود؛ هیچ پروفایل عاملی آن را پوشش نمی‌دهد.',
    tr: 'Gerçek bir markada güvence, sahibin yerel incelemesidir. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir; hiçbir ajan profili bunu kapsamaz.',
  },
  not_a_brand: {
    en: 'This folder is not a Brand OS brand (brand/brand.config.yaml is missing). Run the command from the brand repository root.',
    fa: 'این پوشه برند Brand OS نیست (brand/brand.config.yaml وجود ندارد). فرمان را از ریشهٔ مخزن برند اجرا کنید.',
    tr: 'Bu klasör bir Brand OS markası değil (brand/brand.config.yaml yok). Komutu marka deposunun kökünden çalıştırın.',
  },
  invalid_pin: {
    en: 'The snapshot file could not be used: {reason}',
    fa: 'فایل تصویر لحظه‌ای قابل استفاده نبود: {reason}',
    tr: 'Anlık görüntü dosyası kullanılamadı: {reason}',
  },
  unexpected: {
    en: 'Unexpected error ({name}). The bridge is read-only, so nothing about the brand changed.',
    fa: 'خطای پیش‌بینی‌نشده ({name}). این پل فقط‌خواندنی است، پس چیزی در برند تغییر نکرد.',
    tr: 'Beklenmeyen hata ({name}). Köprü salt okunurdur, bu yüzden markada hiçbir şey değişmedi.',
  },
}

export const MISSING_KIND_TEXT: Record<MissingKind, T> = {
  subject_field: { en: 'Scope not stated', fa: 'دامنه مشخص نشده', tr: 'Kapsam belirtilmedi' },
  fact: { en: 'No approved fact', fa: 'fact تأییدشده‌ای نیست', tr: 'Onaylı bilgi yok' },
  evidence: { en: 'No research note', fa: 'یادداشت پژوهشی نیست', tr: 'Araştırma notu yok' },
  reviewer_judgment: { en: 'A person must judge this control', fa: 'یک انسان باید این کنترل را داوری کند', tr: 'Bu kontrolü bir kişi değerlendirmeli' },
  changed_source: { en: 'A cited source changed', fa: 'منبع ارجاع‌شده تغییر کرده', tr: 'Atıf yapılan kaynak değişti' },
}

export const PRESENCE_TEXT: Record<FactPresence, T> = {
  approved: { en: 'approved', fa: 'تأییدشده', tr: 'onaylı' },
  draft: { en: 'answered, not approved', fa: 'پاسخ داده شده، تأیید نشده', tr: 'yanıtlandı, onaylanmadı' },
  unknown: { en: 'owner said unknown', fa: 'مالک گفته نمی‌داند', tr: 'sahip bilinmiyor dedi' },
  not_applicable: { en: 'owner said not applicable', fa: 'مالک گفته مربوط نیست', tr: 'sahip uygulanamaz dedi' },
  absent: { en: 'not answered', fa: 'پاسخ داده نشده', tr: 'yanıtlanmadı' },
}

export const SUBJECT_FIELD_TEXT: Record<SubjectField, T> = {
  entity_kind: { en: 'Company or person', fa: 'شرکت یا شخص', tr: 'Şirket veya kişi' },
  sells: { en: 'Sells something', fa: 'چیزی می‌فروشد', tr: 'Bir şey satıyor' },
  stage: { en: 'Stage', fa: 'مرحله', tr: 'Aşama' },
  runs_paid_media: { en: 'Runs paid media', fa: 'تبلیغات پولی اجرا می‌کند', tr: 'Ücretli medya kullanıyor' },
}

export const SUBJECT_SOURCE_TEXT: Record<SubjectSource, T> = {
  approved_fact: { en: 'from an approved fact', fa: 'از یک fact تأییدشده', tr: 'onaylı bir bilgiden' },
  brand_config: { en: 'from brand.config.yaml', fa: 'از brand.config.yaml', tr: 'brand.config.yaml dosyasından' },
  owner_flag: { en: 'stated by the owner on the command line', fa: 'اعلام‌شده توسط مالک در خط فرمان', tr: 'sahip tarafından komut satırında belirtildi' },
  none: { en: 'not stated', fa: 'اعلام نشده', tr: 'belirtilmedi' },
}

/** The CLI's help, in three languages. Command names and flags stay as typed. */
export const BRIDGE_HELP: T = {
  en: `brand:assurance <command> [options]   owner-local, read-only

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted] [--paid-media yes|no|unknown]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     pin the brand's approved facts, research notes and contradictions for the
                     Positioning Readiness method, and list what is missing
  assess   (same options)
                     the snapshot, then the existing gap report for it
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     rebuild a kept snapshot from the workspace now and say whether the digest is the same

Nothing is written. Print to the terminal and redirect it yourself if you want to keep a snapshot.
No score is given while anything blocking is missing. This is an internal assessment, never a
certification or a compliance statement; authorizes is always empty. Refused while BRAND_OS_AGENT_TOKEN is set.`,
  fa: `brand:assurance <command> [options]   فقط محلی و فقط‌خواندنی، برای مالک

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted] [--paid-media yes|no|unknown]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     factهای تأییدشده، یادداشت‌های پژوهشی و تناقض‌های برند را برای متد «آمادگی جایگاه‌یابی»
                     سنجاق می‌کند و آنچه کم است را فهرست می‌کند
  assess   (همان گزینه‌ها)
                     تصویر لحظه‌ای و سپس گزارش کمبودهای موجود برای آن
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     تصویر نگه‌داشته را از فضای کاری کنونی دوباره می‌سازد و می‌گوید چکیده همان است یا نه

چیزی نوشته نمی‌شود. خروجی در ترمینال چاپ می‌شود؛ اگر می‌خواهید نگهش دارید خودتان آن را هدایت کنید.
تا وقتی موردی مانع کم است، امتیازی داده نمی‌شود. این ارزیابی داخلی است و هرگز گواهی‌نامه یا اظهار انطباق نیست؛
authorizes همیشه خالی است. تا وقتی BRAND_OS_AGENT_TOKEN تنظیم است اجرا نمی‌شود.`,
  tr: `brand:assurance <command> [options]   yalnızca sahibin yerel ortamı, salt okunur

  snapshot [--as-of YYYY-MM-DD] [--audience public|internal|restricted] [--paid-media yes|no|unknown]
           [--pin <snapshot.json>] [--lang en|fa|tr] [--json]
                     markanın onaylı bilgilerini, araştırma notlarını ve çelişkilerini Konumlandırma Hazırlığı
                     yöntemi için sabitler ve eksikleri listeler
  assess   (aynı seçenekler)
                     anlık görüntü, ardından onun için mevcut eksik raporu
  verify --snapshot <snapshot.json> [--lang en|fa|tr] [--json]
                     saklanan bir anlık görüntüyü şimdiki çalışma alanından yeniden kurar ve özetin aynı olup olmadığını söyler

Hiçbir şey yazılmaz. Çıktı terminale basılır; saklamak isterseniz kendiniz yönlendirin.
Engelleyen bir eksik varken puan verilmez. Bu bir iç değerlendirmedir; asla sertifika veya uyumluluk beyanı değildir;
authorizes her zaman boştur. BRAND_OS_AGENT_TOKEN ayarlıyken reddedilir.`,
}

function missingLine(entry: MissingItem, lang: AssuranceLang): string {
  const parts = [MISSING_KIND_TEXT[entry.kind][lang]]
  if (entry.control_id) parts.push(entry.control_id)
  if (entry.field) parts.push(SUBJECT_FIELD_TEXT[entry.field][lang])
  if (entry.question_ids.length > 0) parts.push(entry.question_ids.map((id) => `\`${id}\``).join(', '))
  if (entry.presence) parts.push(PRESENCE_TEXT[entry.presence][lang])
  if (entry.flag) parts.push(`\`${entry.flag}\``)
  return `- ${parts.join(' · ')}`
}

/** The bridge's header: what was pinned, how to reproduce it, and what is missing. Ids only. */
export function renderSnapshotSummary(snapshot: AssuranceSnapshot, lang: AssuranceLang): string {
  const lines: string[] = [`# ${BRIDGE_TEXT.title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '']
  lines.push(`- ${BRIDGE_TEXT.brand![lang]}: \`${snapshot.brand_id}\``)
  lines.push(`- ${BRIDGE_TEXT.bridge![lang]}: \`${snapshot.bridge_version}\``)
  lines.push(`- ${BRIDGE_TEXT.digest![lang]}: \`${snapshot.source_snapshot_digest}\``)
  lines.push(`- ${fill(BRIDGE_TEXT.reproduce![lang], { as_of: snapshot.as_of.slice(0, 10), audience: snapshot.audience, paid: snapshot.paid_media_statement })}`)
  lines.push(`- ${BRIDGE_TEXT.subject![lang]}:`)
  for (const entry of snapshot.subject_provenance) {
    lines.push(`  - ${SUBJECT_FIELD_TEXT[entry.field][lang]}: \`${entry.value}\` (${SUBJECT_SOURCE_TEXT[entry.source][lang]}${entry.question_id ? `, \`${entry.question_id}\`` : ''})`)
  }
  lines.push('')
  const blocking = snapshot.missing.filter((entry) => entry.blocking)
  const gaps = snapshot.missing.filter((entry) => !entry.blocking)
  if (blocking.length > 0) {
    lines.push(BRIDGE_TEXT.not_scoreable![lang])
    for (const entry of blocking) lines.push(missingLine(entry, lang))
  } else {
    lines.push(BRIDGE_TEXT.scoreable![lang])
  }
  lines.push('')
  if (gaps.length > 0) {
    lines.push(BRIDGE_TEXT.gaps![lang])
    for (const entry of gaps) lines.push(missingLine(entry, lang))
  } else if (blocking.length === 0) {
    lines.push(BRIDGE_TEXT.nothing_missing![lang])
  }
  lines.push('', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}

export function renderVerifyResult(result: VerifyResult, lang: AssuranceLang): string {
  const lines: string[] = [`# ${BRIDGE_TEXT.verify_title![lang]}`, '', `> ${BRIDGE_TEXT.disclaimer![lang]}`, '']
  lines.push(result.reproduced ? BRIDGE_TEXT.verify_same![lang] : BRIDGE_TEXT.verify_diff![lang], '')
  lines.push(`- ${BRIDGE_TEXT.expected![lang]}: \`${result.expected_digest}\``)
  lines.push(`- ${BRIDGE_TEXT.actual![lang]}: \`${result.actual_digest}\``)
  if (result.changed.length > 0) {
    lines.push('', BRIDGE_TEXT.changed_refs![lang])
    for (const ref of result.changed) lines.push(`- \`${ref.kind}:${ref.id}\` (${ref.state})`)
  }
  lines.push('', `- ${BRIDGE_TEXT.authorizes![lang]}`, '')
  return lines.join('\n')
}
