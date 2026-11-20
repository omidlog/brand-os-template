export { templateConfig } from './config.js'
export { allModules, allQuestions, moduleById } from './content/index.js'
export { buildMascotCatalog, CANONICAL_ANGLES, CORE_MOTIONS, EXAMPLE_STAGES, catalogCounts } from './content/mascot-catalog.js'
export { InterviewEngine, applyInit, emptySession, assertSlug, upgradeCore, syncManifest } from './engine.js'
export { backupBrand, migrateBrand, resetInterviewState, restoreBrand, writeAtomic, RESET_CONFIRMATION } from './backup.js'
export { authorize, agentContext, guestContext, operatorContext, verifiedHumanContext } from './auth.js'
export { compileModulePages } from './compile-docs.js'
export { readFacts, writeFacts, migrateFactFiles } from './facts.js'
export { importFigmaVariables } from './figma.js'
export { allocateBudget, financeScenario } from './artifacts.js'
export { ensureApprovalSecret } from './private-store.js'
export { renderBusinessArtifacts } from './artifacts.js'
export type { InitInput, StepResult, ImpactReport } from './engine.js'
export { writeStarterWorkspace } from './materialize.js'
export { completeness, latestAnswers } from './completeness.js'
export { findContradictions } from './contradictions.js'
export { canApprove, permissionFor } from './permissions.js'
export {
  getAssetMetadata,
  getBrandGuidelines,
  getBrandOverview,
  getBrandStatus,
  getBrandTokens,
  getBusinessPlan,
  getDesignComponent,
  getLogoRules,
  getMarketingPlan,
  getMascotGuidelines,
  getMascotProfile,
  getMotionGuidelines,
  getSocialTemplate,
  listMascotAssets,
  listMascotStages,
  resolveAgentRequest,
  searchBrandDocs,
  searchMascotAssets,
} from './query.js'
export { evaluateCondition } from './conditions.js'
export { validateRepo } from './validate-repo.js'
export type { BrandConfig, FieldQuestion, ModuleDef, AnswerRecord } from './types.js'
