import type { ContentChannel, ContentFormat } from '../strategy/model.js'
import type { ContentLang } from './i18n.js'

/**
 * Deliverable specs: the structure a content agent fills for one slot (camera script, carousel, post, story, thread,
 * article, email). Part of every content brief as `deliverable`.
 *
 * - General practice (`basis: 'general_practice'`), not measured for this brand. Ranges are starting points.
 * - It writes no copy. Every `template` value is null: the agent fills it from the brief's approved facts only
 *   (key message, offer, CTA as given; nothing from must_avoid), and leaves a field null when the brief lists the
 *   source under `missing`.
 * - Labels and guidance follow the brief language (en/fa/tr). The read-aloud pace follows the slot's content language.
 * - Pure and deterministic, so the brief digest stays stable.
 */

export const DELIVERABLE_KINDS = ['script', 'carousel', 'post', 'story', 'thread', 'article', 'email'] as const
export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number]
export const SCRIPT_PRODUCTION = ['talking_head', 'voiceover', 'text_on_screen'] as const
export const STORY_INTERACTIONS = ['poll', 'question', 'quiz', 'link'] as const

type T = Record<ContentLang, string>

export const FORMAT_DELIVERABLE: Record<ContentFormat, DeliverableKind> = {
  reel: 'script',
  short_video: 'script',
  video: 'script',
  live: 'script',
  carousel: 'carousel',
  post: 'post',
  story: 'story',
  thread: 'thread',
  article: 'article',
  email: 'email',
}

/** Approximate read-aloud pace (words per second) by content language. A planning aid, not a measurement. */
export const WORDS_PER_SECOND: Record<string, number> = { en: 2.5, fa: 2.2, tr: 1.9 }
const DEFAULT_WPS = 2.2

export interface DeliverablePart {
  id: string
  label: string
  guidance: string
  /** How many of this part (beats, slides, frames, posts, sections). */
  count?: { min: number; max: number }
  /** Seconds into a video, for script parts. */
  seconds?: { from: number; to: number | null }
  max_words?: number
}

interface Base {
  kind: DeliverableKind
  format: ContentFormat
  channel: ContentChannel
  basis: 'general_practice'
  parts: DeliverablePart[]
  /** The shape to return, every value null until the agent fills it from this brief. */
  template: Record<string, unknown>
  rules: string[]
  notice: string
}

export interface ScriptDeliverable extends Base {
  kind: 'script'
  production_options: Array<(typeof SCRIPT_PRODUCTION)[number]>
  duration_seconds: { min: number; max: number }
  read_aloud: { language: string; words_per_second: number; words: { min: number; max: number } }
  captions_on: true
  delivery_notes: string[]
}

export interface CarouselDeliverable extends Base {
  kind: 'carousel'
  slides: { min: number; max: number }
  max_words_per_slide: number
  caption: { first_line_max_chars: number; hashtags: { min: number; max: number } }
}

export interface PostDeliverable extends Base {
  kind: 'post'
  visual_headline_max_words: number
  caption: { structure: string[]; first_line_max_chars: number; hashtags: { min: number; max: number }; hashtag_note: string }
}

export interface StoryDeliverable extends Base {
  kind: 'story'
  frames: { min: number; max: number }
  /** Exactly one interaction per story sequence. */
  interaction_options: Array<(typeof STORY_INTERACTIONS)[number]>
}

export interface TextDeliverable extends Base {
  kind: 'thread' | 'article' | 'email'
  length: { unit: 'posts' | 'words'; min: number; max: number }
}

export type DeliverableSpec = ScriptDeliverable | CarouselDeliverable | PostDeliverable | StoryDeliverable | TextDeliverable

// ---- text --------------------------------------------------------------------------------------------------

const L: Record<string, T> = {
  hook: { en: 'Hook', fa: 'قلاب', tr: 'Kanca' },
  setup: { en: 'Setup', fa: 'زمینه‌چینی', tr: 'Giriş' },
  beats: { en: 'Beats', fa: 'بخش‌های اصلی', tr: 'Ana bölümler' },
  payoff: { en: 'Payoff', fa: 'نتیجه', tr: 'Sonuç' },
  cta: { en: 'Call to action', fa: 'دعوت به اقدام', tr: 'Eylem çağrısı' },
  caption: { en: 'Caption', fa: 'کپشن', tr: 'Açıklama' },
  slide_hook: { en: 'Hook slide', fa: 'اسلاید قلاب', tr: 'Kanca slaytı' },
  slide_value: { en: 'Value slides', fa: 'اسلایدهای محتوا', tr: 'Değer slaytları' },
  slide_recap: { en: 'Recap slide', fa: 'اسلاید جمع‌بندی', tr: 'Özet slaytı' },
  slide_cta: { en: 'CTA slide', fa: 'اسلاید دعوت به اقدام', tr: 'Eylem çağrısı slaytı' },
  headline: { en: 'Visual headline', fa: 'تیتر روی تصویر', tr: 'Görsel başlık' },
  first_line: { en: 'First line', fa: 'خط اول', tr: 'İlk satır' },
  body: { en: 'Body', fa: 'متن اصلی', tr: 'Gövde' },
  hashtags: { en: 'Hashtags', fa: 'هشتگ‌ها', tr: 'Etiketler' },
  frame_hook: { en: 'Opening frame', fa: 'فریم آغاز', tr: 'Açılış karesi' },
  frame_context: { en: 'Context frames', fa: 'فریم‌های زمینه', tr: 'Bağlam kareleri' },
  frame_interaction: { en: 'Interaction frame', fa: 'فریم تعاملی', tr: 'Etkileşim karesi' },
  frame_cta: { en: 'Closing frame', fa: 'فریم پایانی', tr: 'Kapanış karesi' },
  thread_first: { en: 'First post', fa: 'پست اول', tr: 'İlk gönderi' },
  thread_points: { en: 'Point posts', fa: 'پست‌های اصلی', tr: 'Ana gönderiler' },
  thread_recap: { en: 'Recap and next step', fa: 'جمع‌بندی و قدم بعدی', tr: 'Özet ve sonraki adım' },
  title: { en: 'Title', fa: 'عنوان', tr: 'Başlık' },
  intro: { en: 'Introduction', fa: 'مقدمه', tr: 'Giriş' },
  sections: { en: 'Sections', fa: 'بخش‌ها', tr: 'Bölümler' },
  conclusion: { en: 'Conclusion', fa: 'جمع‌بندی', tr: 'Sonuç' },
  subject: { en: 'Subject line', fa: 'عنوان ایمیل', tr: 'Konu satırı' },
  preview: { en: 'Preview text', fa: 'متن پیش‌نمایش', tr: 'Önizleme metni' },
  opening: { en: 'Opening', fa: 'شروع', tr: 'Açılış' },
  signoff: { en: 'Sign-off', fa: 'امضا و پایان', tr: 'Kapanış' },
}

const G: Record<string, T> = {
  hook: {
    en: 'The first words and image stop the scroll. Start with the problem, the result or a question, never with a logo or greeting.',
    fa: 'اولین کلمه‌ها و اولین تصویر باید اسکرول را متوقف کنند. با مسئله، نتیجه یا یک سؤال شروع کنید، هرگز با لوگو یا سلام و احوال‌پرسی.',
    tr: 'İlk kelimeler ve ilk görüntü kaydırmayı durdurur. Sorunla, sonuçla ya da bir soruyla başlayın; asla logo ya da selamlamayla değil.',
  },
  setup: {
    en: 'One or two sentences: why this matters to the audience in the brief.',
    fa: 'یکی دو جمله: چرا این موضوع برای مخاطبِ این بریف مهم است.',
    tr: 'Bir iki cümle: bu konu brifteki hedef kitle için neden önemli.',
  },
  beats: {
    en: 'Each beat is one point, one line to say, its on-screen text and a b-roll idea. Serve the key message as given.',
    fa: 'هر بخش یک نکته است: یک جمله برای گفتن، متن روی تصویرش و یک ایده برای تصویر مکمل (B-roll). پیام کلیدی را همان‌طور که داده شده منتقل کنید.',
    tr: 'Her bölüm tek bir noktadır: söylenecek bir cümle, ekran yazısı ve bir ara görüntü (B-roll) fikri. Ana mesajı verildiği gibi aktarın.',
  },
  payoff: {
    en: 'Deliver what the hook promised, in one clear line.',
    fa: 'همان چیزی را که قلاب وعده داد، در یک جملهٔ روشن تحویل دهید.',
    tr: 'Kancanın vaat ettiğini tek ve net bir cümleyle verin.',
  },
  cta: {
    en: 'Use the brief’s CTA fact or CTA rules only. If the brief lists slot.cta under missing, leave it null and say so.',
    fa: 'فقط از واقعیت CTA یا قواعد CTA در بریف استفاده کنید. اگر بریف slot.cta را در missing آورده، آن را null بگذارید و اعلام کنید.',
    tr: 'Yalnızca brifteki CTA bilgisini ya da CTA kurallarını kullanın. Brif slot.cta’yı missing altında listeliyorsa null bırakın ve belirtin.',
  },
  caption: {
    en: 'The first line carries the point; then the body; then the CTA. Nothing from must_avoid.',
    fa: 'خط اول اصل حرف را می‌زند؛ بعد متن اصلی؛ بعد دعوت به اقدام. هیچ چیزی از must_avoid نیاید.',
    tr: 'İlk satır asıl fikri taşır; sonra gövde; sonra eylem çağrısı. must_avoid’den hiçbir şey yok.',
  },
  slide_hook: {
    en: 'A promise in a few words, large and readable on a phone.',
    fa: 'یک وعده در چند کلمه، درشت و خوانا روی گوشی.',
    tr: 'Birkaç kelimelik bir vaat; telefonda büyük ve okunaklı.',
  },
  slide_value: {
    en: 'One idea per slide, in the order a reader would act on them.',
    fa: 'هر اسلاید یک ایده، به ترتیبی که خواننده بر اساسشان عمل می‌کند.',
    tr: 'Her slaytta tek fikir, okurun uygulayacağı sırayla.',
  },
  slide_recap: {
    en: 'A short summary or checklist people save.',
    fa: 'یک خلاصه یا چک‌لیست کوتاه که آدم‌ها ذخیره‌اش کنند.',
    tr: 'İnsanların kaydedeceği kısa bir özet ya da kontrol listesi.',
  },
  slide_cta: {
    en: 'The brief’s CTA, as given.',
    fa: 'دعوت به اقدامِ بریف، همان‌طور که داده شده.',
    tr: 'Brifteki eylem çağrısı, verildiği gibi.',
  },
  headline: {
    en: 'The single idea of the post, readable at a glance.',
    fa: 'تنها ایدهٔ پست، طوری که با یک نگاه خوانده شود.',
    tr: 'Gönderinin tek fikri, bir bakışta okunur şekilde.',
  },
  frame_hook: {
    en: 'Say what this sequence is about in the first frame.',
    fa: 'در فریم اول بگویید این مجموعه استوری دربارهٔ چیست.',
    tr: 'İlk karede bu hikâye dizisinin ne hakkında olduğunu söyleyin.',
  },
  frame_context: {
    en: 'Show, do not tell: behind the scenes, a step, a before and after.',
    fa: 'نشان دهید، نگویید: پشت‌صحنه، یک مرحله، قبل و بعد.',
    tr: 'Anlatmayın, gösterin: kamera arkası, bir adım, öncesi ve sonrası.',
  },
  frame_interaction: {
    en: 'Exactly one interaction: a poll, a question box, a quiz or a link.',
    fa: 'دقیقاً یک تعامل: نظرسنجی، جعبهٔ سؤال، کوییز یا لینک.',
    tr: 'Tam olarak bir etkileşim: anket, soru kutusu, test ya da bağlantı.',
  },
  frame_cta: {
    en: 'Close with the brief’s CTA or a pointer to the related post.',
    fa: 'با دعوت به اقدامِ بریف یا ارجاع به پست مرتبط تمام کنید.',
    tr: 'Brifteki eylem çağrısıyla ya da ilgili gönderiye bir yönlendirmeyle kapatın.',
  },
  thread_first: {
    en: 'Works alone in the feed and promises the payoff.',
    fa: 'به‌تنهایی در فید کار می‌کند و نتیجه را وعده می‌دهد.',
    tr: 'Akışta tek başına işe yarar ve kazancı vaat eder.',
  },
  thread_points: {
    en: 'One point per post, each readable on its own.',
    fa: 'هر پست یک نکته، و هر کدام به‌تنهایی قابل فهم.',
    tr: 'Her gönderide tek nokta, her biri tek başına okunabilir.',
  },
  thread_recap: {
    en: 'Sum up, then the brief’s CTA.',
    fa: 'جمع‌بندی کنید، بعد دعوت به اقدامِ بریف.',
    tr: 'Özetleyin, sonra brifteki eylem çağrısı.',
  },
  title: {
    en: 'Says what the reader gets, in the words they would search for.',
    fa: 'می‌گوید خواننده چه چیزی به دست می‌آورد، با همان کلماتی که جست‌وجو می‌کند.',
    tr: 'Okurun ne kazanacağını, arayacağı kelimelerle söyler.',
  },
  intro: {
    en: 'Answer the main question early, then promise the detail.',
    fa: 'جواب پرسش اصلی را زود بدهید، بعد جزئیات را وعده دهید.',
    tr: 'Ana soruyu erken yanıtlayın, sonra ayrıntıyı vaat edin.',
  },
  sections: {
    en: 'Headings that read like questions; every claim backed by a fact in this brief.',
    fa: 'تیترهایی شبیه پرسش؛ هر ادعا با یک واقعیتِ همین بریف پشتیبانی شود.',
    tr: 'Soru gibi okunan ara başlıklar; her iddia bu brifteki bir bilgiyle desteklenir.',
  },
  conclusion: {
    en: 'What to do next, then the brief’s CTA.',
    fa: 'قدم بعدی چیست، بعد دعوت به اقدامِ بریف.',
    tr: 'Sonra ne yapılacağı, ardından brifteki eylem çağrısı.',
  },
  subject: {
    en: 'Short and specific: what the reader gets from this issue.',
    fa: 'کوتاه و مشخص: خواننده از این شماره چه چیزی به دست می‌آورد.',
    tr: 'Kısa ve net: okur bu sayıdan ne kazanacak.',
  },
  preview: {
    en: 'Completes the subject line; it is not a repeat of it.',
    fa: 'عنوان را کامل می‌کند، تکرارش نیست.',
    tr: 'Konu satırını tamamlar, onu tekrar etmez.',
  },
  opening: {
    en: 'One or two lines that connect to the reader.',
    fa: 'یکی دو خط که با خواننده ارتباط برقرار کند.',
    tr: 'Okurla bağ kuran bir iki satır.',
  },
  body: {
    en: 'One main idea, short paragraphs.',
    fa: 'یک ایدهٔ اصلی، پاراگراف‌های کوتاه.',
    tr: 'Tek ana fikir, kısa paragraflar.',
  },
  signoff: {
    en: 'A consistent sign-off; invite replies.',
    fa: 'پایان‌بندی ثابت؛ خواننده را به جواب دادن دعوت کنید.',
    tr: 'Tutarlı bir kapanış; yanıt vermeye davet edin.',
  },
}

const RULES: Record<string, T> = {
  facts_only: {
    en: 'Fill every field from this brief only: key message, offer and CTA as given, voice from its sources, nothing from must_avoid.',
    fa: 'هر فیلد را فقط از همین بریف پر کنید: پیام کلیدی، پیشنهاد و دعوت به اقدام همان‌طور که داده شده، لحن از منابع آن، و هیچ چیزی از must_avoid.',
    tr: 'Her alanı yalnızca bu brifle doldurun: ana mesaj, teklif ve eylem çağrısı verildiği gibi, ses tonu kaynaklarından, must_avoid’den hiçbir şey yok.',
  },
  missing_stays: {
    en: 'A field whose source the brief lists under missing stays null; say so in your handoff.',
    fa: 'فیلدی که منبعش در missing بریف آمده null می‌ماند؛ این را در گزارش تحویل بگویید.',
    tr: 'Kaynağı brifte missing altında listelenen alan null kalır; teslimde bunu belirtin.',
  },
  language: {
    en: 'Write in the slot language and direction. Do not translate an approved sentence unless that translation is approved.',
    fa: 'به زبان و جهت نوشتاری اسلات بنویسید. جملهٔ تأییدشده را ترجمه نکنید مگر اینکه ترجمه‌اش هم تأیید شده باشد.',
    tr: 'Slotun dilinde ve yazı yönünde yazın. Onaylı bir cümleyi, çevirisi de onaylı değilse çevirmeyin.',
  },
}

const NOTICE: T = {
  en: 'General practice for this format, not measured for this brand. It structures the work; it writes no copy and authorizes nothing.',
  fa: 'روال رایج برای این قالب است و برای این برند اندازه‌گیری نشده. فقط ساختار کار را می‌دهد؛ متنی نمی‌نویسد و هیچ مجوزی نمی‌دهد.',
  tr: 'Bu format için genel uygulamadır, bu marka için ölçülmemiştir. İşi yapılandırır; metin yazmaz ve hiçbir şeye yetki vermez.',
}

const DELIVERY: Record<string, T> = {
  pace: {
    en: 'Read at a natural pace; the word budget assumes about {wps} words per second in {language}. Cut words, not pauses that carry meaning.',
    fa: 'با سرعت طبیعی بخوانید؛ بودجهٔ کلمات بر اساس حدود {wps} کلمه در ثانیه برای زبان {language} حساب شده. کلمه کم کنید، نه مکث‌هایی که معنا دارند.',
    tr: 'Doğal bir hızla okuyun; kelime bütçesi {language} için saniyede yaklaşık {wps} kelimeye göre hesaplandı. Anlam taşıyan duraklamaları değil, kelimeleri kısaltın.',
  },
  eyeline: {
    en: 'Talking head: look into the lens, not at the screen; keep the camera at eye level.',
    fa: 'برای ویدیوی رو به دوربین: به لنز نگاه کنید نه به صفحه؛ دوربین هم‌سطح چشم باشد.',
    tr: 'Kameraya konuşurken: ekrana değil, objektife bakın; kamera göz hizasında olsun.',
  },
  lines: {
    en: 'One sentence per line so it can be read from a prompter or recorded line by line.',
    fa: 'هر جمله در یک خط، تا بشود از روی پرامپتر خواند یا خط‌به‌خط ضبط کرد.',
    tr: 'Her satıra bir cümle; böylece prompter’dan okunabilir ya da satır satır kaydedilebilir.',
  },
  captions: {
    en: 'Captions on; on-screen text repeats the key words, not the whole line.',
    fa: 'زیرنویس روشن باشد؛ متن روی تصویر فقط کلمه‌های کلیدی را تکرار کند، نه کل جمله را.',
    tr: 'Altyazı açık; ekran yazısı tüm cümleyi değil, anahtar kelimeleri tekrar eder.',
  },
  live: {
    en: 'For a live: treat the beats as a run of show, plan the questions you will take and when you will repeat the CTA.',
    fa: 'برای لایو: بخش‌ها را مثل ترتیب برنامه در نظر بگیرید و مشخص کنید چه سؤال‌هایی را جواب می‌دهید و کی دعوت به اقدام را تکرار می‌کنید.',
    tr: 'Canlı yayın için: bölümleri yayın akışı gibi düşünün; hangi soruları alacağınızı ve eylem çağrısını ne zaman tekrarlayacağınızı planlayın.',
  },
}

const HASHTAG_NOTE: T = {
  en: 'Use only tags that describe the topic; no tag implies a claim the brief does not make.',
  fa: 'فقط هشتگ‌هایی که موضوع را توصیف می‌کنند؛ هیچ هشتگی نباید ادعایی را القا کند که بریف مطرح نکرده.',
  tr: 'Yalnızca konuyu anlatan etiketler; hiçbir etiket brifin yapmadığı bir iddiayı ima etmemeli.',
}

// ---- numbers (general practice) ------------------------------------------------------------------------------

const DURATION: Record<'reel' | 'short_video' | 'video' | 'live', { min: number; max: number }> = {
  reel: { min: 15, max: 60 },
  short_video: { min: 15, max: 60 },
  video: { min: 60, max: 180 },
  live: { min: 900, max: 2700 },
}
const DURATION_BY_CHANNEL: Partial<Record<`${ContentChannel}:${'reel' | 'short_video' | 'video' | 'live'}`, { min: number; max: number }>> = {
  'youtube:video': { min: 300, max: 900 },
  'tiktok:short_video': { min: 15, max: 45 },
  'x:short_video': { min: 15, max: 45 },
  'linkedin:video': { min: 30, max: 120 },
}
const HASHTAGS: Partial<Record<ContentChannel, { min: number; max: number }>> = {
  instagram: { min: 3, max: 5 },
  linkedin: { min: 0, max: 3 },
  x: { min: 0, max: 2 },
  threads: { min: 0, max: 1 },
  facebook: { min: 0, max: 2 },
  tiktok: { min: 2, max: 4 },
  telegram: { min: 0, max: 3 },
  pinterest: { min: 0, max: 0 },
  youtube: { min: 0, max: 3 },
}
const CAROUSEL_SLIDES: Partial<Record<ContentChannel, { min: number; max: number }>> = { linkedin: { min: 6, max: 12 } }

function part(id: string, lang: ContentLang, extra: Partial<DeliverablePart> = {}, labelId = id): DeliverablePart {
  return { id, label: L[labelId]![lang], guidance: G[labelId]![lang], ...extra }
}

function rules(lang: ContentLang): string[] {
  return [RULES.facts_only![lang], RULES.missing_stays![lang], RULES.language![lang]]
}

function fillVars(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}

/**
 * The deliverable spec for one slot. `lang` is the brief language (labels); `language` is the slot's content
 * language (read-aloud pace). Null when the slot has no format.
 */
export function deliverableSpec(input: { format: ContentFormat | null; channel: ContentChannel; language: string; lang: ContentLang }): DeliverableSpec | null {
  const { format, channel, language, lang } = input
  if (!format) return null
  const kind = FORMAT_DELIVERABLE[format]
  const base = { format, channel, basis: 'general_practice' as const, rules: rules(lang), notice: NOTICE[lang] }
  switch (kind) {
    case 'script': {
      const videoFormat = format as 'reel' | 'short_video' | 'video' | 'live'
      const duration = DURATION_BY_CHANNEL[`${channel}:${videoFormat}`] ?? DURATION[videoFormat]
      const wps = WORDS_PER_SECOND[language.split('-')[0]!] ?? DEFAULT_WPS
      const beatTemplate = { line: null, on_screen_text: null, b_roll: null }
      return {
        kind,
        ...base,
        production_options: [...SCRIPT_PRODUCTION],
        duration_seconds: duration,
        read_aloud: { language, words_per_second: wps, words: { min: Math.round(duration.min * wps * 0.85), max: Math.round(duration.max * wps * 0.85) } },
        captions_on: true,
        parts: [
          part('hook', lang, { seconds: { from: 0, to: 3 } }),
          part('setup', lang),
          part('beats', lang, { count: { min: 3, max: 5 } }),
          part('payoff', lang),
          part('cta', lang),
          part('caption', lang),
        ],
        template: {
          production: null,
          duration_seconds: null,
          hook: { line: null, on_screen_text: null, visual: null },
          setup: { line: null, on_screen_text: null },
          beats: [beatTemplate, beatTemplate, beatTemplate],
          payoff: { line: null, on_screen_text: null },
          cta: { line: null, on_screen_text: null },
          caption: null,
          captions_on: true,
        },
        delivery_notes: [fillVars(DELIVERY.pace![lang], { wps, language }), DELIVERY.eyeline![lang], DELIVERY.lines![lang], DELIVERY.captions![lang], ...(format === 'live' ? [DELIVERY.live![lang]] : [])],
      }
    }
    case 'carousel': {
      const slides = CAROUSEL_SLIDES[channel] ?? { min: 5, max: 10 }
      return {
        kind,
        ...base,
        slides,
        max_words_per_slide: 25,
        caption: { first_line_max_chars: 125, hashtags: HASHTAGS[channel] ?? { min: 0, max: 3 } },
        parts: [part('slide_hook', lang, { count: { min: 1, max: 1 }, max_words: 12 }), part('slide_value', lang, { count: { min: Math.max(1, slides.min - 3), max: slides.max - 3 }, max_words: 25 }), part('slide_recap', lang, { count: { min: 1, max: 1 } }), part('slide_cta', lang, { count: { min: 1, max: 1 } }), part('caption', lang)],
        template: { slides: [{ role: 'hook', headline: null, text: null, visual: null }, { role: 'value', headline: null, text: null, visual: null }, { role: 'recap', headline: null, text: null, visual: null }, { role: 'cta', headline: null, text: null, visual: null }], caption: null, hashtags: [] },
      }
    }
    case 'post': {
      const tags = HASHTAGS[channel] ?? { min: 0, max: 3 }
      return {
        kind,
        ...base,
        visual_headline_max_words: 8,
        caption: { structure: ['first_line', 'body', 'cta', 'hashtags'], first_line_max_chars: channel === 'linkedin' ? 200 : 125, hashtags: tags, hashtag_note: HASHTAG_NOTE[lang] },
        parts: [part('headline', lang, { max_words: 8 }), part('first_line', lang, {}, 'hook'), part('body', lang), part('cta', lang), part('hashtags', lang, { count: tags }, 'caption')],
        template: { visual_headline: null, visual: null, caption: { first_line: null, body: null, cta: null }, hashtags: [] },
      }
    }
    case 'story':
      return {
        kind,
        ...base,
        frames: { min: 3, max: 7 },
        interaction_options: [...STORY_INTERACTIONS],
        parts: [part('frame_hook', lang, { count: { min: 1, max: 1 } }), part('frame_context', lang, { count: { min: 1, max: 4 } }), part('frame_interaction', lang, { count: { min: 1, max: 1 } }), part('frame_cta', lang, { count: { min: 1, max: 1 } })],
        template: { frames: [{ role: 'hook', text: null, visual: null }, { role: 'context', text: null, visual: null }, { role: 'interaction', text: null, interaction: null }, { role: 'cta', text: null, visual: null }] },
      }
    case 'thread':
      return {
        kind,
        ...base,
        length: { unit: 'posts', min: 4, max: 10 },
        parts: [part('thread_first', lang, { count: { min: 1, max: 1 } }), part('thread_points', lang, { count: { min: 2, max: 8 } }), part('thread_recap', lang, { count: { min: 1, max: 1 } })],
        template: { posts: [{ role: 'first', text: null }, { role: 'point', text: null }, { role: 'recap', text: null }] },
      }
    case 'article':
      return {
        kind,
        ...base,
        length: { unit: 'words', min: 800, max: 2000 },
        parts: [part('title', lang), part('intro', lang), part('sections', lang, { count: { min: 3, max: 6 } }), part('conclusion', lang), part('cta', lang)],
        template: { title: null, meta_description: null, intro: null, sections: [{ heading: null, body: null }], conclusion: null, cta: null },
      }
    case 'email':
      return {
        kind,
        ...base,
        length: { unit: 'words', min: 150, max: 600 },
        parts: [part('subject', lang, { max_words: 9 }), part('preview', lang, { max_words: 15 }), part('opening', lang), part('body', lang), part('cta', lang), part('signoff', lang)],
        template: { subject: null, preview: null, opening: null, body: null, cta: null, sign_off: null },
      }
  }
}
