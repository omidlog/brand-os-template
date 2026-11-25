import type { InterviewProfile } from '../profiles.js'
import { personalCoreModules } from './personal-core.js'
import { personalFacetModules } from './personal-facets.js'

/**
 * Starter interview profiles written into new workspaces (brand/interview/profiles/). The YAML file is
 * the editable copy: an owner may change the list there, and brand:validate checks it.
 */
export const FOUNDER_CORE: InterviewProfile & { schema_version: 1 } = {
  schema_version: 1,
  id: 'founder-core',
  title: 'Founder core',
  description:
    'About 40 questions a founder can answer in one sitting: identity, offer, customer, business model, verbal identity, and the visual basics that later generate draft tokens. Set brand.profile to founder-core in brand.config.yaml to use it; set it back to universal for the full question bank. Restricted finance questions are left out on purpose: an interviewing agent must not collect them, and the owner answers them in the interactive interview.',
  question_ids: [
    'business.identity.new_or_existing',
    'business.identity.trade_name',
    'business.identity.sector',
    'business.stage.current',
    'business.market.geography',
    'business.offer.summary',
    'business.customer.primary_segment',
    'business.offer.value_proposition',
    'business.problem.pains',
    'business.product.mvp',
    'business.product.public_status',
    'business.model.revenue',
    'business.sales.motion',
    'business.sales.buyer',
    'business.sales.pricing',
    'business.sales.b2b_packaging',
    'business.marketing.objective',
    'business.marketing.channels',
    'business.plan.milestone',
    'business.finance.currency',
    'brand.personality.traits',
    'brand.strategy.purpose',
    'brand.strategy.values',
    'brand.strategy.differentiation',
    'brand.strategy.promise',
    'brand.verbal.name_use',
    'brand.identity.public_name_override',
    'brand.verbal.tagline',
    'brand.verbal.voice',
    'brand.verbal.forbidden',
    'brand.verbal.localization',
    'brand.verbal.voice_pairs',
    'brand.logo.variants',
    'brand.logo.misuse',
    'brand.logo.min_size',
    'brand.color.roles',
    'brand.color.semantic_map',
    'brand.color.themes',
    'brand.type.intent',
    'brand.type.scale',
    'brand.mascot.enabled',
    'brand.gamification.enabled',
  ],
}

/**
 * Shared brand questions a personal brand reuses by id instead of redefining: purpose, vision, values and promise
 * (they apply to a person too; BOS-15), personality, voice, do/don't pairs, forbidden language, translation style,
 * and the visual basics.
 */
export const PERSONAL_SHARED_QUESTIONS = [
  'brand.strategy.purpose',
  'brand.strategy.vision',
  'brand.strategy.values',
  'brand.strategy.promise',
  'brand.personality.traits',
  'brand.verbal.voice',
  'brand.verbal.voice_pairs',
  'brand.verbal.forbidden',
  'brand.verbal.localization',
  'brand.photo.direction',
  'brand.color.roles',
  'brand.color.semantic_map',
  'brand.type.intent',
  'brand.verbal.stories',
  'brand.social.cadence',
  'brand.presence.audit',
  'brand.community.strategy',
]

/**
 * The person's own practice, asked only with a business facet (founder-executive, consultant-expert): the canvas
 * partners, customer relationships, resources and costs, the plan risks, SWOT and TOWS, and the customer journey.
 * They are the business questions themselves, so the frameworks read them exactly as for a company.
 */
export const PERSONAL_PRACTICE_QUESTIONS = [
  'business.partners.channels',
  'business.cx.channels',
  'business.cx.onboarding',
  'business.model.key_resources',
  'business.model.cost_items',
  'business.plan.risks',
  'business.swot.strengths',
  'business.swot.weaknesses',
  'business.swot.opportunities',
  'business.swot.threats',
  'business.swot.tows',
  'business.marketing.journey',
  'business.marketing.journey_stages',
]

export const PERSONAL_BRAND: InterviewProfile & { schema_version: 1 } = {
  schema_version: 1,
  id: 'personal-brand',
  title: 'Personal brand',
  description:
    'A person-centered brand: identity, positioning, story, experience and credentials, evidence, content, visual presence and privacy, plus the shared voice and visual basics. Facet questions (founder-executive, consultant-expert, creator-educator, artist-designer, speaker-author) apply only for the facets selected in modules.personal.facets. The profile is exclusive: company legal-entity, SaaS, mascot and other Business OS questions count as not applicable, not missing. With a business facet (founder-executive, consultant-expert) the canvas, business and marketing plans and the Strategy lab describe the person’s own practice from these personal answers; parts with no personal answer are not applicable. For a full plan of a venture, set brand.profile back to universal and keep modules.personal enabled, or give the venture its own repository.',
  exclusive: true,
  question_ids: [
    ...personalCoreModules.flatMap((module) => module.fields.map((field) => field.id)),
    ...PERSONAL_SHARED_QUESTIONS,
    ...personalFacetModules.flatMap((module) => module.fields.map((field) => field.id)),
  ],
  facet_questions: [{ facets: ['founder-executive', 'consultant-expert'], question_ids: PERSONAL_PRACTICE_QUESTIONS }],
}

export const STARTER_PROFILES = [FOUNDER_CORE, PERSONAL_BRAND]
