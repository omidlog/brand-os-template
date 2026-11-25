import { readFacts } from '../facts.js'
import type { KnowledgeWorkspace } from '../knowledge/workspace.js'
import { CONTENT_CHANNELS, CONTENT_FORMATS, StrategyError, type ContentChannel, type ContentFormat } from '../strategy/model.js'
import { addDays, isoDate, mondayOf, parseDate, slotFactIds, type ContentSlot, type ContentWeekContent } from './calendar-model.js'
import { loadWeekRecord, proposeWeek } from './calendar-store.js'
import { fill, type ContentLang } from './i18n.js'
import { gapText, planWeek, researchAngles, servedStrategy, type PlannedWeek } from './planner.js'
import type { ContentStrategyView } from './projection.js'

/**
 * `brand:content batch`: N slots of one channel and format (or several `channel:format:count` items), dated by the
 * channel's approved cadence from a start date and grouped into calendar weeks.
 *
 * - It is the planner (`planWeek`) on the served strategy, narrowed to the requested channels and formats, so slots
 *   have the same shape, the same date-indexed rotation of pillars, languages and key messages, and the same pins.
 * - Several items on one channel share its cadence: their formats are interleaved in turn, never stacked on one day.
 * - A channel the strategy lacks, a channel without cadence or a format the channel does not use is refused: the
 *   batch never widens the approved strategy.
 * - Pure: it writes nothing. `storeBatch` stores the weeks as drafts and refuses (writing nothing) when any target
 *   week already has a draft or an approved revision. Approval stays the owner's `week approve`.
 */

export const BATCH_LIMITS = { maxPerItem: 50, maxItems: 10, maxWeeks: 26 } as const

export interface BatchItem {
  channel: ContentChannel
  format: ContentFormat
  count: number
}

export interface BatchOptions {
  lang: ContentLang
  items: BatchItem[]
  /** First date a slot may fall on. Default: the next Monday after today. */
  from?: string
  /** Narrow every slot to one pillar of the strategy. */
  pillar?: string
  strategy_id?: string
  research?: boolean
  now?: Date
}

export interface BatchResult {
  strategy: { strategy_id: string; revision: number; content_sha256: string; status: string }
  from: string
  items: Array<BatchItem & { planned: number; first: string | null; last: string | null }>
  weeks: PlannedWeek[]
  notes: string[]
}

export const BATCH_TEXT: Record<string, Record<ContentLang, string>> = {
  header: {
    en: 'Draft batch (not stored) from {id}@{rev}, starting {from}',
    fa: 'دستهٔ پیش‌نویس (ذخیره نشده) از {id}@{rev}، از تاریخ {from}',
    tr: '{id}@{rev} üzerinden taslak toplu plan (kaydedilmedi), {from} tarihinden itibaren',
  },
  item: { en: '{channel}/{format}: {planned} of {count} ({first} → {last})', fa: '{channel}/{format}: {planned} از {count} ({first} → {last})', tr: '{channel}/{format}: {count} içinden {planned} ({first} → {last})' },
  short: {
    en: '{channel}/{format}: only {planned} of {count} fit in {weeks} weeks at the approved cadence. Raise the cadence in the strategy or ask for fewer.',
    fa: '{channel}/{format}: با تناوب تأییدشده فقط {planned} از {count} در {weeks} هفته جا شد. تناوب را در استراتژی بالا ببرید یا تعداد کمتری بخواهید.',
    tr: '{channel}/{format}: onaylı sıklıkla {weeks} haftaya {count} içinden yalnızca {planned} sığdı. Stratejide sıklığı artırın ya da daha azını isteyin.',
  },
  not_in_strategy: {
    en: '{channel} is not a channel of the approved content strategy. Add it with brand:content strategy and have the owner approve it first.',
    fa: '{channel} در استراتژی محتوای تأییدشده نیست. اول آن را با brand:content strategy اضافه کنید و مالک تأییدش کند.',
    tr: '{channel}, onaylı içerik stratejisinin bir kanalı değil. Önce brand:content strategy ile ekleyin ve sahip onaylasın.',
  },
  no_cadence: {
    en: '{channel} has no approved cadence, so slots cannot be dated. The owner sets it in the content strategy.',
    fa: 'برای {channel} تناوب تأییدشده‌ای نیست، پس تاریخ اسلات‌ها تعیین نمی‌شود. مالک آن را در استراتژی محتوا تعیین می‌کند.',
    tr: '{channel} için onaylı bir sıklık yok, bu yüzden slotlara tarih verilemez. Sahip bunu içerik stratejisinde belirler.',
  },
  format_not_in_channel: {
    en: '{format} is not an approved format for {channel} (approved: {list}).',
    fa: '{format} جزو قالب‌های تأییدشدهٔ {channel} نیست (تأییدشده: {list}).',
    tr: '{format}, {channel} için onaylı bir format değil (onaylı: {list}).',
  },
  pillar_unknown: {
    en: 'Pillar {pillar} is not in the approved strategy (pillars: {list}).',
    fa: 'ستون {pillar} در استراتژی تأییدشده نیست (ستون‌ها: {list}).',
    tr: '{pillar} sütunu onaylı stratejide yok (sütunlar: {list}).',
  },
  pillar_not_on_channel: {
    en: '{channel} does not carry pillar {pillar} in the approved strategy.',
    fa: '{channel} در استراتژی تأییدشده ستون {pillar} را پوشش نمی‌دهد.',
    tr: '{channel}, onaylı stratejide {pillar} sütununu taşımıyor.',
  },
  conflict: {
    en: 'Nothing was stored: {list} already has a stored week. A batch never adds to or overwrites a stored week; edit it with week propose, or reject the draft first.',
    fa: 'چیزی ذخیره نشد: برای {list} از قبل هفتهٔ ذخیره‌شده‌ای هست. دسته هیچ‌وقت چیزی به هفتهٔ ذخیره‌شده اضافه نمی‌کند یا آن را بازنویسی نمی‌کند؛ با week propose ویرایشش کنید یا اول پیش‌نویس را رد کنید.',
    tr: 'Hiçbir şey kaydedilmedi: {list} için zaten kayıtlı bir hafta var. Toplu plan kayıtlı bir haftaya ekleme yapmaz ve üzerine yazmaz; week propose ile düzenleyin ya da önce taslağı reddedin.',
  },
  conflict_preview: {
    en: 'Note: {list} already has a stored week; --store would refuse.',
    fa: 'توجه: برای {list} از قبل هفتهٔ ذخیره‌شده‌ای هست؛ ‎--store رد می‌شود.',
    tr: 'Not: {list} için zaten kayıtlı bir hafta var; --store reddedilir.',
  },
  stored: { en: 'Stored {id} r{n} as a draft.', fa: '{id} نسخهٔ {n} به‌صورت پیش‌نویس ذخیره شد.', tr: '{id} r{n} taslak olarak kaydedildi.' },
  store_hint: {
    en: 'Nothing was stored. Add --out <file> to edit the weeks, or --store to store them as drafts for the owner to review and approve week by week.',
    fa: 'چیزی ذخیره نشد. برای ویرایش هفته‌ها ‎--out <file> و برای ذخیرهٔ آن‌ها به‌صورت پیش‌نویس، تا مالک هفته‌به‌هفته بررسی و تأیید کند، ‎--store را اضافه کنید.',
    tr: 'Hiçbir şey kaydedilmedi. Haftaları düzenlemek için --out <file>, sahibin hafta hafta inceleyip onaylaması için taslak olarak kaydetmek üzere --store ekleyin.',
  },
}

function t(key: string, lang: ContentLang, vars: Record<string, string | number> = {}): string {
  return fill(BATCH_TEXT[key]![lang], vars)
}

/** The Monday after `now` (never `now` itself). */
export function nextMonday(now: Date): string {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return isoDate(addDays(mondayOf(day), 7))
}

/** Parses `instagram:reel:10`. */
export function parseBatchItem(value: string): BatchItem {
  const match = /^([a-z]+):([a-z_]+):(\d{1,3})$/.exec(value.trim())
  if (!match || !(CONTENT_CHANNELS as readonly string[]).includes(match[1]!) || !(CONTENT_FORMATS as readonly string[]).includes(match[2]!)) {
    throw new StrategyError('invalid_input', `--item takes channel:format:count, for example instagram:reel:10 (got ${value}). Formats: ${CONTENT_FORMATS.join(', ')}.`)
  }
  return checkItem({ channel: match[1] as ContentChannel, format: match[2] as ContentFormat, count: Number(match[3]) })
}

function checkItem(item: BatchItem): BatchItem {
  if (!Number.isInteger(item.count) || item.count < 1 || item.count > BATCH_LIMITS.maxPerItem) throw new StrategyError('invalid_input', `A batch item asks for 1 to ${BATCH_LIMITS.maxPerItem} slots (got ${item.count}).`)
  return item
}

/** Formats in turn, while each item still has slots left: reel, post, reel, post, … */
function interleave(items: BatchItem[]): ContentFormat[] {
  const left = items.map((item) => item.count)
  const out: ContentFormat[] = []
  while (left.some((n) => n > 0)) {
    items.forEach((item, i) => {
      if (left[i]! > 0) {
        out.push(item.format)
        left[i]! -= 1
      }
    })
  }
  return out
}

function narrowedView(view: ContentStrategyView, items: BatchItem[], pillar: string | undefined, lang: ContentLang): ContentStrategyView {
  if (pillar && !view.pillars.some((p) => p.id === pillar)) throw new StrategyError('invalid_input', t('pillar_unknown', lang, { pillar, list: view.pillars.map((p) => p.id).join(', ') || '—' }))
  const channels = [...new Set(items.map((item) => item.channel))].map((name) => {
    const channel = view.channels.find((c) => c.channel === name)
    if (!channel) throw new StrategyError('invalid_input', t('not_in_strategy', lang, { channel: name }))
    if (!channel.cadence) throw new StrategyError('invalid_input', t('no_cadence', lang, { channel: name }))
    const formats = [...new Set(items.filter((item) => item.channel === name).map((item) => item.format))]
    for (const format of formats) if (!channel.formats.includes(format)) throw new StrategyError('invalid_input', t('format_not_in_channel', lang, { format, channel: name, list: channel.formats.join(', ') || '—' }))
    if (pillar && channel.pillars.length && !channel.pillars.includes(pillar)) throw new StrategyError('invalid_input', t('pillar_not_on_channel', lang, { channel: name, pillar }))
    return { ...channel, formats, pillars: pillar ? [pillar] : channel.pillars }
  })
  // Keep the strategy's channel order, so slots on the same day sort as in `plan`.
  channels.sort((a, b) => view.channels.findIndex((c) => c.channel === a.channel) - view.channels.findIndex((c) => c.channel === b.channel))
  return { ...view, channels }
}

/** Renumbers kept slots and pins only what they cite. */
function keepSlots(content: ContentWeekContent, slots: ContentSlot[]): ContentWeekContent {
  const finished = slots.map((slot, i) => ({ ...slot, id: `s${String(i + 1).padStart(2, '0')}` }))
  const ids = new Set(finished.flatMap((slot) => slotFactIds(slot)))
  const channels = new Set(finished.map((slot) => slot.channel))
  return {
    ...content,
    slots: finished,
    gaps: content.gaps.filter((gap) => gap.channel === null || channels.has(gap.channel)),
    fact_refs: content.fact_refs.filter((ref) => ids.has(ref.id)),
    research_refs: [...new Set(finished.map((slot) => slot.research?.ref).filter((ref): ref is string => !!ref))].sort(),
  }
}

/** Plans the batch. Writes nothing. */
export function planBatch(ws: KnowledgeWorkspace, opts: BatchOptions): BatchResult {
  const lang = opts.lang
  const now = opts.now ?? ws.now()
  if (!opts.items.length) throw new StrategyError('invalid_input', 'A batch needs at least one item (--channel, --format and --count, or --item channel:format:count).')
  if (opts.items.length > BATCH_LIMITS.maxItems) throw new StrategyError('invalid_input', `At most ${BATCH_LIMITS.maxItems} items per batch.`)
  const items = opts.items.map((item) => checkItem({ ...item }))
  const seen = new Set<string>()
  for (const item of items) {
    const key = `${item.channel}:${item.format}`
    if (seen.has(key)) throw new StrategyError('invalid_input', `${key} is asked for twice. Give one count per channel and format.`)
    seen.add(key)
  }
  const fromDate = opts.from ? parseDate(opts.from, '--from') : parseDate(nextMonday(now), '--from')
  const from = isoDate(fromDate)
  const view = servedStrategy(ws, lang, opts.strategy_id, now)
  const narrowed = narrowedView(view, items, opts.pillar, lang)
  const facts = readFacts(ws.root, 'approved', ws.brandSlug)
  const revisions: Record<string, string> = {}
  for (const [id, fact] of Object.entries(facts)) if (fact.status === 'approved' && fact.revision_hash && fact.classification !== 'restricted') revisions[id] = fact.revision_hash
  const research = opts.research ? researchAngles(ws, lang, now) : null

  const sequence = new Map<ContentChannel, ContentFormat[]>()
  for (const channel of narrowed.channels) sequence.set(channel.channel, interleave(items.filter((item) => item.channel === channel.channel)))
  const used = new Map<ContentChannel, number>([...sequence.keys()].map((channel) => [channel, 0]))
  const done = () => [...sequence.entries()].every(([channel, list]) => used.get(channel)! >= list.length)
  const placed: Array<{ channel: ContentChannel; format: ContentFormat; date: string }> = []

  const weeks: PlannedWeek[] = []
  const monday = mondayOf(fromDate)
  for (let w = 0; w < BATCH_LIMITS.maxWeeks && !done(); w++) {
    const content = planWeek(narrowed, addDays(monday, 7 * w), { channels: narrowed.channels.map((c) => c.channel), research, revisions })
    const kept: ContentSlot[] = []
    for (const slot of content.slots) {
      if (slot.date < from) continue
      const list = sequence.get(slot.channel)!
      const n = used.get(slot.channel)!
      if (n >= list.length) continue
      used.set(slot.channel, n + 1)
      kept.push({ ...slot, format: list[n]! })
      placed.push({ channel: slot.channel, format: list[n]!, date: slot.date })
    }
    if (!kept.length) continue
    const week = keepSlots(content, kept)
    weeks.push({ content: week, gaps: week.gaps.map((gap) => gapText(gap, lang)) })
  }

  const notes: string[] = []
  const summary = items.map((item) => {
    const dates = placed.filter((p) => p.channel === item.channel && p.format === item.format).map((p) => p.date)
    const planned = dates.length
    if (planned < item.count) notes.push(t('short', lang, { channel: item.channel, format: item.format, planned, count: item.count, weeks: BATCH_LIMITS.maxWeeks }))
    return { ...item, planned, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null }
  })
  return { strategy: { strategy_id: view.strategy_id, revision: view.revision, content_sha256: view.digests.content_sha256, status: view.status }, from, items: summary, weeks, notes }
}

/** Weeks of the batch that already have a draft or approved revision stored. */
export function batchConflicts(ws: KnowledgeWorkspace, weekIds: string[]): Array<{ week_id: string; revision: number; state: string }> {
  const out: Array<{ week_id: string; revision: number; state: string }> = []
  for (const id of weekIds) {
    let record
    try {
      record = loadWeekRecord(ws, id)
    } catch (error) {
      if (error instanceof StrategyError && error.code === 'not_found') continue
      throw error
    }
    for (const entry of record.revisions) if (entry.state === 'draft' || entry.state === 'approved') out.push({ week_id: id, revision: entry.revision, state: entry.state })
  }
  return out
}

/**
 * Stores every batch week as a draft revision. Refused before anything is written when a target week already holds a
 * draft or approved revision (the batch never adds to or overwrites a stored week).
 */
export function storeBatch(ws: KnowledgeWorkspace, result: BatchResult, lang: ContentLang): Array<{ week_id: string; revision: number; content_sha256: string }> {
  const conflicts = batchConflicts(ws, result.weeks.map((week) => week.content.week_id))
  if (conflicts.length) throw new StrategyError('exists', t('conflict', lang, { list: conflicts.map((c) => `${c.week_id} (r${c.revision} ${c.state})`).join(', ') }))
  return result.weeks.map((week) => {
    const stored = proposeWeek(ws, { week: week.content, lang })
    return { week_id: week.content.week_id, revision: stored.revision.revision, content_sha256: stored.revision.content_sha256 }
  })
}
