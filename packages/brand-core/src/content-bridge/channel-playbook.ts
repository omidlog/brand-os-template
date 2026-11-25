import {
  CHANNEL_KPI_METRICS,
  CHANNEL_OBJECTIVES,
  CONTENT_MIX_TYPES,
  StrategyError,
  type ChannelKpiMetric,
  type ChannelKpiPeriod,
  type ChannelMixShare,
  type ChannelObjective,
  type ContentChannel,
  type ContentFormat,
  type ContentMixType,
} from '../strategy/model.js'
import type { ContentLang } from './i18n.js'

/**
 * The channel playbook: general practice for each social network, newsletter and blog (en/fa/tr).
 *
 * - It is engine guidance, not this brand's decision and not a measured result. Every entry says so
 *   (`basis: 'general_practice'`). It cites no fact and holds no brand voice, claim, audience or number.
 * - `brand:content strategy --playbook` copies the suggested role, formats, starting cadence, objective, mix and KPI
 *   names (without targets) into a proposal; the owner reviews and approves it with brand:strategy like any other
 *   proposal. The proposal notes and an assumption line say which values came from here.
 * - KPI targets are always null here: the playbook names what to watch, never a number to hit.
 * - It authorizes nothing (`authorizes: []`): no post, schedule, publication or spend.
 */

export const CONTENT_PLAYBOOK_SCHEMA = 'brand-os/content-playbook/v1' as const

type T = Record<ContentLang, string>

export interface PlaybookCadence {
  per: 'week' | 'month'
  min: number
  max: number
  /** A conservative starting point inside the range. */
  start: number
}

export interface ChannelPlaybookEntry {
  channel: ContentChannel
  basis: 'general_practice'
  role: T
  formats: ContentFormat[]
  cadence: PlaybookCadence
  objective: ChannelObjective
  mix: ChannelMixShare[]
  /** What to watch. No targets: those are the owner's. */
  kpis: Array<{ metric: ChannelKpiMetric; per: ChannelKpiPeriod }>
  posting_windows_note: T
  craft: T[]
}

const mix = (shares: Partial<Record<ContentMixType, number>>): ChannelMixShare[] =>
  CONTENT_MIX_TYPES.filter((type) => shares[type]).map((type) => ({ type, share: shares[type]! }))

const ENTRIES: ChannelPlaybookEntry[] = [
  {
    channel: 'instagram',
    basis: 'general_practice',
    role: {
      en: 'Discovery and trust: short videos to reach new people, carousels and stories to keep followers close.',
      fa: 'دیده‌شدن و اعتمادسازی: ویدیوهای کوتاه برای رسیدن به آدم‌های تازه، کروسل و استوری برای نزدیک نگه داشتن دنبال‌کننده‌ها.',
      tr: 'Keşfedilme ve güven: yeni insanlara ulaşmak için kısa videolar, takipçileri yakın tutmak için karuseller ve hikâyeler.',
    },
    formats: ['reel', 'carousel', 'story', 'post'],
    cadence: { per: 'week', min: 3, max: 5, start: 3 },
    objective: 'awareness',
    mix: mix({ educate: 40, inspire: 20, connect: 20, promote: 10, entertain: 10 }),
    kpis: [
      { metric: 'reach', per: 'post' },
      { metric: 'saves', per: 'post' },
      { metric: 'shares', per: 'post' },
      { metric: 'follows', per: 'week' },
      { metric: 'profile_visits', per: 'week' },
    ],
    posting_windows_note: {
      en: "Weekday evenings and lunch breaks in your audience's time zone are a common start; move to what your own Insights show after about a month.",
      fa: 'عصرهای روزهای کاری و وقت ناهار، به وقت محلی مخاطب، شروع رایجی است؛ بعد از حدود یک ماه بر اساس Insights خودتان جابه‌جا کنید.',
      tr: 'Hedef kitlenizin saat diliminde hafta içi akşamları ve öğle araları yaygın bir başlangıçtır; yaklaşık bir ay sonra kendi Insights verilerinize göre kaydırın.',
    },
    craft: [
      {
        en: 'Reels are the main reach format: put the hook in the first 3 seconds, before any logo or intro.',
        fa: 'ریلز اصلی‌ترین قالب برای دیده‌شدن است: قلاب را در ۳ ثانیهٔ اول بگذارید، قبل از هر لوگو یا مقدمه‌ای.',
        tr: 'Reels erişimin ana formatıdır: kancayı ilk 3 saniyeye, her türlü logo ya da girişten önce koyun.',
      },
      {
        en: 'Carousels earn saves: one idea per slide, a clear first slide, a recap or checklist near the end.',
        fa: 'کروسل ذخیره می‌گیرد: هر اسلاید یک ایده، اسلاید اول روشن و گویا، و یک جمع‌بندی یا چک‌لیست نزدیک انتهای آن.',
        tr: 'Karuseller kaydedilme getirir: her slaytta tek fikir, net bir ilk slayt, sona doğru bir özet ya da kontrol listesi.',
      },
      {
        en: 'Keep captions on in videos; many people watch without sound.',
        fa: 'زیرنویس ویدیوها را روشن نگه دارید؛ خیلی‌ها بی‌صدا تماشا می‌کنند.',
        tr: 'Videolarda altyazıyı açık tutun; birçok kişi sesi kapalı izler.',
      },
      {
        en: 'Use stories for day-to-day connection (polls, questions, behind the scenes); they keep existing followers close.',
        fa: 'از استوری برای ارتباط روزمره استفاده کنید (نظرسنجی، سؤال، پشت‌صحنه)؛ دنبال‌کننده‌های فعلی را نزدیک نگه می‌دارد.',
        tr: 'Hikâyeleri günlük bağ için kullanın (anketler, sorular, kamera arkası); mevcut takipçileri yakın tutar.',
      },
      {
        en: 'Put the key point in the first line of the caption; the rest is hidden behind “more”.',
        fa: 'نکتهٔ اصلی را در خط اول کپشن بیاورید؛ بقیه پشت «بیشتر» پنهان می‌شود.',
        tr: 'Ana noktayı açıklamanın ilk satırına koyun; gerisi “devamı” arkasında kalır.',
      },
      {
        en: 'Three to five relevant hashtags work better than a long list.',
        fa: 'سه تا پنج هشتگ مرتبط بهتر از یک فهرست بلند جواب می‌دهد.',
        tr: 'Üç ila beş ilgili etiket, uzun bir listeden daha iyi işler.',
      },
    ],
  },
  {
    channel: 'linkedin',
    basis: 'general_practice',
    role: {
      en: 'Professional authority: share expertise, lessons and proof with peers, partners and buyers.',
      fa: 'اعتبار حرفه‌ای: تخصص، درس‌آموخته‌ها و شواهد را با همکاران، شرکا و خریداران به اشتراک بگذارید.',
      tr: 'Profesyonel otorite: uzmanlığı, dersleri ve kanıtları meslektaşlar, ortaklar ve alıcılarla paylaşın.',
    },
    formats: ['post', 'carousel', 'article', 'video'],
    cadence: { per: 'week', min: 2, max: 5, start: 3 },
    objective: 'authority',
    mix: mix({ educate: 45, inspire: 15, connect: 25, promote: 15 }),
    kpis: [
      { metric: 'reach', per: 'post' },
      { metric: 'comments', per: 'post' },
      { metric: 'profile_visits', per: 'week' },
      { metric: 'follows', per: 'week' },
      { metric: 'leads', per: 'month' },
    ],
    posting_windows_note: {
      en: "Mornings on your audience's working days, in their time zone, are a common start; adjust after a month of your own analytics.",
      fa: 'صبح روزهای کاری مخاطب (با تقویم کاری و وقت محلی خودش) شروع رایجی است؛ بعد از یک ماه با آمار خودتان تنظیمش کنید.',
      tr: 'Hedef kitlenizin çalışma günlerinde, kendi saat diliminde sabah saatleri yaygın bir başlangıçtır; bir aylık kendi analitiğinizle ayarlayın.',
    },
    craft: [
      {
        en: 'Text posts and document (PDF carousel) posts are the core formats; native video works when a real person is on camera.',
        fa: 'پست متنی و پست سندی (کروسل PDF) قالب‌های اصلی‌اند؛ ویدیوی بومی وقتی جواب می‌دهد که یک آدم واقعی جلوی دوربین باشد.',
        tr: 'Metin gönderileri ve belge (PDF karusel) gönderileri temel formatlardır; yerel video, kamerada gerçek biri olduğunda işe yarar.',
      },
      {
        en: 'The first two lines show before “see more”: put the hook and the promise of the post there.',
        fa: 'دو خط اول قبل از «بیشتر ببینید» دیده می‌شود: قلاب و وعدهٔ پست را همان‌جا بگذارید.',
        tr: 'İlk iki satır “daha fazlasını gör”den önce görünür: kancayı ve gönderinin vaadini oraya koyun.',
      },
      {
        en: 'Keep external links out of the post body; if you need one, put it in the first comment.',
        fa: 'لینک بیرونی را در متن پست نگذارید؛ اگر لازم است، آن را در اولین کامنت بگذارید.',
        tr: 'Dış bağlantıları gönderi metnine koymayın; gerekirse ilk yoruma koyun.',
      },
      {
        en: 'Short paragraphs and white space; one idea per post.',
        fa: 'پاراگراف‌های کوتاه و فاصلهٔ کافی بین خطوط؛ هر پست یک ایده.',
        tr: 'Kısa paragraflar ve boşluk; her gönderide tek fikir.',
      },
      {
        en: 'Reply to comments in the first hour; conversation is what spreads a post.',
        fa: 'در ساعت اول به کامنت‌ها جواب دهید؛ گفت‌وگوست که پست را پخش می‌کند.',
        tr: 'İlk saatte yorumlara yanıt verin; gönderiyi yayan şey sohbettir.',
      },
      {
        en: 'Personal profiles usually reach further than company pages; decide who posts.',
        fa: 'پروفایل‌های شخصی معمولاً از صفحهٔ شرکت بیشتر دیده می‌شوند؛ مشخص کنید چه کسی پست می‌گذارد.',
        tr: 'Kişisel profiller genellikle şirket sayfalarından daha geniş kitleye ulaşır; kimin paylaşacağına karar verin.',
      },
    ],
  },
  {
    channel: 'x',
    basis: 'general_practice',
    role: {
      en: 'Conversation and timely takes: short points, threads and replies in your field.',
      fa: 'گفت‌وگو و واکنش به‌موقع: نکته‌های کوتاه، رشته‌پست و پاسخ‌گویی در حوزهٔ کاری‌تان.',
      tr: "Sohbet ve güncel yorumlar: alanınızda kısa fikirler, flood'lar ve yanıtlar.",
    },
    formats: ['post', 'thread', 'short_video'],
    cadence: { per: 'week', min: 5, max: 21, start: 7 },
    objective: 'engagement',
    mix: mix({ educate: 35, connect: 35, promote: 15, entertain: 15 }),
    kpis: [
      { metric: 'replies', per: 'post' },
      { metric: 'reach', per: 'post' },
      { metric: 'profile_visits', per: 'week' },
      { metric: 'follows', per: 'week' },
    ],
    posting_windows_note: {
      en: 'Posting every day matters more than the hour; check when replies come in and post around that time.',
      fa: 'پست روزانه مهم‌تر از ساعت انتشار است؛ ببینید پاسخ‌ها معمولاً کی می‌آیند و حول همان زمان پست بگذارید.',
      tr: 'Her gün paylaşmak saatten daha önemlidir; yanıtların ne zaman geldiğine bakın ve o saatlerin çevresinde paylaşın.',
    },
    craft: [
      {
        en: 'Lead with the point; the first line has to work on its own in the feed.',
        fa: 'با اصل حرف شروع کنید؛ خط اول باید در فید به‌تنهایی کار کند.',
        tr: 'Asıl fikirle başlayın; ilk satır akışta tek başına işe yaramalı.',
      },
      {
        en: 'Threads: a strong first post that promises the payoff, one idea per post, a recap and next step at the end.',
        fa: 'رشته‌پست: پست اول قوی که نتیجه را وعده می‌دهد، هر پست یک ایده، و در پایان جمع‌بندی و قدم بعدی.',
        tr: "Flood'lar: kazancı vaat eden güçlü bir ilk gönderi, her gönderide tek fikir, sonda özet ve sonraki adım.",
      },
      {
        en: 'Replies to others in your field build reach as much as your own posts.',
        fa: 'پاسخ دادن به دیگران در حوزهٔ کاری‌تان به اندازهٔ پست‌های خودتان دیده‌شدن می‌آورد.',
        tr: 'Alanınızdaki başkalarına verdiğiniz yanıtlar, kendi gönderileriniz kadar erişim kazandırır.',
      },
      {
        en: 'Links in the main post often reach fewer people; test putting them in a reply.',
        fa: 'لینک در پست اصلی معمولاً کمتر دیده می‌شود؛ گذاشتنش در پاسخ را امتحان کنید.',
        tr: 'Ana gönderideki bağlantılar genellikle daha az kişiye ulaşır; yanıtta paylaşmayı deneyin.',
      },
      {
        en: 'One or two hashtags at most, or none.',
        fa: 'حداکثر یکی دو هشتگ، یا هیچ.',
        tr: 'En fazla bir iki etiket ya da hiç.',
      },
    ],
  },
  {
    channel: 'tiktok',
    basis: 'general_practice',
    role: {
      en: 'Reach through entertainment and quick lessons: native, lo-fi short videos that feel made for the feed.',
      fa: 'دیده‌شدن با سرگرمی و آموزش‌های سریع: ویدیوهای کوتاه، خودمانی و بی‌تکلف که حس کنند برای همین فید ساخته شده‌اند.',
      tr: 'Eğlence ve hızlı derslerle erişim: akış için yapılmış gibi hissettiren doğal, sade kısa videolar.',
    },
    formats: ['short_video', 'live'],
    cadence: { per: 'week', min: 3, max: 7, start: 4 },
    objective: 'awareness',
    mix: mix({ educate: 35, inspire: 15, connect: 10, promote: 5, entertain: 35 }),
    kpis: [
      { metric: 'watch_time', per: 'post' },
      { metric: 'completion_rate', per: 'post' },
      { metric: 'shares', per: 'post' },
      { metric: 'follows', per: 'week' },
    ],
    posting_windows_note: {
      en: 'Evenings and weekends are a common start; a steady rhythm matters more than the exact hour.',
      fa: 'عصرها و آخر هفته شروع رایجی است؛ نظم انتشار از ساعت دقیق مهم‌تر است.',
      tr: 'Akşamlar ve hafta sonları yaygın bir başlangıçtır; düzenli bir ritim tam saatten daha önemlidir.',
    },
    craft: [
      {
        en: 'The first 1–2 seconds decide the view: start mid-action or with the payoff, never with an intro.',
        fa: 'یکی دو ثانیهٔ اول تعیین می‌کند ویدیو دیده شود یا نه: از وسط ماجرا یا با نتیجه شروع کنید، هرگز با معرفی.',
        tr: 'İlk 1–2 saniye izlenmeyi belirler: aksiyonun ortasından ya da sonuçla başlayın, asla girişle değil.',
      },
      {
        en: 'Completion drives distribution: cut every pause, keep most videos short, loop the ending into the start where it fits.',
        fa: 'تماشای کامل ویدیو، پخش آن را تعیین می‌کند: هر مکثی را حذف کنید، بیشتر ویدیوها را کوتاه نگه دارید و اگر جا دارد پایان را به شروع وصل کنید.',
        tr: 'Sonuna kadar izlenme dağıtımı belirler: her duraklamayı kesin, çoğu videoyu kısa tutun, uygunsa sonu başa bağlayın.',
      },
      {
        en: 'Native beats polished: talk to the camera, use on-screen text and captions.',
        fa: 'طبیعی بودن از صیقل‌خوردگی بهتر جواب می‌دهد: رو به دوربین حرف بزنید و از متن روی تصویر و زیرنویس استفاده کنید.',
        tr: 'Doğal olan cilalı olandan iyidir: kameraya konuşun, ekran yazısı ve altyazı kullanın.',
      },
      {
        en: "Use trends and sounds only when they fit the brand's voice; never borrow a claim from a trend.",
        fa: 'از ترندها و صداها فقط وقتی استفاده کنید که با لحن برند جور باشند؛ هیچ ادعایی را از یک ترند قرض نگیرید.',
        tr: 'Trendleri ve sesleri yalnızca markanın ses tonuna uyduğunda kullanın; bir trendden asla iddia ödünç almayın.',
      },
      {
        en: 'Answer comments with video replies; they become your next ideas.',
        fa: 'به کامنت‌ها با ویدیو جواب دهید؛ همین‌ها ایده‌های بعدی‌تان می‌شوند.',
        tr: 'Yorumlara video yanıtla karşılık verin; bunlar sonraki fikirleriniz olur.',
      },
    ],
  },
  {
    channel: 'youtube',
    basis: 'general_practice',
    role: {
      en: 'Depth and search: longer videos people find when they look for answers, with Shorts to be discovered.',
      fa: 'عمق و جست‌وجو: ویدیوهای بلندتری که مردم وقتی دنبال جواب می‌گردند پیدا می‌کنند، به‌همراه Shorts برای دیده‌شدن.',
      tr: 'Derinlik ve arama: insanların cevap ararken bulduğu daha uzun videolar ve keşfedilmek için Shorts.',
    },
    formats: ['video', 'short_video', 'live'],
    cadence: { per: 'week', min: 1, max: 3, start: 1 },
    objective: 'authority',
    mix: mix({ educate: 55, inspire: 15, connect: 5, promote: 10, entertain: 15 }),
    kpis: [
      { metric: 'watch_time', per: 'post' },
      { metric: 'completion_rate', per: 'post' },
      { metric: 'subscribers', per: 'month' },
      { metric: 'link_clicks', per: 'month' },
    ],
    posting_windows_note: {
      en: 'Publish on a steady day and time so subscribers learn when to expect you; search traffic depends less on timing.',
      fa: 'در روز و ساعت ثابتی منتشر کنید تا مشترک‌ها بدانند کی منتظر باشند؛ بازدیدی که از جست‌وجو می‌آید کمتر به زمان وابسته است.',
      tr: 'Aboneler ne zaman bekleyeceklerini öğrensin diye sabit bir gün ve saatte yayınlayın; arama trafiği zamanlamaya daha az bağlıdır.',
    },
    craft: [
      {
        en: 'Title and thumbnail are one promise; the first 30 seconds must deliver on it.',
        fa: 'عنوان و تصویر بندانگشتی یک وعده‌اند؛ ۳۰ ثانیهٔ اول باید همان وعده را برآورده کند.',
        tr: 'Başlık ve küçük resim tek bir vaattir; ilk 30 saniye bu vaadi yerine getirmeli.',
      },
      {
        en: 'Write titles around what people search for, in the language they search in.',
        fa: 'عنوان را حول چیزی بنویسید که مردم جست‌وجو می‌کنند، به همان زبانی که جست‌وجو می‌کنند.',
        tr: 'Başlıkları insanların aradığı şeye göre, aradıkları dilde yazın.',
      },
      {
        en: 'Structure long videos in chapters and add chapter markers to the description.',
        fa: 'ویدیوهای بلند را فصل‌بندی کنید و نشانگر فصل‌ها را در توضیحات بگذارید.',
        tr: 'Uzun videoları bölümlere ayırın ve açıklamaya bölüm işaretleri ekleyin.',
      },
      {
        en: 'Shorts bring new viewers; point them to a related long video.',
        fa: 'Shorts بیننده‌های تازه می‌آورد؛ آن‌ها را به یک ویدیوی بلند مرتبط هدایت کنید.',
        tr: 'Shorts yeni izleyiciler getirir; onları ilgili uzun bir videoya yönlendirin.',
      },
      {
        en: 'Add accurate captions; they help viewers and search.',
        fa: 'زیرنویس دقیق اضافه کنید؛ هم به بیننده کمک می‌کند هم به جست‌وجو.',
        tr: 'Doğru altyazı ekleyin; hem izleyicilere hem aramaya yardımcı olur.',
      },
    ],
  },
  {
    channel: 'threads',
    basis: 'general_practice',
    role: {
      en: 'Casual conversation: quick thoughts, questions and replies that show the people behind the brand.',
      fa: 'گفت‌وگوی خودمانی: فکرهای کوتاه، سؤال‌ها و پاسخ‌هایی که آدم‌های پشت برند را نشان می‌دهد.',
      tr: 'Samimi sohbet: markanın arkasındaki insanları gösteren kısa düşünceler, sorular ve yanıtlar.',
    },
    formats: ['post', 'thread'],
    cadence: { per: 'week', min: 3, max: 10, start: 5 },
    objective: 'engagement',
    mix: mix({ educate: 30, connect: 40, promote: 10, entertain: 20 }),
    kpis: [
      { metric: 'replies', per: 'post' },
      { metric: 'reach', per: 'post' },
      { metric: 'follows', per: 'week' },
    ],
    posting_windows_note: {
      en: "Start from your Instagram audience's active hours; the two audiences overlap.",
      fa: 'برای شروع، ساعت‌های فعال مخاطبان اینستاگرامتان را مبنا بگذارید؛ این دو مخاطب هم‌پوشانی دارند.',
      tr: 'Başlangıçta Instagram kitlenizin aktif saatlerini esas alın; iki kitle örtüşür.',
    },
    craft: [
      {
        en: 'Write the way you talk; questions and opinions get replies.',
        fa: 'همان‌طور بنویسید که حرف می‌زنید؛ سؤال و نظر شخصی پاسخ می‌گیرد.',
        tr: 'Konuştuğunuz gibi yazın; sorular ve görüşler yanıt alır.',
      },
      {
        en: 'Reply to every early comment; the replies are the reach.',
        fa: 'به همهٔ کامنت‌های اولیه جواب دهید؛ دیده‌شدن از همین پاسخ‌ها می‌آید.',
        tr: 'Her erken yoruma yanıt verin; erişim bu yanıtlardan gelir.',
      },
      {
        en: 'Keep promotion light; this is not a link channel.',
        fa: 'تبلیغ را سبک نگه دارید؛ این کانالی برای لینک دادن نیست.',
        tr: 'Tanıtımı hafif tutun; burası bir bağlantı kanalı değil.',
      },
      {
        en: 'Reuse a strong caption or carousel idea as a short text post, rewritten for this feed.',
        fa: 'یک کپشن یا ایدهٔ کروسل موفق را به شکل یک پست متنی کوتاه، بازنویسی‌شده برای این فید، دوباره استفاده کنید.',
        tr: 'Güçlü bir açıklamayı ya da karusel fikrini, bu akış için yeniden yazılmış kısa bir metin gönderisi olarak kullanın.',
      },
    ],
  },
  {
    channel: 'telegram',
    basis: 'general_practice',
    role: {
      en: "A direct line to the community: updates, useful posts and announcements that land straight in subscribers' chats.",
      fa: 'خط مستقیم با جامعهٔ مخاطبان: به‌روزرسانی‌ها، پست‌های کاربردی و اطلاعیه‌هایی که مستقیم به صفحهٔ گفت‌وگوی مشترک‌ها می‌رسد.',
      tr: 'Topluluğa doğrudan hat: abonelerin sohbetlerine doğrudan düşen güncellemeler, faydalı gönderiler ve duyurular.',
    },
    formats: ['post', 'video', 'live'],
    cadence: { per: 'week', min: 3, max: 7, start: 4 },
    objective: 'retention',
    mix: mix({ educate: 40, inspire: 15, connect: 25, promote: 20 }),
    kpis: [
      { metric: 'reach', per: 'post' },
      { metric: 'shares', per: 'post' },
      { metric: 'link_clicks', per: 'post' },
      { metric: 'subscribers', per: 'month' },
    ],
    posting_windows_note: {
      en: 'Avoid late-night posts that notify sleeping subscribers; send minor updates silently.',
      fa: 'از پست‌گذاشتن نیمه‌شب پرهیز کنید چون برای مشترک‌های خواب اعلان می‌فرستد؛ به‌روزرسانی‌های جزئی را بی‌صدا بفرستید.',
      tr: 'Uyuyan abonelere bildirim giden gece geç saat gönderilerinden kaçının; küçük güncellemeleri sessiz gönderin.',
    },
    craft: [
      {
        en: 'Every post is a notification: post less and make each one worth it.',
        fa: 'هر پست یک اعلان است: کمتر پست بگذارید و هر کدام را ارزشمند کنید.',
        tr: 'Her gönderi bir bildirimdir: daha az paylaşın ve her birini değerli kılın.',
      },
      {
        en: 'A bold first line as the headline, short paragraphs, one link at most.',
        fa: 'خط اول را پررنگ و مثل تیتر بنویسید؛ پاراگراف‌ها کوتاه و حداکثر یک لینک.',
        tr: 'İlk satır başlık gibi kalın, kısa paragraflar, en fazla bir bağlantı.',
      },
      {
        en: 'Use polls and a linked discussion group to hear from subscribers.',
        fa: 'با نظرسنجی و گروه گفت‌وگوی متصل به کانال، صدای مشترک‌ها را بشنوید.',
        tr: 'Abonelerin sesini duymak için anketleri ve bağlı tartışma grubunu kullanın.',
      },
      {
        en: 'Pin the post new subscribers should read first.',
        fa: 'پستی را که مشترک‌های تازه باید اول بخوانند سنجاق کنید.',
        tr: 'Yeni abonelerin önce okuması gereken gönderiyi sabitleyin.',
      },
    ],
  },
  {
    channel: 'facebook',
    basis: 'general_practice',
    role: {
      en: 'Community and local reach: groups, events and posts for an audience that already knows you.',
      fa: 'جامعه و دسترسی محلی: گروه‌ها، رویدادها و پست‌هایی برای مخاطبی که از قبل شما را می‌شناسد.',
      tr: 'Topluluk ve yerel erişim: sizi zaten tanıyan bir kitle için gruplar, etkinlikler ve gönderiler.',
    },
    formats: ['post', 'video', 'reel', 'live', 'story'],
    cadence: { per: 'week', min: 3, max: 5, start: 3 },
    objective: 'community',
    mix: mix({ educate: 30, connect: 35, promote: 15, entertain: 20 }),
    kpis: [
      { metric: 'reach', per: 'post' },
      { metric: 'comments', per: 'post' },
      { metric: 'shares', per: 'post' },
      { metric: 'link_clicks', per: 'post' },
    ],
    posting_windows_note: {
      en: "Weekday midday and early evening in your audience's time zone are a common start.",
      fa: 'ظهر و اوایل عصرِ روزهای کاری، به وقت محلی مخاطب، شروع رایجی است.',
      tr: 'Hedef kitlenizin saat diliminde hafta içi öğle ve akşamüstü saatleri yaygın bir başlangıçtır.',
    },
    craft: [
      {
        en: 'Questions and local or community stories start conversations.',
        fa: 'سؤال‌ها و روایت‌های محلی یا مربوط به جامعهٔ مخاطبان، گفت‌وگو راه می‌اندازند.',
        tr: 'Sorular ve yerel ya da topluluk hikâyeleri sohbet başlatır.',
      },
      {
        en: 'Reels and native video usually reach further than link posts.',
        fa: 'ریلز و ویدیوی بومی معمولاً از پست‌های لینک‌دار بیشتر دیده می‌شوند.',
        tr: 'Reels ve yerel video genellikle bağlantılı gönderilerden daha fazla kişiye ulaşır.',
      },
      {
        en: 'Lives and events suit launches, Q&As and workshops.',
        fa: 'لایو و رویداد برای معرفی محصول، پرسش و پاسخ و کارگاه مناسب است.',
        tr: 'Canlı yayınlar ve etkinlikler lansmanlar, soru-cevaplar ve atölyeler için uygundur.',
      },
      {
        en: 'Reply to comments and messages quickly; groups grow with an active host.',
        fa: 'به کامنت‌ها و پیام‌ها سریع جواب دهید؛ گروه‌ها با میزبان فعال رشد می‌کنند.',
        tr: 'Yorumlara ve mesajlara hızlı yanıt verin; gruplar aktif bir ev sahibiyle büyür.',
      },
    ],
  },
  {
    channel: 'pinterest',
    basis: 'general_practice',
    role: {
      en: 'Visual search: evergreen pins that people save and that keep sending visitors to your site for months.',
      fa: 'جست‌وجوی تصویری: پین‌های ماندگاری که مردم ذخیره می‌کنند و ماه‌ها بازدیدکننده به سایت شما می‌فرستند.',
      tr: 'Görsel arama: insanların kaydettiği ve aylarca sitenize ziyaretçi göndermeye devam eden kalıcı pinler.',
    },
    formats: ['post', 'short_video'],
    cadence: { per: 'week', min: 5, max: 15, start: 7 },
    objective: 'awareness',
    mix: mix({ educate: 50, inspire: 40, promote: 10 }),
    kpis: [
      { metric: 'saves', per: 'post' },
      { metric: 'link_clicks', per: 'post' },
      { metric: 'reach', per: 'post' },
    ],
    posting_windows_note: {
      en: 'Timing matters little because pins are found through search; publish steadily and plan seasonal topics weeks ahead.',
      fa: 'زمان انتشار اهمیت چندانی ندارد چون پین‌ها از راه جست‌وجو پیدا می‌شوند؛ منظم منتشر کنید و موضوعات فصلی را چند هفته زودتر برنامه‌ریزی کنید.',
      tr: 'Pinler arama yoluyla bulunduğu için zamanlama pek önemli değildir; düzenli yayınlayın ve sezonluk konuları haftalar önceden planlayın.',
    },
    craft: [
      {
        en: 'Vertical images (2:3) with a short text overlay that says what the pin is about.',
        fa: 'تصویر عمودی (۲:۳) با یک متن کوتاه روی تصویر که بگوید پین دربارهٔ چیست.',
        tr: 'Pinin ne hakkında olduğunu söyleyen kısa bir metin katmanıyla dikey görseller (2:3).',
      },
      {
        en: 'Titles and descriptions use the words people search for.',
        fa: 'عنوان و توضیحات را با کلماتی بنویسید که مردم جست‌وجو می‌کنند.',
        tr: 'Başlıklar ve açıklamalar insanların aradığı kelimeleri kullanır.',
      },
      {
        en: 'Every pin links to a relevant page, never a generic home page.',
        fa: 'هر پین به یک صفحهٔ مرتبط لینک می‌دهد، نه به صفحهٔ اصلی کلی سایت.',
        tr: 'Her pin ilgili bir sayfaya bağlanır, asla genel bir ana sayfaya değil.',
      },
      {
        en: 'Organise pins on boards named after topics people search for.',
        fa: 'پین‌ها را در بردهایی مرتب کنید که نامشان همان موضوعاتی است که مردم جست‌وجو می‌کنند.',
        tr: 'Pinleri insanların aradığı konuların adını taşıyan panolarda düzenleyin.',
      },
    ],
  },
  {
    channel: 'newsletter',
    basis: 'general_practice',
    role: {
      en: 'An owned relationship: a regular, useful email to people who asked for it, where offers can be made directly.',
      fa: 'رابطه‌ای که مال خود برند است: ایمیلی منظم و مفید برای کسانی که خودشان خواسته‌اند، جایی که می‌شود پیشنهاد را مستقیم مطرح کرد.',
      tr: 'Markaya ait bir ilişki: isteyen kişilere düzenli, faydalı bir e-posta; teklifler doğrudan burada sunulabilir.',
    },
    formats: ['email'],
    cadence: { per: 'week', min: 1, max: 2, start: 1 },
    objective: 'retention',
    mix: mix({ educate: 50, inspire: 10, connect: 20, promote: 20 }),
    kpis: [
      { metric: 'subscribers', per: 'month' },
      { metric: 'link_clicks', per: 'post' },
      { metric: 'replies', per: 'post' },
    ],
    posting_windows_note: {
      en: 'Send on the same day each week; test morning against evening for your own list.',
      fa: 'هر هفته در یک روز ثابت بفرستید؛ صبح و عصر را برای فهرست مشترک‌های خودتان آزمایش کنید.',
      tr: 'Her hafta aynı gün gönderin; kendi listeniz için sabahı akşamla karşılaştırarak test edin.',
    },
    craft: [
      {
        en: 'The subject line and preview text are the hook; say what the reader gets.',
        fa: 'عنوان ایمیل و متن پیش‌نمایش، قلاب شما هستند؛ بگویید خواننده چه چیزی به دست می‌آورد.',
        tr: 'Konu satırı ve önizleme metni kancadır; okurun ne kazanacağını söyleyin.',
      },
      {
        en: 'One main idea and one main call to action per issue.',
        fa: 'در هر شماره یک ایدهٔ اصلی و یک دعوت به اقدام اصلی.',
        tr: 'Her sayıda tek ana fikir ve tek ana eylem çağrısı.',
      },
      {
        en: 'Write to one person and ask for replies; replies help deliverability and give you ideas.',
        fa: 'طوری بنویسید که انگار برای یک نفر می‌نویسید و از خواننده بخواهید جواب بدهد؛ جواب‌ها هم به رسیدن ایمیل کمک می‌کنند هم ایده می‌دهند.',
        tr: 'Tek bir kişiye yazar gibi yazın ve yanıt isteyin; yanıtlar hem ulaşılabilirliğe yardım eder hem fikir verir.',
      },
      {
        en: 'Keep a consistent format so readers know what to expect.',
        fa: 'قالب ثابتی داشته باشید تا خواننده بداند چه انتظاری داشته باشد.',
        tr: 'Okurların ne bekleyeceğini bilmesi için tutarlı bir format kullanın.',
      },
    ],
  },
  {
    channel: 'blog',
    basis: 'general_practice',
    role: {
      en: "Search and depth: articles that answer your audience's questions and that other channels can link to.",
      fa: 'جست‌وجو و عمق: مقاله‌هایی که به پرسش‌های مخاطب جواب می‌دهند و کانال‌های دیگر می‌توانند به آن‌ها لینک بدهند.',
      tr: 'Arama ve derinlik: hedef kitlenizin sorularını yanıtlayan ve diğer kanalların bağlantı verebileceği makaleler.',
    },
    formats: ['article'],
    cadence: { per: 'month', min: 2, max: 8, start: 4 },
    objective: 'authority',
    mix: mix({ educate: 70, inspire: 10, promote: 20 }),
    kpis: [
      { metric: 'reach', per: 'post' },
      { metric: 'link_clicks', per: 'post' },
      { metric: 'leads', per: 'month' },
    ],
    posting_windows_note: {
      en: 'Timing matters little because search traffic builds over months; publish on a steady rhythm.',
      fa: 'زمان انتشار اهمیت چندانی ندارد چون ترافیک جست‌وجو در طول ماه‌ها شکل می‌گیرد؛ با ریتمی ثابت منتشر کنید.',
      tr: 'Arama trafiği aylar içinde oluştuğu için zamanlama pek önemli değildir; düzenli bir ritimle yayınlayın.',
    },
    craft: [
      {
        en: 'One question per article: answer it early, then explain.',
        fa: 'هر مقاله یک پرسش: جواب را زود بدهید و بعد توضیح دهید.',
        tr: 'Her makalede tek soru: cevabı erken verin, sonra açıklayın.',
      },
      {
        en: 'Headings that read like the questions people ask.',
        fa: 'تیترهایی که شبیه همان پرسش‌هایی باشند که مردم می‌پرسند.',
        tr: 'İnsanların sorduğu sorular gibi okunan ara başlıklar.',
      },
      {
        en: 'Back every claim with an approved fact or a cited source.',
        fa: 'هر ادعا را با یک واقعیت تأییدشده یا منبعی که به آن ارجاع داده‌اید پشتیبانی کنید.',
        tr: 'Her iddiayı onaylı bir bilgiyle ya da atıf yapılan bir kaynakla destekleyin.',
      },
      {
        en: 'Link related articles to each other and turn each article into a few social posts.',
        fa: 'مقاله‌های مرتبط را به هم لینک دهید و هر مقاله را به چند پست شبکهٔ اجتماعی تبدیل کنید.',
        tr: 'İlgili makaleleri birbirine bağlayın ve her makaleyi birkaç sosyal medya gönderisine dönüştürün.',
      },
    ],
  },
]

/** The playbook by channel. Channels without an entry (website, podcast, other) get no suggestion. */
export const CHANNEL_PLAYBOOK: Partial<Record<ContentChannel, ChannelPlaybookEntry>> = Object.fromEntries(ENTRIES.map((entry) => [entry.channel, entry]))

export function playbookFor(channel: ContentChannel): ChannelPlaybookEntry | null {
  return CHANNEL_PLAYBOOK[channel] ?? null
}

export const PLAYBOOK_NOTICE: Record<ContentLang, string[]> = {
  en: [
    'General practice for this kind of channel, not measured for this brand. Every value is a starting point the owner reviews and replaces with what the brand’s own results show.',
    'It is not a brand fact: voice, claims and audience come only from approved facts. KPIs name what to watch; targets are the owner’s.',
    'It authorizes nothing: no post, schedule, publication or spend.',
  ],
  fa: [
    'این‌ها روال رایج برای این نوع کانال است و برای این برند اندازه‌گیری نشده. هر مقدار فقط نقطهٔ شروعی است که مالک بررسی می‌کند و وقتی نتایج خود برند آمد، با آن‌ها جایگزین می‌شود.',
    'این واقعیتِ برند نیست: لحن، ادعاها و مخاطب فقط از واقعیت‌های تأییدشده می‌آیند. شاخص‌ها فقط می‌گویند چه چیزی را زیر نظر بگیرید؛ هدف عددی را مالک تعیین می‌کند.',
    'هیچ مجوزی نمی‌دهد: نه انتشار، نه زمان‌بندی، نه هزینه.',
  ],
  tr: [
    'Bu tür bir kanal için genel uygulamadır; bu marka için ölçülmemiştir. Her değer, sahibin gözden geçirdiği ve markanın kendi sonuçlarıyla değiştirdiği bir başlangıç noktasıdır.',
    'Marka bilgisi değildir: ses tonu, iddialar ve hedef kitle yalnızca onaylı bilgilerden gelir. KPI’lar neyin izleneceğini söyler; hedefler sahibindir.',
    'Hiçbir şeye yetki vermez: gönderi, zamanlama, yayın veya harcama yok.',
  ],
}

export const OBJECTIVE_LABELS: Record<ChannelObjective, Record<ContentLang, string>> = {
  awareness: { en: 'awareness', fa: 'دیده‌شدن', tr: 'bilinirlik' },
  engagement: { en: 'engagement', fa: 'تعامل', tr: 'etkileşim' },
  community: { en: 'community', fa: 'جامعه‌سازی', tr: 'topluluk' },
  leads: { en: 'leads', fa: 'جذب مشتری بالقوه', tr: 'potansiyel müşteri' },
  sales: { en: 'sales', fa: 'فروش', tr: 'satış' },
  authority: { en: 'authority', fa: 'اعتبار و مرجعیت', tr: 'otorite' },
  retention: { en: 'retention', fa: 'حفظ مخاطب', tr: 'elde tutma' },
}

export const MIX_LABELS: Record<ContentMixType, Record<ContentLang, string>> = {
  educate: { en: 'educate', fa: 'آموزش', tr: 'eğitmek' },
  inspire: { en: 'inspire', fa: 'الهام‌بخشی', tr: 'ilham vermek' },
  connect: { en: 'connect', fa: 'ارتباط', tr: 'bağ kurmak' },
  promote: { en: 'promote', fa: 'معرفی و فروش', tr: 'tanıtmak' },
  entertain: { en: 'entertain', fa: 'سرگرمی', tr: 'eğlendirmek' },
}

export const KPI_LABELS: Record<ChannelKpiMetric, Record<ContentLang, string>> = {
  reach: { en: 'reach', fa: 'دسترسی', tr: 'erişim' },
  saves: { en: 'saves', fa: 'ذخیره', tr: 'kaydetme' },
  shares: { en: 'shares', fa: 'اشتراک‌گذاری', tr: 'paylaşım' },
  comments: { en: 'comments', fa: 'کامنت', tr: 'yorum' },
  follows: { en: 'new followers', fa: 'دنبال‌کنندهٔ تازه', tr: 'yeni takipçi' },
  profile_visits: { en: 'profile visits', fa: 'بازدید پروفایل', tr: 'profil ziyareti' },
  link_clicks: { en: 'link clicks', fa: 'کلیک روی لینک', tr: 'bağlantı tıklaması' },
  leads: { en: 'leads', fa: 'سرنخ فروش', tr: 'potansiyel müşteri' },
  watch_time: { en: 'watch time', fa: 'زمان تماشا', tr: 'izlenme süresi' },
  completion_rate: { en: 'completion rate', fa: 'نرخ تماشای کامل', tr: 'tamamlanma oranı' },
  replies: { en: 'replies', fa: 'پاسخ', tr: 'yanıt' },
  subscribers: { en: 'subscribers', fa: 'مشترک', tr: 'abone' },
}

export const PERIOD_LABELS: Record<'post' | 'week' | 'month', Record<ContentLang, string>> = {
  post: { en: 'per post', fa: 'در هر پست', tr: 'gönderi başına' },
  week: { en: 'per week', fa: 'در هفته', tr: 'haftalık' },
  month: { en: 'per month', fa: 'در ماه', tr: 'aylık' },
}

export const PLAYBOOK_TEXT: Record<string, Record<ContentLang, string>> = {
  header: { en: 'Channel playbook (general practice, not measured for this brand)', fa: 'راهنمای کانال‌ها (روال رایج، برای این برند اندازه‌گیری نشده)', tr: 'Kanal rehberi (genel uygulama, bu marka için ölçülmedi)' },
  role: { en: 'Role', fa: 'نقش', tr: 'Rol' },
  formats: { en: 'Formats', fa: 'قالب‌ها', tr: 'Formatlar' },
  cadence: { en: 'Cadence', fa: 'تناوب انتشار', tr: 'Sıklık' },
  cadence_value: { en: '{min}–{max} per {per}, start at {start}', fa: '{min} تا {max} در {per}، شروع با {start}', tr: '{per} başına {min}–{max}, {start} ile başlayın' },
  objective: { en: 'Objective', fa: 'هدف', tr: 'Hedef' },
  mix: { en: 'Mix', fa: 'ترکیب محتوا', tr: 'İçerik karışımı' },
  kpis: { en: 'Watch', fa: 'شاخص‌هایی که باید زیر نظر بگیرید', tr: 'İzlenecekler' },
  windows: { en: 'Posting windows', fa: 'زمان انتشار', tr: 'Paylaşım saatleri' },
  craft: { en: 'Craft notes', fa: 'نکته‌های اجرایی', tr: 'Uygulama notları' },
  week: { en: 'week', fa: 'هفته', tr: 'hafta' },
  month: { en: 'month', fa: 'ماه', tr: 'ay' },
  no_entry: {
    en: 'The playbook has no entry for {channel}. Channels with an entry: {list}.',
    fa: 'راهنما برای {channel} موردی ندارد. کانال‌هایی که مورد دارند: {list}.',
    tr: 'Rehberde {channel} için bir kayıt yok. Kaydı olan kanallar: {list}.',
  },
}

export interface LocalizedPlaybookEntry {
  channel: ContentChannel
  basis: 'general_practice'
  role: string
  formats: ContentFormat[]
  cadence: PlaybookCadence
  objective: { id: ChannelObjective; label: string }
  mix: Array<ChannelMixShare & { label: string }>
  kpis: Array<{ metric: ChannelKpiMetric; per: ChannelKpiPeriod; target: null; label: string }>
  posting_windows_note: string
  craft: string[]
}

export interface PlaybookDocument {
  schema: typeof CONTENT_PLAYBOOK_SCHEMA
  kind: 'content_playbook'
  basis: 'general_practice'
  lang: ContentLang
  entries: LocalizedPlaybookEntry[]
  authorizes: []
  notice: string[]
}

export function localizeEntry(entry: ChannelPlaybookEntry, lang: ContentLang): LocalizedPlaybookEntry {
  return {
    channel: entry.channel,
    basis: entry.basis,
    role: entry.role[lang],
    formats: [...entry.formats],
    cadence: { ...entry.cadence },
    objective: { id: entry.objective, label: OBJECTIVE_LABELS[entry.objective][lang] },
    mix: entry.mix.map((m) => ({ ...m, label: MIX_LABELS[m.type][lang] })),
    kpis: entry.kpis.map((k) => ({ metric: k.metric, per: k.per, target: null, label: `${KPI_LABELS[k.metric][lang]} (${PERIOD_LABELS[k.per][lang]})` })),
    posting_windows_note: entry.posting_windows_note[lang],
    craft: entry.craft.map((note) => note[lang]),
  }
}

/** The playbook for one channel or every channel with an entry, in one language. Pure. */
export function playbookDocument(lang: ContentLang, channel?: ContentChannel): PlaybookDocument {
  let entries = ENTRIES
  if (channel) {
    const entry = playbookFor(channel)
    if (!entry) throw new StrategyError('not_found', PLAYBOOK_TEXT.no_entry![lang].replace('{channel}', channel).replace('{list}', ENTRIES.map((e) => e.channel).join(', ')))
    entries = [entry]
  }
  return { schema: CONTENT_PLAYBOOK_SCHEMA, kind: 'content_playbook', basis: 'general_practice', lang, entries: entries.map((entry) => localizeEntry(entry, lang)), authorizes: [], notice: PLAYBOOK_NOTICE[lang] }
}

/** Self-check used by tests: every entry is well-formed (mix sums to 100, known ids, 3–6 craft notes). */
export function playbookProblems(): string[] {
  const out: string[] = []
  for (const entry of ENTRIES) {
    const total = entry.mix.reduce((sum, m) => sum + m.share, 0)
    if (total !== 100) out.push(`${entry.channel}: mix sums to ${total}`)
    if (!(CHANNEL_OBJECTIVES as readonly string[]).includes(entry.objective)) out.push(`${entry.channel}: objective`)
    for (const k of entry.kpis) if (!(CHANNEL_KPI_METRICS as readonly string[]).includes(k.metric)) out.push(`${entry.channel}: kpi ${k.metric}`)
    if (entry.craft.length < 3 || entry.craft.length > 6) out.push(`${entry.channel}: ${entry.craft.length} craft notes`)
    if (entry.cadence.start < entry.cadence.min || entry.cadence.start > entry.cadence.max) out.push(`${entry.channel}: cadence start`)
    if (entry.kpis.length > 6) out.push(`${entry.channel}: too many kpis`)
  }
  return out
}
