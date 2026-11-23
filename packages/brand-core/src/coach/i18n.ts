import type { Locale } from '../i18n.js'
import { COACH_CRITERIA, COACH_FINDING_CODES, COACH_STATUSES, type CoachCriterion, type CoachFindingCode, type CoachStatus } from './model.js'

/**
 * The coach's human text in en, fa (RTL) and tr.
 *
 * English is the base; fa and tr are locale data with equal standing and are written as professional
 * advice, not as word-for-word translations of the labels. Every finding code and every criterion has an
 * entry in all three locales; `tests/coach-core.test.ts` fails when one is missing.
 *
 * Placeholders are filled from closed-vocabulary values only: question ids, coach lexicon terms, document
 * paths, rule names, counts and criterion names. The owner's answer is never interpolated.
 */

export interface CoachPhrase {
  reason: string
  improvement: string | null
}

type Table = Record<CoachFindingCode, CoachPhrase>

const EN: Table = {
  question_not_applicable: {
    reason: '{question} does not apply to this brand right now ({why}; condition: {condition}), so it is not applicable rather than missing.',
    improvement: null,
  },
  answer_missing: {
    reason: '{question} has no live answer in the ledger, so there is nothing to assess yet.',
    improvement: 'Answer it when you are ready: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} is recorded as {status}. That is an explicit decision of yours, so the coach treats the field as settled and asks nothing further.',
    improvement: null,
  },
  placeholder_value: {
    reason: 'The stored value for {question} is one of the template placeholders, not a decision of yours.',
    improvement: 'Replace it with your own wording, or record unknown so the field is honestly open instead of looking answered.',
  },
  vague_terms: {
    reason: 'The answer to {question} is short and rests on general wording ({terms}). No document can turn that into a specific claim.',
    improvement: 'Name the one case you actually mean: which group, in which situation, with which problem.',
  },
  too_brief_for_output: {
    reason: 'The answer to {question} has {words} content word(s); below {min} there is not enough for the sections it feeds.',
    improvement: 'Add the missing half in one more sentence: what it is, who it is for, and why that matters here.',
  },
  linked_question_open: {
    reason: '{question} is answered, but the linked question(s) it builds on are still open: {ids}. The document section stays incomplete until they are settled.',
    improvement: 'Answer {ids} next. These are existing interview questions; the coach adds none.',
  },
  missing_measure: {
    reason: '{question} asks for a measure, and the stored answer carries no figure, period or unit.',
    improvement: 'State the figure you actually have, with its period and unit. If you do not have one, record unknown rather than an estimate that reads like a fact.',
  },
  evidence_not_verified: {
    reason: '{question} is a claim that needs verified evidence before public use, and the evidence register holds no current, independent source for it.',
    improvement: 'Record a source: npm run brand:evidence -- add --claim {question}. Verifying it stays your step.',
  },
  evidence_owner_stated_only: {
    reason: 'Only your own testimony supports {question}. That is a valid statement of yours; it is not independent verification, and publication needs the latter.',
    improvement: 'Add a source someone outside could check, then verify it: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question} appears in {count} open contradiction(s) from the interview rules ({rules}). The coach reports them; it did not create or widen them.',
    improvement: 'Decide which field is right, then correct the other through the normal change flow so the diff is visible.',
  },
  meets_criteria: {
    reason: 'The answer to {question} passes every criterion the coach can check without a model: {criteria}. This is a check on the data, not a judgement of your decision.',
    improvement: null,
  },
  follow_up_canonical: {
    reason: 'The gap after {question} is {criterion}, and the interview already owns a question for it: {canonical}. Asking that one keeps a single canonical answer.',
    improvement: 'Ask {canonical} next: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'One clarifying question would make {question} usable for {outputs}. The missing dimension is {criterion}, and no existing question covers it.',
    improvement: 'Answer in your own words, or reply skip, unknown or decide later — the coach will not ask again for this answer.',
  },
  follow_up_none: {
    reason: 'Nothing to ask about {question}: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'The interview rule {rule} reports a conflict between {ids}. This is the existing deterministic rule, reported unchanged.',
    improvement: 'Settle which field is right with the owner, then correct the other through the change flow.',
  },
  consistency_none: {
    reason: 'No deterministic contradiction is open across the {count} answered question(s) the coach read. Strategic trade-offs are not assessed in this version.',
    improvement: null,
  },
}

const FA: Table = {
  question_not_applicable: {
    reason: '{question} در حال حاضر به این برند مربوط نمی‌شود ({why}؛ شرط: {condition})؛ پس «نامرتبط» است، نه «جامانده».',
    improvement: null,
  },
  answer_missing: {
    reason: 'برای {question} هیچ پاسخ فعالی در دفتر ثبت نشده است؛ پس هنوز چیزی برای ارزیابی وجود ندارد.',
    improvement: 'هر وقت آماده بودید پاسخ دهید: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} با وضعیت {status} ثبت شده است. این تصمیم صریح خودتان است؛ پس مربی این فیلد را بسته‌شده می‌داند و پرسش دیگری نمی‌کند.',
    improvement: null,
  },
  placeholder_value: {
    reason: 'مقدار ذخیره‌شده برای {question} یکی از جانگهدارهای قالب است، نه تصمیم شما.',
    improvement: 'آن را با واژگان خودتان جایگزین کنید، یا unknown ثبت کنید تا فیلد صادقانه باز بماند و پاسخ‌داده‌شده به نظر نرسد.',
  },
  vague_terms: {
    reason: 'پاسخ {question} کوتاه است و بر واژگان عمومی تکیه دارد ({terms}). هیچ سندی نمی‌تواند از این متن یک ادعای مشخص بسازد.',
    improvement: 'همان یک مورد واقعی را نام ببرید: کدام گروه، در کدام موقعیت، با کدام مسئله.',
  },
  too_brief_for_output: {
    reason: 'پاسخ {question} {words} واژهٔ محتوایی دارد؛ کمتر از {min} واژه برای بخش‌هایی که این فیلد تغذیه می‌کند کافی نیست.',
    improvement: 'نیمهٔ جامانده را در یک جملهٔ دیگر اضافه کنید: چه چیزی، برای چه کسی، و چرا اینجا مهم است.',
  },
  linked_question_open: {
    reason: '{question} پاسخ دارد، اما پرسش‌های پیوندی که بر آن‌ها بنا شده هنوز باز است: {ids}. تا تعیین‌تکلیف آن‌ها، بخش سند ناقص می‌ماند.',
    improvement: 'در گام بعد به {ids} پاسخ دهید. این‌ها پرسش‌های موجود مصاحبه‌اند؛ مربی پرسشی نمی‌افزاید.',
  },
  missing_measure: {
    reason: '{question} یک سنجه می‌خواهد و پاسخ ذخیره‌شده هیچ رقم، دوره یا واحدی ندارد.',
    improvement: 'همان رقمی را بنویسید که واقعاً دارید، همراه با دوره و واحدش. اگر رقمی ندارید، به‌جای برآوردی که مثل واقعیت خوانده می‌شود، unknown ثبت کنید.',
  },
  evidence_not_verified: {
    reason: '{question} ادعایی است که پیش از استفادهٔ عمومی به شهود تأییدشده نیاز دارد و در دفتر شهود هیچ منبع مستقل و معتبری برای آن نیست.',
    improvement: 'یک منبع ثبت کنید: npm run brand:evidence -- add --claim {question}. تأیید آن گام خودتان می‌ماند.',
  },
  evidence_owner_stated_only: {
    reason: 'تنها گفتهٔ خودتان پشتیبان {question} است. این یک بیان معتبر از سوی شماست، اما تأیید مستقل نیست و انتشار به تأیید مستقل نیاز دارد.',
    improvement: 'منبعی اضافه کنید که کسی بیرون از سازمان بتواند بررسی کند، سپس تأییدش کنید: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question} در {count} تناقض باز از قواعد مصاحبه دیده می‌شود ({rules}). مربی فقط گزارش می‌دهد؛ این تناقض‌ها را نساخته و بزرگ‌تر نکرده است.',
    improvement: 'تصمیم بگیرید کدام فیلد درست است، سپس دیگری را از مسیر عادی تغییر اصلاح کنید تا تفاوت دیده شود.',
  },
  meets_criteria: {
    reason: 'پاسخ {question} همهٔ معیارهایی را که مربی بدون مدل می‌تواند بسنجد می‌گذراند: {criteria}. این بررسیِ داده است، نه داوری دربارهٔ تصمیم شما.',
    improvement: null,
  },
  follow_up_canonical: {
    reason: 'شکافِ بعد از {question} «{criterion}» است و مصاحبه از قبل پرسشی برای آن دارد: {canonical}. پرسیدن همان، یک پاسخ مرجع را حفظ می‌کند.',
    improvement: 'در گام بعد {canonical} را بپرسید: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'یک پرسش روشن‌کننده {question} را برای {outputs} قابل‌استفاده می‌کند. بُعد جامانده «{criterion}» است و هیچ پرسش موجودی آن را نمی‌پوشاند.',
    improvement: 'با واژگان خودتان پاسخ دهید، یا skip، unknown یا decide later بگویید — مربی برای این پاسخ دوباره نمی‌پرسد.',
  },
  follow_up_none: {
    reason: 'دربارهٔ {question} چیزی برای پرسیدن نیست: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'قاعدهٔ مصاحبهٔ {rule} یک تناقض میان {ids} گزارش می‌کند. این همان قاعدهٔ قطعیِ موجود است که بی‌تغییر بازگو می‌شود.',
    improvement: 'با مالک روشن کنید کدام فیلد درست است، سپس دیگری را از مسیر تغییر اصلاح کنید.',
  },
  consistency_none: {
    reason: 'در {count} پرسشِ پاسخ‌داده‌شده‌ای که مربی خواند، هیچ تناقض قطعیِ بازی وجود ندارد. سنجش بده‌بستان‌های راهبردی در این نسخه انجام نمی‌شود.',
    improvement: null,
  },
}

const TR: Table = {
  question_not_applicable: {
    reason: '{question} şu anda bu marka için geçerli değil ({why}; koşul: {condition}); yani eksik değil, uygulanamaz.',
    improvement: null,
  },
  answer_missing: {
    reason: '{question} için defterde canlı bir yanıt yok; bu yüzden değerlendirilecek bir şey de yok.',
    improvement: 'Hazır olduğunuzda yanıtlayın: npm run brand:interview -- --question {question}',
  },
  answer_disposition: {
    reason: '{question} {status} olarak kayıtlı. Bu sizin açık kararınız; koç alanı kapanmış sayar ve başka soru sormaz.',
    improvement: null,
  },
  placeholder_value: {
    reason: '{question} için saklanan değer şablonun yer tutucularından biri, sizin kararınız değil.',
    improvement: 'Kendi sözlerinizle değiştirin ya da unknown kaydedin; böylece alan yanıtlanmış görünmek yerine dürüstçe açık kalır.',
  },
  vague_terms: {
    reason: '{question} yanıtı kısa ve genel ifadelere dayanıyor ({terms}). Hiçbir belge bundan belirli bir iddia üretemez.',
    improvement: 'Gerçekte kastettiğiniz tek durumu adlandırın: hangi grup, hangi durumda, hangi sorunla.',
  },
  too_brief_for_output: {
    reason: '{question} yanıtında {words} içerik sözcüğü var; {min} sözcüğün altında, beslediği bölümler için yeterli değil.',
    improvement: 'Eksik yarıyı bir cümle daha ile ekleyin: nedir, kim için, ve burada neden önemli.',
  },
  linked_question_open: {
    reason: '{question} yanıtlandı, ama dayandığı bağlantılı soru(lar) hâlâ açık: {ids}. Bunlar çözülmedikçe belge bölümü eksik kalır.',
    improvement: 'Sırada {ids} var. Bunlar görüşmenin mevcut soruları; koç yeni soru eklemez.',
  },
  missing_measure: {
    reason: '{question} bir ölçü istiyor ve saklanan yanıtta sayı, dönem ya da birim yok.',
    improvement: 'Gerçekten sahip olduğunuz sayıyı dönemi ve birimiyle yazın. Sayı yoksa, olgu gibi okunan bir tahmin yerine unknown kaydedin.',
  },
  evidence_not_verified: {
    reason: '{question} kamuya açık kullanımdan önce doğrulanmış kanıt gerektiren bir iddia ve kanıt defterinde güncel, bağımsız bir kaynak yok.',
    improvement: 'Bir kaynak kaydedin: npm run brand:evidence -- add --claim {question}. Doğrulama sizin adımınız olarak kalır.',
  },
  evidence_owner_stated_only: {
    reason: '{question} yalnızca kendi beyanınıza dayanıyor. Bu sizin geçerli ifadenizdir; bağımsız doğrulama değildir ve yayın bunu gerektirir.',
    improvement: 'Dışarıdan birinin kontrol edebileceği bir kaynak ekleyin, sonra doğrulayın: npm run brand:evidence -- add --claim {question}',
  },
  field_in_open_conflict: {
    reason: '{question}, görüşme kurallarından gelen {count} açık çelişkide görünüyor ({rules}). Koç yalnızca bildirir; bu çelişkileri ne yarattı ne büyüttü.',
    improvement: 'Hangi alanın doğru olduğuna karar verin, sonra diğerini normal değişiklik akışıyla düzeltin ki fark görünür olsun.',
  },
  meets_criteria: {
    reason: '{question} yanıtı, koçun modelsiz denetleyebildiği tüm ölçütleri geçiyor: {criteria}. Bu veriye dair bir denetim, kararınıza dair bir yargı değil.',
    improvement: null,
  },
  follow_up_canonical: {
    reason: '{question} sonrasındaki boşluk «{criterion}» ve görüşmede bunun için zaten bir soru var: {canonical}. Onu sormak tek bir asli yanıtı korur.',
    improvement: 'Sırada {canonical} olsun: npm run brand:interview -- --question {canonical}',
  },
  follow_up_clarify: {
    reason: 'Tek bir açıklayıcı soru {question} yanıtını {outputs} için kullanılabilir kılar. Eksik boyut «{criterion}» ve mevcut hiçbir soru onu kapsamıyor.',
    improvement: 'Kendi sözlerinizle yanıtlayın ya da skip, unknown veya decide later deyin — koç bu yanıt için bir daha sormaz.',
  },
  follow_up_none: {
    reason: '{question} hakkında sorulacak bir şey yok: {why}',
    improvement: null,
  },
  consistency_rule: {
    reason: 'Görüşme kuralı {rule}, {ids} arasında bir çelişki bildiriyor. Bu, mevcut belirlenimci kuralın olduğu gibi aktarılmasıdır.',
    improvement: 'Hangi alanın doğru olduğunu sahiple netleştirin, sonra diğerini değişiklik akışıyla düzeltin.',
  },
  consistency_none: {
    reason: 'Koçun okuduğu {count} yanıtlanmış soruda açık, belirlenimci bir çelişki yok. Stratejik ödünleşmeler bu sürümde değerlendirilmez.',
    improvement: null,
  },
}

export const COACH_TEXT: Record<Locale, Table> = { en: EN, fa: FA, tr: TR }

/** The one clarifying question the coach asks when no canonical question covers the gap. */
export const CLARIFY_QUESTIONS: Record<Locale, Record<CoachCriterion, string>> = {
  en: {
    relevance: 'Setting the placeholder aside: in one sentence, what is your actual answer here?',
    specificity: 'Which single group or situation do you mean, and what is their main problem?',
    completeness_for_output: 'What would you add so this can be used without anyone guessing the rest?',
    measurability: 'What figure do you actually have for this, and over what period?',
    evidence_support: 'Which source could someone outside your company check for this claim?',
    clarity_coherence: 'Of the two statements that disagree, which one should stand, and why?',
  },
  fa: {
    relevance: 'جانگهدار را کنار بگذاریم: در یک جمله، پاسخ واقعی شما اینجا چیست؟',
    specificity: 'کدام یک گروه یا موقعیت را در نظر دارید و مسئلهٔ اصلی‌شان چیست؟',
    completeness_for_output: 'چه چیزی اضافه می‌کنید تا بتوان این را بدون حدس‌زدن بقیه‌اش به کار برد؟',
    measurability: 'واقعاً چه رقمی برای این دارید و در چه دوره‌ای؟',
    evidence_support: 'کسی بیرون از شرکت شما این ادعا را از کدام منبع می‌تواند بررسی کند؟',
    clarity_coherence: 'از آن دو گزاره که با هم نمی‌خوانند، کدام باید بماند و چرا؟',
  },
  tr: {
    relevance: 'Yer tutucuyu bir yana bırakalım: tek cümleyle, buradaki gerçek yanıtınız nedir?',
    specificity: 'Hangi tek grubu ya da durumu kastediyorsunuz ve ana sorunları nedir?',
    completeness_for_output: 'Geri kalanı kimse tahmin etmeden kullanılabilsin diye ne eklerdiniz?',
    measurability: 'Bunun için gerçekte hangi sayıya sahipsiniz ve hangi dönem için?',
    evidence_support: 'Bu iddiayı şirketinizin dışından biri hangi kaynaktan kontrol edebilir?',
    clarity_coherence: 'Birbiriyle çelişen iki ifadeden hangisi kalmalı ve neden?',
  },
}

export const CRITERION_NAMES: Record<Locale, Record<CoachCriterion, string>> = {
  en: {
    relevance: 'relevance',
    specificity: 'specificity',
    completeness_for_output: 'completeness for the documents it feeds',
    measurability: 'measurability',
    evidence_support: 'evidence support',
    clarity_coherence: 'clarity and internal coherence',
  },
  fa: {
    relevance: 'ارتباط با پرسش',
    specificity: 'مشخص‌بودن',
    completeness_for_output: 'کامل‌بودن برای اسنادی که تغذیه می‌کند',
    measurability: 'قابل‌سنجش‌بودن',
    evidence_support: 'پشتیبانی شهود',
    clarity_coherence: 'روشنی و سازگاری درونی',
  },
  tr: {
    relevance: 'soruyla ilgililik',
    specificity: 'belirlilik',
    completeness_for_output: 'beslediği belgeler için bütünlük',
    measurability: 'ölçülebilirlik',
    evidence_support: 'kanıt desteği',
    clarity_coherence: 'açıklık ve iç tutarlılık',
  },
}

export const STATUS_NAMES: Record<Locale, Record<CoachStatus, string>> = {
  en: {
    ready: 'ready',
    needs_clarification: 'needs clarification',
    evidence_missing: 'evidence missing',
    needs_review: 'needs review',
    not_applicable: 'not applicable',
    insufficient_context: 'insufficient context',
  },
  fa: {
    ready: 'آماده',
    needs_clarification: 'نیازمند روشن‌سازی',
    evidence_missing: 'شهود موجود نیست',
    needs_review: 'نیازمند بازبینی',
    not_applicable: 'نامرتبط',
    insufficient_context: 'زمینهٔ کافی نیست',
  },
  tr: {
    ready: 'hazır',
    needs_clarification: 'açıklama gerekiyor',
    evidence_missing: 'kanıt eksik',
    needs_review: 'inceleme gerekiyor',
    not_applicable: 'uygulanamaz',
    insufficient_context: 'bağlam yetersiz',
  },
}

/** Reasons the coach has nothing to ask. Interpolated into `follow_up_none`. */
export const NO_FOLLOW_UP_REASONS = ['answer_settled', 'answer_open', 'quality_ready', 'already_deferred'] as const
export type NoFollowUpReason = (typeof NO_FOLLOW_UP_REASONS)[number]

export const NO_FOLLOW_UP_TEXT: Record<Locale, Record<NoFollowUpReason, string>> = {
  en: {
    answer_settled: 'you recorded an explicit decision (unknown, skip or not relevant), and the coach never reopens one.',
    answer_open: 'the question has no live answer yet, so a follow-up would come before the question itself.',
    quality_ready: 'the answer passes every criterion the coach can check, so one more question would only add fatigue.',
    already_deferred: 'the question that would close the gap is on your "decide later" list, which the coach treats as a decline.',
  },
  fa: {
    answer_settled: 'شما تصمیم صریحی ثبت کرده‌اید (unknown، skip یا نامرتبط) و مربی هرگز آن را بازنمی‌کند.',
    answer_open: 'این پرسش هنوز پاسخ فعالی ندارد؛ پس پرسش تکمیلی پیش از خودِ پرسش می‌آمد.',
    quality_ready: 'پاسخ همهٔ معیارهای قابل‌سنجش مربی را می‌گذراند؛ یک پرسش بیشتر فقط خستگی می‌افزاید.',
    already_deferred: 'پرسشی که این شکاف را می‌بست در فهرست «بعداً تصمیم می‌گیرم» شماست و مربی آن را انصراف می‌داند.',
  },
  tr: {
    answer_settled: 'açık bir karar kaydettiniz (unknown, skip ya da ilgisiz) ve koç bunu asla yeniden açmaz.',
    answer_open: 'sorunun henüz canlı bir yanıtı yok; ek soru, sorunun kendisinden önce gelmiş olurdu.',
    quality_ready: 'yanıt koçun denetleyebildiği tüm ölçütleri geçiyor; bir soru daha yalnızca yorgunluk katardı.',
    already_deferred: 'boşluğu kapatacak soru «sonra karar ver» listenizde ve koç bunu bir ret sayar.',
  },
}

export const COACH_UI: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Strategic coach',
    advisory: 'Advisory only. Nothing here is a brand fact, an approval or a change. The coach wrote nothing.',
    mode: 'Mode',
    question: 'Question',
    status: 'Status',
    findings: 'Findings',
    none: 'No findings.',
    ask: 'Suggested question',
    useExisting: 'Use the existing question',
    improvement: 'Next step',
    improves: 'Improves',
    sources: 'Read',
    noModel: 'No model was called. Every finding is deterministic.',
    changeFlow: 'This field is approved. Changing it needs the human change flow, not the coach.',
  },
  fa: {
    title: 'مربی راهبردی',
    advisory: 'فقط مشورتی. هیچ‌چیزِ اینجا واقعیت برند، تأیید یا تغییر نیست. مربی چیزی ننوشت.',
    mode: 'حالت',
    question: 'پرسش',
    status: 'وضعیت',
    findings: 'یافته‌ها',
    none: 'یافته‌ای نیست.',
    ask: 'پرسش پیشنهادی',
    useExisting: 'از پرسش موجود استفاده کنید',
    improvement: 'گام بعد',
    improves: 'بهبود می‌دهد',
    sources: 'خوانده‌شده',
    noModel: 'هیچ مدلی فراخوانده نشد. همهٔ یافته‌ها قطعی‌اند.',
    changeFlow: 'این فیلد تأییدشده است. تغییرش به مسیر انسانیِ تغییر نیاز دارد، نه به مربی.',
  },
  tr: {
    title: 'Stratejik koç',
    advisory: 'Yalnızca tavsiye. Buradaki hiçbir şey marka olgusu, onay ya da değişiklik değildir. Koç hiçbir şey yazmadı.',
    mode: 'Kip',
    question: 'Soru',
    status: 'Durum',
    findings: 'Bulgular',
    none: 'Bulgu yok.',
    ask: 'Önerilen soru',
    useExisting: 'Mevcut soruyu kullanın',
    improvement: 'Sonraki adım',
    improves: 'İyileştirdiği',
    sources: 'Okunan',
    noModel: 'Hiçbir model çağrılmadı. Tüm bulgular belirlenimcidir.',
    changeFlow: 'Bu alan onaylı. Değiştirmek koçu değil, insan değişiklik akışını gerektirir.',
  },
}

export function coachUi(locale: Locale, key: string): string {
  return COACH_UI[locale][key] ?? COACH_UI.en[key] ?? key
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => vars[name] ?? `{${name}}`)
}

/** The localized reason and improvement for one finding code, with placeholders filled. */
export function coachText(locale: Locale, code: CoachFindingCode, vars: Record<string, string> = {}): CoachPhrase {
  const phrase = COACH_TEXT[locale][code] ?? COACH_TEXT.en[code]
  return { reason: fill(phrase.reason, vars), improvement: phrase.improvement === null ? null : fill(phrase.improvement, vars) }
}

/** Every code, criterion and status has text in every locale. Used by the tests and by `brand:validate`. */
export function coachI18nErrors(): string[] {
  const errors: string[] = []
  for (const locale of ['en', 'fa', 'tr'] as const) {
    for (const code of COACH_FINDING_CODES) {
      const phrase = COACH_TEXT[locale][code]
      if (!phrase || !phrase.reason.trim()) errors.push(`coach text ${locale}.${code} is missing`)
      if (phrase && COACH_TEXT.en[code].improvement === null !== (phrase.improvement === null)) {
        errors.push(`coach text ${locale}.${code} disagrees with en about having an improvement line`)
      }
    }
    for (const criterion of COACH_CRITERIA) {
      if (!CLARIFY_QUESTIONS[locale][criterion]?.trim()) errors.push(`coach clarify question ${locale}.${criterion} is missing`)
      if (!CRITERION_NAMES[locale][criterion]?.trim()) errors.push(`coach criterion name ${locale}.${criterion} is missing`)
    }
    for (const status of COACH_STATUSES) {
      if (!STATUS_NAMES[locale][status]?.trim()) errors.push(`coach status name ${locale}.${status} is missing`)
    }
    for (const key of Object.keys(COACH_UI.en)) {
      if (!COACH_UI[locale][key]?.trim()) errors.push(`coach ui string ${locale}.${key} is missing`)
    }
  }
  return errors
}
