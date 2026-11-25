import { SEMANTIC_COLOR_SLOTS } from '../token-semantic.js'
import {
  DEFAULT_STYLES_PER_SURFACE,
  SURFACES,
  SURFACE_SPECS,
  type ContentType,
  type Layer,
  type LayerRole,
  type Localized,
  type RuleCode,
  type SocialFamily,
  type SocialKit,
  type SocialStyle,
  type SocialSurface,
  type Zone,
} from './model.js'

/**
 * Engine starter archetypes: four sibling styles per surface. Same family (type, palette roles, logo rule, radius,
 * grid); clearly different layer layouts. Every colour and font is a design-token id: the template semantic ids that
 * `brand.color.semantic_map` binds to the owner's own colour roles (token-semantic.ts), so a kit follows the brand's
 * approved tokens without restating a value. Starter styles are always `draft`.
 */

/** Palette roles → template semantic token ids. The ids come from token-semantic.ts, never a literal colour. */
export const STARTER_PALETTE: Record<string, string> = {
  background: SEMANTIC_COLOR_SLOTS.canvas,
  text: SEMANTIC_COLOR_SLOTS.text,
  muted: SEMANTIC_COLOR_SLOTS.muted,
  primary: SEMANTIC_COLOR_SLOTS.primary,
  on_primary: SEMANTIC_COLOR_SLOTS.onPrimary,
  secondary: SEMANTIC_COLOR_SLOTS.secondary,
  on_secondary: SEMANTIC_COLOR_SLOTS.onSecondary,
  accent: SEMANTIC_COLOR_SLOTS.accent,
  dark_canvas: SEMANTIC_COLOR_SLOTS['dark-canvas'],
  dark_text: SEMANTIC_COLOR_SLOTS['dark-text'],
}

const P = STARTER_PALETTE as Record<'background' | 'text' | 'muted' | 'primary' | 'on_primary' | 'secondary' | 'on_secondary' | 'accent' | 'dark_canvas' | 'dark_text', string>
const DISPLAY = 'type.fontFamily.display'
const BODY = 'type.fontFamily.body'

type Ground = 'canvas' | 'primary' | 'secondary' | 'dark'
const INK: Record<Ground, string> = { canvas: P.text, primary: P.on_primary, secondary: P.on_secondary, dark: P.dark_text }

function r(x: number, y: number, w: number, h: number): Zone {
  return { x, y, w, h }
}

/** A layer. Text roles get a font (display for headline/data/quote, body otherwise) and the ink of their ground. */
function L(role: LayerRole, zone: Zone, ground: Ground, opts: { color?: string; words?: number; lines?: number; rules?: RuleCode[]; optional?: true; font?: string } = {}): Layer {
  const textual = ['headline', 'subhead', 'body', 'data', 'quote', 'cta', 'caption_bar', 'handle'].includes(role)
  const layer: Layer = { role, zone }
  if (opts.color) layer.color = opts.color
  else if (role === 'background') layer.color = ground === 'canvas' ? P.background : ground === 'primary' ? P.primary : ground === 'secondary' ? P.secondary : P.dark_canvas
  else if (role === 'overlay') layer.color = P.dark_canvas
  else if (role === 'shape' || role === 'progress') layer.color = P.accent
  else if (textual) layer.color = INK[ground]
  if (textual) layer.font = opts.font ?? (['headline', 'data', 'quote'].includes(role) ? DISPLAY : BODY)
  if (opts.words) layer.max_words = opts.words
  if (opts.lines) layer.max_lines = opts.lines
  if (opts.rules?.length) layer.rules = [...opts.rules]
  if (opts.optional) layer.optional = true
  return layer
}

interface Archetype {
  slug: string
  types: ContentType[]
  name: Required<Localized>
  use: Required<Localized>
  variation: Required<Localized>
  layers: Layer[]
  do: RuleCode[]
  dont: RuleCode[]
}

const t = (en: string, fa: string, tr: string): Required<Localized> => ({ en, fa, tr })

export const STARTER_ARCHETYPES: Record<SocialSurface, Archetype[]> = {
  post: [
    {
      slug: 'bold-statement',
      types: ['inspire', 'educate'],
      name: t('Bold statement', 'جملهٔ پررنگ', 'Güçlü cümle'),
      use: t('One strong opinion or takeaway, no photo needed.', 'یک دیدگاه یا نکتهٔ کلیدی و محکم، بدون نیاز به عکس.', 'Tek bir güçlü görüş ya da çıkarım; fotoğraf gerekmez.'),
      variation: t('Type-led: a full-bleed brand colour and one large headline.', 'متن‌محور: پس‌زمینهٔ تمام‌رنگِ برند و یک تیتر بزرگ.', 'Yazı odaklı: tam kaplayan marka rengi ve tek büyük başlık.'),
      layers: [
        L('background', 'full', 'primary'),
        L('shape', r(6, 14, 12, 1.2), 'primary'),
        L('headline', r(6, 20, 88, 46), 'primary', { words: 10, lines: 4, rules: ['one_message'] }),
        L('subhead', r(6, 70, 70, 10), 'primary', { words: 14, lines: 2 }),
        L('handle', r(6, 90, 50, 4), 'primary', { words: 4, lines: 1 }),
        L('brand_mark', r(76, 88, 18, 6), 'primary', { rules: ['brand_mark_small'] }),
      ],
      do: ['one_message', 'high_contrast', 'readable_at_thumb_size'],
      dont: ['no_dense_paragraphs', 'no_more_than_three_colors'],
    },
    {
      slug: 'photo-headline',
      types: ['behind_the_scenes', 'promote', 'community'],
      name: t('Photo + headline', 'عکس با تیتر', 'Fotoğraf + başlık'),
      use: t('A real moment or product shot that needs one line of context.', 'یک لحظهٔ واقعی یا عکس محصول که فقط یک خط توضیح می‌خواهد.', 'Tek satırlık bağlam isteyen gerçek bir an ya da ürün fotoğrafı.'),
      variation: t('Image-led: full-bleed photo, a darkened lower half carries the text.', 'تصویرمحور: عکس تمام‌صفحه و متن روی نیمهٔ پایینیِ تیره‌شده.', 'Görsel odaklı: tam kaplayan fotoğraf, metin koyulaştırılmış alt yarıda.'),
      layers: [
        L('media', 'full', 'dark', { rules: ['real_people_only_with_rights'] }),
        L('overlay', r(0, 45, 100, 55), 'dark'),
        L('headline', r(6, 62, 88, 20), 'dark', { words: 8, lines: 2 }),
        L('body', r(6, 83, 70, 7), 'dark', { words: 16, lines: 2 }),
        L('brand_mark', r(80, 5, 14, 5), 'dark'),
      ],
      do: ['real_people_only_with_rights', 'keep_in_safe_zone'],
      dont: ['no_stock_cliche', 'no_text_over_face'],
    },
    {
      slug: 'insight-data',
      types: ['educate', 'proof'],
      name: t('Insight / data card', 'کارت داده و بینش', 'İçgörü / veri kartı'),
      use: t('One approved number or finding with its source.', 'یک عدد یا یافتهٔ تأییدشده همراه با منبعش.', 'Kaynağıyla birlikte onaylı tek bir sayı ya da bulgu.'),
      variation: t('Number-led: a large figure on a light canvas, source line below.', 'عددمحور: یک عدد بزرگ روی زمینهٔ روشن و خط منبع در پایین.', 'Sayı odaklı: açık zeminde büyük bir rakam, altında kaynak satırı.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('data', r(6, 16, 60, 28), 'canvas', { color: P.primary, words: 3, lines: 1, rules: ['approved_numbers_only'] }),
        L('shape', r(6, 46, 88, 0.6), 'canvas'),
        L('subhead', r(6, 49, 80, 10), 'canvas', { words: 12, lines: 2 }),
        L('body', r(6, 61, 80, 18), 'canvas', { words: 30, lines: 4 }),
        L('body', r(6, 81, 60, 4), 'canvas', { color: P.muted, words: 12, lines: 1, rules: ['cite_data_source'] }),
        L('brand_mark', r(6, 89, 16, 5), 'canvas'),
      ],
      do: ['approved_numbers_only', 'cite_data_source'],
      dont: ['no_clickbait', 'no_fake_ui'],
    },
    {
      slug: 'quote-testimonial',
      types: ['proof', 'community'],
      name: t('Quote / testimonial', 'نقل‌قول و رضایت مشتری', 'Alıntı / referans'),
      use: t('A customer’s or the founder’s exact words, with permission.', 'عینِ جملهٔ مشتری یا بنیان‌گذار، با اجازهٔ خودش.', 'Bir müşterinin ya da kurucunun izinli, birebir sözleri.'),
      variation: t('Quote-led: a large quote mark, words on the secondary colour, small portrait.', 'نقل‌قول‌محور: علامت نقل‌قول بزرگ، متن روی رنگ دوم برند و تصویر کوچک گوینده.', 'Alıntı odaklı: büyük tırnak işareti, ikincil renk üzerinde sözler, küçük portre.'),
      layers: [
        L('background', 'full', 'secondary'),
        L('shape', r(6, 10, 16, 12), 'secondary'),
        L('quote', r(10, 24, 80, 40), 'secondary', { words: 30, lines: 6, rules: ['quote_verbatim_with_permission'] }),
        L('media', r(10, 70, 14, 11), 'secondary', { optional: true, rules: ['real_people_only_with_rights'] }),
        L('subhead', r(28, 72, 60, 8), 'secondary', { words: 8, lines: 2 }),
        L('brand_mark', r(76, 88, 18, 6), 'secondary'),
      ],
      do: ['quote_verbatim_with_permission', 'real_people_only_with_rights'],
      dont: ['no_dense_paragraphs'],
    },
  ],
  carousel: [
    {
      slug: 'step-by-step',
      types: ['educate'],
      name: t('Step by step', 'گام‌به‌گام', 'Adım adım'),
      use: t('Teach a process in numbered steps, one per slide.', 'آموزش یک فرایند در چند گام شماره‌دار؛ هر اسلاید یک گام.', 'Bir süreci numaralı adımlarla öğretin; her slaytta bir adım.'),
      variation: t('A big step number in the top corner, a progress bar on top, light canvas.', 'شمارهٔ گام بزرگ در گوشهٔ بالا، نوار پیشرفت در بالا و زمینهٔ روشن.', 'Üst köşede büyük adım numarası, üstte ilerleme çubuğu, açık zemin.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('progress', r(6, 4, 88, 1.5), 'canvas', { rules: ['progress_visible'] }),
        L('data', r(6, 10, 24, 18), 'canvas', { color: P.primary, words: 1, lines: 1 }),
        L('headline', r(6, 32, 88, 20), 'canvas', { words: 9, lines: 3 }),
        L('body', r(6, 55, 88, 28), 'canvas', { words: 35, lines: 5 }),
        L('handle', r(6, 90, 50, 4), 'canvas', { words: 4, lines: 1 }),
      ],
      do: ['hook_on_first_slide', 'consistent_slide_numbering', 'cta_on_last_slide'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'myth-vs-fact',
      types: ['educate', 'proof'],
      name: t('Myth vs fact', 'باور غلط در برابر واقعیت', 'Efsane ve gerçek'),
      use: t('Correct a common misconception in your field.', 'اصلاح یک باور غلطِ رایج در حوزهٔ کاری‌تان.', 'Alanınızdaki yaygın bir yanlış inancı düzeltin.'),
      variation: t('Split panels: the myth on the top panel, the fact on the brand colour below.', 'دو پنل: باور غلط در پنل بالا و واقعیت روی رنگ برند در پایین.', 'İki panel: üstte efsane, altta marka renginde gerçek.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('shape', r(0, 0, 100, 48), 'canvas', { color: P.secondary }),
        L('headline', r(6, 12, 88, 28), 'secondary', { words: 12, lines: 3 }),
        L('shape', r(0, 52, 100, 48), 'canvas', { color: P.primary }),
        L('subhead', r(6, 60, 88, 26), 'primary', { words: 20, lines: 4, rules: ['approved_numbers_only'] }),
        L('brand_mark', r(80, 91, 14, 4), 'primary'),
      ],
      do: ['one_message', 'approved_numbers_only'],
      dont: ['no_clickbait'],
    },
    {
      slug: 'story-arc',
      types: ['behind_the_scenes', 'personal', 'proof'],
      name: t('Story arc', 'روایت داستانی', 'Hikâye akışı'),
      use: t('A short before–during–after story told in photos.', 'یک داستان کوتاه از قبل، حین و بعد، با عکس.', 'Fotoğraflarla anlatılan kısa bir önce–sırasında–sonra hikâyesi.'),
      variation: t('Photo-led slides with a low caption band and a thin progress line.', 'اسلایدهای عکس‌محور با نوار متن پایین و خط پیشرفت باریک.', 'Alçak bir altyazı bandı ve ince ilerleme çizgisiyle fotoğraf odaklı slaytlar.'),
      layers: [
        L('media', 'full', 'dark', { rules: ['real_people_only_with_rights'] }),
        L('overlay', r(0, 70, 100, 30), 'dark'),
        L('handle', r(6, 5, 50, 4), 'dark', { words: 4, lines: 1 }),
        L('body', r(6, 74, 88, 16), 'dark', { words: 25, lines: 3 }),
        L('progress', r(6, 94, 88, 1), 'dark'),
      ],
      do: ['hook_on_first_slide', 'real_people_only_with_rights'],
      dont: ['no_stock_cliche', 'no_text_over_face'],
    },
    {
      slug: 'checklist',
      types: ['educate', 'community'],
      name: t('Checklist', 'چک‌لیست', 'Kontrol listesi'),
      use: t('A save-worthy list the audience can tick off.', 'فهرستی ارزشِ ذخیره‌کردن که مخاطب بتواند تیک بزند.', 'Kitlenin kaydedip işaretleyebileceği bir liste.'),
      variation: t('Brand-colour slides, a checkbox column beside short items, a CTA at the end.', 'اسلایدهای رنگ برند، ستون تیک کنار موارد کوتاه و دعوت به اقدام در پایان.', 'Marka renginde slaytlar, kısa maddelerin yanında onay kutusu sütunu, sonda CTA.'),
      layers: [
        L('background', 'full', 'primary'),
        L('headline', r(6, 8, 88, 14), 'primary', { words: 8, lines: 2 }),
        L('shape', r(6, 26, 8, 60), 'primary'),
        L('body', r(18, 26, 76, 60), 'primary', { words: 40, lines: 6 }),
        L('cta', r(6, 89, 50, 6), 'primary', { words: 5, lines: 1, rules: ['one_cta'] }),
      ],
      do: ['cta_on_last_slide', 'one_cta'],
      dont: ['no_dense_paragraphs'],
    },
  ],
  story: [
    {
      slug: 'question-poll',
      types: ['community'],
      name: t('Question / poll', 'سؤال و نظرسنجی', 'Soru / anket'),
      use: t('Ask the audience something and leave room for the poll sticker.', 'از مخاطب چیزی بپرسید و برای استیکر نظرسنجی جا بگذارید.', 'Kitleye bir şey sorun ve anket çıkartmasına yer bırakın.'),
      variation: t('The question on top, an empty sticker zone in the middle, secondary colour.', 'سؤال در بالا، جای خالی استیکر در وسط، رنگ دوم برند.', 'Üstte soru, ortada boş çıkartma alanı, ikincil renk.'),
      layers: [
        L('background', 'full', 'secondary'),
        L('headline', r(8, 18, 84, 20), 'secondary', { words: 12, lines: 3, rules: ['question_open_ended'] }),
        L('shape', r(12, 44, 76, 18), 'secondary', { color: P.background, rules: ['link_sticker_space'] }),
        L('body', r(8, 66, 84, 8), 'secondary', { words: 14, lines: 2 }),
        L('handle', r(8, 76, 50, 3), 'secondary', { words: 4, lines: 1 }),
      ],
      do: ['question_open_ended', 'keep_in_safe_zone'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'behind-the-scenes',
      types: ['behind_the_scenes', 'personal'],
      name: t('Behind the scenes', 'پشت صحنه', 'Kamera arkası'),
      use: t('A casual, real moment from work, lightly branded.', 'یک لحظهٔ واقعی و خودمانی از کار، با کمترین نشانهٔ برند.', 'İşten samimi, gerçek bir an; hafif markalı.'),
      variation: t('Full-bleed photo or video, one short line in a top band.', 'عکس یا ویدیوی تمام‌صفحه و یک جملهٔ کوتاه در نوار بالا.', 'Tam ekran fotoğraf ya da video, üst bantta tek kısa satır.'),
      layers: [
        L('media', 'full', 'dark', { rules: ['real_people_only_with_rights'] }),
        L('overlay', r(0, 13, 100, 14), 'dark'),
        L('subhead', r(6, 15, 88, 9), 'dark', { words: 8, lines: 2 }),
        L('brand_mark', r(6, 76, 14, 4), 'dark', { rules: ['brand_mark_small'] }),
      ],
      do: ['keep_in_safe_zone', 'brand_mark_small'],
      dont: ['no_stock_cliche'],
    },
    {
      slug: 'quick-tip',
      types: ['educate'],
      name: t('Quick tip', 'نکتهٔ سریع', 'Hızlı ipucu'),
      use: t('One practical tip people can use today.', 'یک نکتهٔ کاربردی که همین امروز بشود به کار برد.', 'Bugün uygulanabilecek tek bir pratik ipucu.'),
      variation: t('Light canvas, a tip number, headline and short body; room for the mascot.', 'زمینهٔ روشن، شمارهٔ نکته، تیتر و متن کوتاه؛ با جا برای کاراکتر برند.', 'Açık zemin, ipucu numarası, başlık ve kısa metin; maskot için yer.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('data', r(8, 16, 30, 10), 'canvas', { color: P.primary, words: 2, lines: 1 }),
        L('headline', r(8, 28, 84, 18), 'canvas', { words: 9, lines: 3 }),
        L('body', r(8, 48, 84, 16), 'canvas', { words: 25, lines: 4 }),
        L('mascot', r(60, 64, 32, 14), 'canvas', { optional: true, rules: ['mascot_approved_pose_only'] }),
        L('brand_mark', r(8, 76, 14, 4), 'canvas'),
      ],
      do: ['one_message', 'mascot_approved_pose_only'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'link-cta',
      types: ['promote', 'announce'],
      name: t('Link / call to action', 'لینک و دعوت به اقدام', 'Bağlantı / harekete geçirici'),
      use: t('Send people to one approved link.', 'فرستادن مخاطب به یک لینکِ تأییدشده.', 'Kitleyi onaylı tek bir bağlantıya yönlendirin.'),
      variation: t('Brand colour, a preview image on top, space for the link sticker below the headline.', 'رنگ برند، تصویر پیش‌نمایش در بالا و جای استیکر لینک زیر تیتر.', 'Marka rengi, üstte önizleme görseli, başlığın altında bağlantı çıkartması için yer.'),
      layers: [
        L('background', 'full', 'primary'),
        L('media', r(10, 16, 80, 34), 'primary', { optional: true }),
        L('headline', r(8, 52, 84, 12), 'primary', { words: 8, lines: 2 }),
        L('cta', r(20, 66, 60, 8), 'primary', { words: 4, lines: 1, rules: ['one_cta', 'link_sticker_space'] }),
        L('handle', r(8, 77, 50, 3), 'primary', { words: 4, lines: 1 }),
      ],
      do: ['one_cta', 'link_sticker_space'],
      dont: ['no_clickbait'],
    },
  ],
  reel: [
    {
      slug: 'talking-head-captions',
      types: ['educate', 'personal', 'inspire'],
      name: t('Talking head + captions', 'صحبت رو به دوربین با زیرنویس', 'Konuşan kişi + altyazı'),
      use: t('You speak to camera; captions carry the message with the sound off.', 'رو به دوربین صحبت می‌کنید و زیرنویس پیام را حتی بی‌صدا می‌رساند.', 'Kameraya konuşursunuz; altyazı mesajı ses kapalıyken de taşır.'),
      variation: t('Face full frame, a hook line on top for two seconds, captions in the lower third.', 'چهره در کل کادر، جملهٔ قلاب در بالا برای دو ثانیه، زیرنویس در یک‌سوم پایین.', 'Yüz tam kadraj, ilk iki saniye üstte kanca cümlesi, alt üçte birde altyazı.'),
      layers: [
        L('media', 'full', 'dark', { rules: ['real_people_only_with_rights'] }),
        L('headline', r(6, 15, 80, 10), 'dark', { words: 7, lines: 2 }),
        L('caption_bar', r(6, 62, 80, 12), 'dark', { words: 6, lines: 2, rules: ['captions_always_on'] }),
        L('brand_mark', r(6, 76, 12, 3), 'dark', { rules: ['brand_mark_small'] }),
      ],
      do: ['captions_always_on', 'keep_in_safe_zone'],
      dont: ['no_text_over_face'],
    },
    {
      slug: 'broll-voiceover',
      types: ['behind_the_scenes', 'promote'],
      name: t('B-roll + voiceover', 'تصاویر مکمل با صدای روی تصویر', 'B-roll + dış ses'),
      use: t('Show the work or product while a voice explains.', 'نمایش کار یا محصول در حالی که صدایی توضیح می‌دهد.', 'Bir ses anlatırken işi ya da ürünü gösterin.'),
      variation: t('Footage full frame, a mid-screen band with the key line, small captions.', 'فیلم در کل کادر، نواری در میانهٔ صفحه با جملهٔ اصلی و زیرنویس کوچک.', 'Tam kadraj görüntü, ortada ana cümleyi taşıyan bir bant, küçük altyazı.'),
      layers: [
        L('media', 'full', 'dark'),
        L('overlay', r(0, 40, 100, 20), 'dark'),
        L('headline', r(6, 42, 80, 16), 'dark', { words: 8, lines: 2 }),
        L('caption_bar', r(6, 70, 80, 8), 'dark', { words: 6, lines: 2, rules: ['captions_always_on'] }),
      ],
      do: ['captions_always_on', 'one_message'],
      dont: ['no_stock_cliche'],
    },
    {
      slug: 'list-on-screen',
      types: ['educate'],
      name: t('List on screen', 'فهرست روی صفحه', 'Ekranda liste'),
      use: t('Numbered points that appear one by one.', 'نکته‌های شماره‌دار که یکی‌یکی ظاهر می‌شوند.', 'Tek tek beliren numaralı maddeler.'),
      variation: t('Dark canvas, a counter on top, the list builds in the middle, a progress line.', 'زمینهٔ تیره، شمارنده در بالا، فهرستی که در وسط کامل می‌شود و خط پیشرفت.', 'Koyu zemin, üstte sayaç, ortada büyüyen liste, ilerleme çizgisi.'),
      layers: [
        L('background', 'full', 'dark'),
        L('data', r(6, 14, 20, 8), 'dark', { color: P.accent, words: 1, lines: 1 }),
        L('headline', r(6, 24, 80, 14), 'dark', { words: 8, lines: 2 }),
        L('body', r(6, 40, 80, 32), 'dark', { words: 30, lines: 5 }),
        L('progress', r(6, 78, 80, 1), 'dark', { rules: ['progress_visible'] }),
      ],
      do: ['progress_visible', 'keep_in_safe_zone'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'before-after',
      types: ['proof', 'educate'],
      name: t('Before / after', 'قبل و بعد', 'Önce / sonra'),
      use: t('Show a change with the same framing twice.', 'نشان‌دادن یک تغییر با دو کادرِ یکسان.', 'Bir değişimi aynı kadrajla iki kez gösterin.'),
      variation: t('The screen split top and bottom with labels, one caption line.', 'صفحهٔ دوبخشی بالا و پایین با برچسب و یک خط زیرنویس.', 'Etiketli üst ve alt bölünmüş ekran, tek altyazı satırı.'),
      layers: [
        L('media', r(0, 0, 100, 50), 'dark', { rules: ['before_after_same_framing'] }),
        L('media', r(0, 50, 100, 50), 'dark'),
        L('shape', r(0, 49.5, 100, 1), 'dark'),
        L('subhead', r(6, 15, 40, 5), 'dark', { words: 2, lines: 1 }),
        L('subhead', r(6, 53, 40, 5), 'dark', { words: 2, lines: 1 }),
        L('caption_bar', r(6, 72, 80, 7), 'dark', { words: 6, lines: 2, rules: ['captions_always_on'] }),
      ],
      do: ['before_after_same_framing', 'approved_numbers_only'],
      dont: ['no_clickbait', 'no_fake_ui'],
    },
  ],
  reel_cover: [
    {
      slug: 'big-title',
      types: ['educate', 'inspire'],
      name: t('Big title', 'تیتر درشت', 'Büyük başlık'),
      use: t('A clean cover that reads in the profile grid.', 'کاوری ساده که در شبکهٔ پروفایل خوانا بماند.', 'Profil ızgarasında okunan sade bir kapak.'),
      variation: t('Brand colour, up to five words inside the 1:1 crop.', 'رنگ برند و حداکثر پنج کلمه داخل برش ۱:۱.', 'Marka rengi, 1:1 kırpmanın içinde en fazla beş kelime.'),
      layers: [
        L('background', 'full', 'primary'),
        L('headline', r(8, 30, 84, 30), 'primary', { words: 5, lines: 3, rules: ['readable_at_thumb_size'] }),
        L('shape', r(8, 62, 20, 1), 'primary'),
        L('brand_mark', r(8, 68, 14, 4), 'primary'),
      ],
      do: ['readable_at_thumb_size', 'keep_in_safe_zone'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'face-title',
      types: ['personal', 'educate'],
      name: t('Face + title', 'چهره با تیتر', 'Yüz + başlık'),
      use: t('Covers for talking-head reels.', 'کاور ریلزهایی که در آن رو به دوربین صحبت می‌کنید.', 'Kameraya konuşulan reels videoları için kapak.'),
      variation: t('A frame from the video, the title on a darkened band inside the crop.', 'فریمی از خود ویدیو و تیتر روی نواری تیره داخل برش.', 'Videodan bir kare, kırpmanın içinde koyulaştırılmış bantta başlık.'),
      layers: [
        L('media', 'full', 'dark', { rules: ['real_people_only_with_rights'] }),
        L('overlay', r(0, 50, 100, 28), 'dark'),
        L('headline', r(8, 54, 84, 20), 'dark', { words: 5, lines: 2 }),
      ],
      do: ['readable_at_thumb_size', 'real_people_only_with_rights'],
      dont: ['no_text_over_face'],
    },
    {
      slug: 'series-number',
      types: ['educate', 'community'],
      name: t('Series number', 'شمارهٔ قسمت', 'Seri numarası'),
      use: t('Recurring series whose episodes should line up in the grid.', 'مجموعه‌های تکرارشونده که قسمت‌هایشان باید در شبکه کنار هم بنشینند.', 'Bölümleri ızgarada sıralanması gereken düzenli seriler.'),
      variation: t('Light canvas, a large episode number, the series name and the title.', 'زمینهٔ روشن، شمارهٔ قسمت بزرگ، نام مجموعه و تیتر.', 'Açık zemin, büyük bölüm numarası, seri adı ve başlık.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('data', r(8, 25, 40, 22), 'canvas', { color: P.primary, words: 1, lines: 1 }),
        L('subhead', r(8, 48, 84, 6), 'canvas', { color: P.muted, words: 4, lines: 1 }),
        L('headline', r(8, 56, 84, 16), 'canvas', { words: 6, lines: 2 }),
      ],
      do: ['consistent_slide_numbering', 'readable_at_thumb_size'],
      dont: ['no_more_than_three_colors'],
    },
    {
      slug: 'mascot-hook',
      types: ['entertain', 'educate'],
      name: t('Mascot hook', 'کاراکتر برند و قلاب', 'Maskot kancası'),
      use: t('Covers where an approved mascot pose fits the topic.', 'کاورهایی که یک ژستِ تأییدشدهٔ کاراکتر با موضوع جور است.', 'Onaylı bir maskot pozunun konuya uyduğu kapaklar.'),
      variation: t('Secondary colour, the mascot on one side, the title on the other.', 'رنگ دوم برند، کاراکتر در یک سو و تیتر در سوی دیگر.', 'İkincil renk, bir yanda maskot, diğer yanda başlık.'),
      layers: [
        L('background', 'full', 'secondary'),
        L('mascot', r(45, 28, 47, 44), 'secondary', { rules: ['mascot_approved_pose_only'] }),
        L('headline', r(8, 30, 40, 36), 'secondary', { words: 5, lines: 4 }),
        L('brand_mark', r(8, 70, 14, 4), 'secondary'),
      ],
      do: ['mascot_approved_pose_only', 'readable_at_thumb_size'],
      dont: ['no_more_than_three_colors'],
    },
  ],
  thumbnail: [
    {
      slug: 'face-text',
      types: ['personal', 'educate'],
      name: t('Face + text', 'چهره و متن', 'Yüz + metin'),
      use: t('Videos led by a person.', 'ویدیوهایی که محورشان یک آدم است.', 'Bir kişinin öne çıktığı videolar.'),
      variation: t('Brand colour, the face on one half, up to four words on the other.', 'رنگ برند، چهره در یک نیمه و حداکثر چهار کلمه در نیمهٔ دیگر.', 'Marka rengi, bir yarıda yüz, diğer yarıda en fazla dört kelime.'),
      layers: [
        L('background', 'full', 'primary'),
        L('media', r(45, 0, 55, 100), 'primary', { rules: ['real_people_only_with_rights'] }),
        L('headline', r(5, 15, 42, 55), 'primary', { words: 4, lines: 3, rules: ['readable_at_thumb_size'] }),
        L('shape', r(5, 74, 20, 3), 'primary'),
      ],
      do: ['face_left_text_right', 'readable_at_thumb_size'],
      dont: ['no_clickbait'],
    },
    {
      slug: 'big-number',
      types: ['educate', 'proof'],
      name: t('Big number', 'عدد بزرگ', 'Büyük sayı'),
      use: t('Videos built around one approved figure or a count.', 'ویدیوهایی که حول یک عدد تأییدشده یا یک شمارش ساخته شده‌اند.', 'Onaylı tek bir rakam ya da sayım etrafında kurulan videolar.'),
      variation: t('Light canvas, a huge number on one side, a short line beside it.', 'زمینهٔ روشن، عددی خیلی بزرگ در یک سو و جمله‌ای کوتاه کنارش.', 'Açık zemin, bir yanda çok büyük bir sayı, yanında kısa satır.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('data', r(5, 12, 45, 60), 'canvas', { color: P.primary, words: 1, lines: 1, rules: ['approved_numbers_only'] }),
        L('subhead', r(52, 30, 42, 30), 'canvas', { words: 5, lines: 3 }),
        L('brand_mark', r(5, 80, 12, 10), 'canvas'),
      ],
      do: ['approved_numbers_only', 'readable_at_thumb_size'],
      dont: ['no_clickbait'],
    },
    {
      slug: 'split-compare',
      types: ['educate', 'proof'],
      name: t('Split compare', 'مقایسهٔ دوتایی', 'İkili karşılaştırma'),
      use: t('Comparisons, versus and before/after videos.', 'ویدیوهای مقایسه، این یا آن، و قبل و بعد.', 'Karşılaştırma, kıyas ve önce/sonra videoları.'),
      variation: t('Two images side by side, a divider, a title band at the bottom.', 'دو تصویر کنار هم، یک خط جداکننده و نوار تیتر در پایین.', 'Yan yana iki görsel, bir ayırıcı, altta başlık bandı.'),
      layers: [
        L('media', r(0, 0, 50, 100), 'dark'),
        L('media', r(50, 0, 50, 100), 'dark'),
        L('shape', r(49, 0, 2, 100), 'dark'),
        L('headline', r(20, 70, 60, 22), 'dark', { words: 4, lines: 1 }),
      ],
      do: ['before_after_same_framing', 'readable_at_thumb_size'],
      dont: ['no_fake_ui'],
    },
    {
      slug: 'object-closeup',
      types: ['promote', 'behind_the_scenes'],
      name: t('Object close-up', 'نمای نزدیک از شیء', 'Nesne yakın çekim'),
      use: t('Product, tool or process videos without a face.', 'ویدیوهای محصول، ابزار یا فرایند بدون چهره.', 'Yüz olmadan ürün, araç ya da süreç videoları.'),
      variation: t('A full-bleed close-up; a dark overlay on one side holds the title.', 'نمای نزدیکِ تمام‌صفحه و پوشش تیره در یک سو که تیتر را نگه می‌دارد.', 'Tam kaplayan yakın çekim; bir yandaki koyu katman başlığı taşır.'),
      layers: [
        L('media', 'full', 'dark'),
        L('overlay', r(0, 0, 55, 100), 'dark'),
        L('headline', r(5, 20, 45, 45), 'dark', { words: 4, lines: 3 }),
        L('brand_mark', r(5, 78, 12, 12), 'dark'),
      ],
      do: ['readable_at_thumb_size', 'high_contrast'],
      dont: ['no_stock_cliche'],
    },
  ],
  linkedin_post: [
    {
      slug: 'insight-card',
      types: ['educate', 'inspire'],
      name: t('Insight card', 'کارت بینش', 'İçgörü kartı'),
      use: t('A professional lesson or point of view in a few lines.', 'یک درس یا دیدگاه حرفه‌ای در چند خط.', 'Birkaç satırda profesyonel bir ders ya da bakış açısı.'),
      variation: t('Light canvas, a vertical rule, headline and body, a name line at the bottom.', 'زمینهٔ روشن، خط عمودی، تیتر و متن و خط نام در پایین.', 'Açık zemin, dikey çizgi, başlık ve metin, altta isim satırı.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('shape', r(3, 12, 1, 64), 'canvas'),
        L('headline', r(7, 12, 86, 30), 'canvas', { words: 14, lines: 4 }),
        L('body', r(7, 46, 86, 30), 'canvas', { words: 45, lines: 6 }),
        L('handle', r(7, 84, 60, 6), 'canvas', { words: 8, lines: 2 }),
        L('brand_mark', r(80, 86, 13, 5), 'canvas'),
      ],
      do: ['one_message', 'left_align_ltr_right_align_rtl'],
      dont: ['no_clickbait'],
    },
    {
      slug: 'framework-diagram',
      types: ['educate'],
      name: t('Framework diagram', 'نمودار چارچوب', 'Çerçeve diyagramı'),
      use: t('Explain a model, matrix or process visually.', 'توضیح یک مدل، ماتریس یا فرایند به‌صورت تصویری.', 'Bir modeli, matrisi ya da süreci görsel olarak anlatın.'),
      variation: t('A short title, a large diagram area, labels below.', 'تیتر کوتاه، فضای بزرگ برای نمودار و برچسب‌ها در پایین.', 'Kısa başlık, geniş diyagram alanı, altta etiketler.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('headline', r(7, 6, 86, 12), 'canvas', { words: 8, lines: 2 }),
        L('shape', r(7, 22, 86, 56), 'canvas', { color: P.muted }),
        L('body', r(7, 80, 86, 8), 'canvas', { words: 16, lines: 2 }),
        L('brand_mark', r(80, 91, 13, 5), 'canvas'),
      ],
      do: ['max_two_type_sizes', 'no_more_than_three_colors'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'portrait-quote',
      types: ['personal', 'proof'],
      name: t('Portrait + quote', 'پرتره و نقل‌قول', 'Portre + alıntı'),
      use: t('A person’s own words, with an approved portrait.', 'جملهٔ خودِ یک نفر، همراه با پرترهٔ تأییدشده.', 'Onaylı bir portreyle, kişinin kendi sözleri.'),
      variation: t('Brand colour, a small portrait on top, a large quote, the name below.', 'رنگ برند، پرترهٔ کوچک در بالا، نقل‌قول بزرگ و نام در پایین.', 'Marka rengi, üstte küçük portre, büyük alıntı, altta isim.'),
      layers: [
        L('background', 'full', 'primary'),
        L('media', r(7, 8, 30, 30), 'primary', { rules: ['real_people_only_with_rights'] }),
        L('quote', r(7, 42, 86, 36), 'primary', { words: 35, lines: 6, rules: ['quote_verbatim_with_permission'] }),
        L('subhead', r(7, 82, 60, 6), 'primary', { words: 8, lines: 2 }),
      ],
      do: ['quote_verbatim_with_permission', 'real_people_only_with_rights'],
      dont: ['no_text_over_face'],
    },
    {
      slug: 'announcement',
      types: ['announce', 'promote'],
      name: t('Announcement', 'اطلاعیه', 'Duyuru'),
      use: t('News: an approved launch, event, hire or milestone.', 'خبر: یک عرضه، رویداد، جذب نیرو یا دستاوردِ تأییدشده.', 'Haber: onaylı bir lansman, etkinlik, işe alım ya da kilometre taşı.'),
      variation: t('Secondary colour, a date label, a big headline, an optional image, one CTA.', 'رنگ دوم برند، برچسب تاریخ، تیتر بزرگ، تصویر اختیاری و یک دعوت به اقدام.', 'İkincil renk, tarih etiketi, büyük başlık, isteğe bağlı görsel, tek CTA.'),
      layers: [
        L('background', 'full', 'secondary'),
        L('data', r(7, 10, 50, 8), 'secondary', { color: P.accent, words: 4, lines: 1 }),
        L('headline', r(7, 22, 86, 34), 'secondary', { words: 12, lines: 4 }),
        L('media', r(7, 60, 86, 24), 'secondary', { optional: true }),
        L('cta', r(7, 88, 40, 6), 'secondary', { words: 4, lines: 1, rules: ['one_cta'] }),
      ],
      do: ['one_cta', 'one_message'],
      dont: ['no_clickbait'],
    },
  ],
  linkedin_document: [
    {
      slug: 'cover-chapter',
      types: ['educate', 'announce'],
      name: t('Cover / chapter', 'جلد و فصل', 'Kapak / bölüm'),
      use: t('The first slide and the chapter breaks of a document.', 'اسلاید اول و جداکنندهٔ فصل‌های یک سند.', 'Bir belgenin ilk slaytı ve bölüm araları.'),
      variation: t('Brand colour, a large title in the middle, a subtitle and the name.', 'رنگ برند، عنوان بزرگ در میانه، زیرعنوان و نام.', 'Marka rengi, ortada büyük başlık, alt başlık ve isim.'),
      layers: [
        L('background', 'full', 'primary'),
        L('headline', r(7, 30, 86, 30), 'primary', { words: 10, lines: 3 }),
        L('subhead', r(7, 62, 70, 8), 'primary', { words: 12, lines: 2 }),
        L('handle', r(7, 86, 60, 5), 'primary', { words: 6, lines: 1 }),
      ],
      do: ['hook_on_first_slide', 'one_message'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'one-idea-per-slide',
      types: ['educate'],
      name: t('One idea per slide', 'هر اسلاید یک ایده', 'Her slaytta bir fikir'),
      use: t('The body of an explainer document.', 'بدنهٔ اصلی یک سند آموزشی.', 'Açıklayıcı bir belgenin gövdesi.'),
      variation: t('Light canvas, a slide number, headline, short body, a progress line.', 'زمینهٔ روشن، شمارهٔ اسلاید، تیتر، متن کوتاه و خط پیشرفت.', 'Açık zemin, slayt numarası, başlık, kısa metin, ilerleme çizgisi.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('data', r(7, 6, 12, 5), 'canvas', { color: P.muted, words: 1, lines: 1 }),
        L('headline', r(7, 16, 86, 22), 'canvas', { words: 10, lines: 3 }),
        L('body', r(7, 42, 86, 36), 'canvas', { words: 45, lines: 6 }),
        L('progress', r(7, 90, 86, 1), 'canvas', { rules: ['progress_visible'] }),
      ],
      do: ['consistent_slide_numbering', 'one_message'],
      dont: ['no_dense_paragraphs'],
    },
    {
      slug: 'chart-slide',
      types: ['proof', 'educate'],
      name: t('Chart slide', 'اسلاید نمودار', 'Grafik slaytı'),
      use: t('Approved data shown as a chart, with the source.', 'داده‌های تأییدشده به شکل نمودار، همراه با منبع.', 'Kaynağıyla birlikte grafik olarak gösterilen onaylı veriler.'),
      variation: t('A short title, a large chart area, a source line.', 'تیتر کوتاه، فضای بزرگ نمودار و خط منبع.', 'Kısa başlık, geniş grafik alanı, kaynak satırı.'),
      layers: [
        L('background', 'full', 'canvas'),
        L('headline', r(7, 6, 86, 12), 'canvas', { words: 9, lines: 2 }),
        L('data', r(7, 22, 86, 52), 'canvas', { color: P.primary, rules: ['approved_numbers_only'] }),
        L('body', r(7, 78, 86, 6), 'canvas', { color: P.muted, words: 14, lines: 1, rules: ['cite_data_source'] }),
        L('brand_mark', r(80, 90, 13, 5), 'canvas'),
      ],
      do: ['approved_numbers_only', 'cite_data_source'],
      dont: ['no_fake_ui'],
    },
    {
      slug: 'summary-cta',
      types: ['educate', 'promote'],
      name: t('Summary + CTA', 'جمع‌بندی و دعوت به اقدام', 'Özet + CTA'),
      use: t('The last slide: key points and one next step.', 'اسلاید آخر: نکته‌های اصلی و یک قدم بعدی.', 'Son slayt: ana noktalar ve tek bir sonraki adım.'),
      variation: t('Secondary colour, a short checklist, one CTA, a name line.', 'رنگ دوم برند، چک‌لیست کوتاه، یک دعوت به اقدام و خط نام.', 'İkincil renk, kısa kontrol listesi, tek CTA, isim satırı.'),
      layers: [
        L('background', 'full', 'secondary'),
        L('headline', r(7, 12, 86, 16), 'secondary', { words: 8, lines: 2 }),
        L('body', r(7, 32, 86, 36), 'secondary', { words: 35, lines: 5 }),
        L('cta', r(7, 74, 60, 8), 'secondary', { words: 6, lines: 1, rules: ['one_cta'] }),
        L('handle', r(7, 88, 60, 5), 'secondary', { words: 6, lines: 1 }),
      ],
      do: ['cta_on_last_slide', 'one_cta'],
      dont: ['no_dense_paragraphs'],
    },
  ],
}

export interface StarterOptions {
  brandSlug: string
  surfaces?: readonly SocialSurface[]
  stylesPerSurface?: number
  personal?: boolean
}

export function starterFamily(personal = false): SocialFamily {
  return {
    type: { headline: DISPLAY, body: BODY, accent: null },
    palette: { ...STARTER_PALETTE },
    logo: { placement: 'bottom_right', size_pct: 12, asset: 'missing', rule_refs: ['brand.logo.clear_space', 'brand.logo.min_size', 'brand.logo.misuse'] },
    photo_direction: { fact_refs: ['brand.photo.direction', 'brand.photo.lighting', 'brand.photo.grade', ...(personal ? ['personal.media.photo_guidelines'] : [])] },
    corner_radius: 'radius.lg',
    grid: { margin_pct: 6, columns: 6, gutter_pct: 2 },
  }
}

export function starterStyle(surface: SocialSurface, archetype: Archetype): SocialStyle {
  const style: SocialStyle = {
    id: `${surface}.${archetype.slug}`,
    surface,
    archetype: archetype.slug,
    name: { ...archetype.name },
    intent: { use_when: { ...archetype.use }, content_types: [...archetype.types], pillar: null },
    layers: archetype.layers.map((layer) => structuredClone(layer)),
    variation: { ...archetype.variation },
    do: [...archetype.do],
    dont: [...archetype.dont],
    reference_assets: 'missing',
    status: 'draft',
  }
  if (SURFACE_SPECS[surface].caption_style) {
    style.caption_style = { font: BODY, color: P.dark_text, background: P.dark_canvas, max_words_per_line: 5, position: 'lower_third' }
  }
  return style
}

/** The starter draft kit. Pure and deterministic. */
export function buildStarterKit(options: StarterOptions): SocialKit {
  const per = options.stylesPerSurface ?? DEFAULT_STYLES_PER_SURFACE
  const surfaces = options.surfaces ?? SURFACES
  return {
    schema_version: 1,
    kind: 'social_style_kit',
    brand_slug: options.brandSlug,
    family: starterFamily(options.personal === true),
    styles: SURFACES.filter((surface) => surfaces.includes(surface)).flatMap((surface) => STARTER_ARCHETYPES[surface].slice(0, per).map((archetype) => starterStyle(surface, archetype))),
  }
}
