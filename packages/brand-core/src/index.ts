export { templateConfig } from './config.js'
export { allModules, allQuestions, moduleById } from './content/index.js'
export { buildMascotCatalog, CANONICAL_ANGLES, CORE_MOTIONS, EXAMPLE_STAGES, catalogCounts } from './content/mascot-catalog.js'
export { InterviewEngine, applyInit, emptySession, assertSlug, upgradeCore, syncManifest } from './engine.js'
export { backupBrand, migrateBrand, resetInterviewState, restoreBrand, RESET_CONFIRMATION } from './backup.js'
export { writeAtomic } from './fsutil.js'
export { authorize, agentContext, agentTokenContext, AGENT_PROFILES, guestContext, isAgentProfile, operatorContext, verifiedHumanContext } from './auth.js'
export type { AgentProfile, AuthContext, Audience, Role } from './auth.js'
export {
  AGENT_TOKEN_ENV,
  AgentTokenError,
  agentTokenPath,
  issueAgentToken,
  listAgentTokens,
  resolveAgentContext,
  revokeAgentToken,
} from './agent-tokens.js'
export type { AgentTokenSummary } from './agent-tokens.js'
export { accessLogPath, appendAccessLog, readAccessLog } from './access-log.js'
export type { AccessLogEntry } from './access-log.js'
export { approvalProofMatches } from './private-store.js'
export { compileModulePages } from './compile-docs.js'
export { readPublicationPolicy, factIsPublic, assetIsPublic, pageIsPublic } from './publication.js'
export { readFacts, writeFacts, migrateFactFiles } from './facts.js'
export { importFigmaVariables } from './figma.js'
export { allocateBudget, financeScenario } from './artifacts.js'
export { ensureApprovalSecret } from './private-store.js'
export { formatDoctor, runDoctor, MIN_NODE_MAJOR } from './doctor.js'
export type { DoctorCheck, DoctorReport, DoctorStatus } from './doctor.js'
export { renderBusinessArtifacts } from './artifacts.js'
export type { InitInput, StepResult, ImpactReport } from './engine.js'
export { writeStarterWorkspace } from './materialize.js'
export { completeness, latestAnswers } from './completeness.js'
export { findContradictions } from './contradictions.js'
export { approvalGrantErrors, APPROVAL_GRANTS, canApprove, isApprovalGrant, permissionFor } from './permissions.js'
export type { ApprovalGrant } from './permissions.js'
export { ApprovalService, readProposals } from './approval.js'
export type {
  ApprovalStep,
  BatchItemResult,
  BatchOutcome,
  BatchResult,
  ChangeProposal,
  PublishOutcome,
  PublishResult,
  ReviewItem,
  ReviewQueue,
  Selection,
} from './approval.js'
export {
  brandRetrieve,
  RETRIEVE_KINDS,
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
export type { RetrieveKind, RetrieveRequest, RetrievedItem, ToolResult } from './query.js'
export { evaluateCondition } from './conditions.js'
export { validateRepo } from './validate-repo.js'
export type { BrandConfig, FieldQuestion, ModuleDef, AnswerRecord } from './types.js'
