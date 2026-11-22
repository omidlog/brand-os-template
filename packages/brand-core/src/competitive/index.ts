export * from './model.js'
export { asLang, COMPETITIVE_LANGS, DIMENSION_LABELS, fill, GAP_TEXT, HEADINGS, PROHIBITED_TEXT, REVIEW_REASONS } from './i18n.js'
export type { CompetitiveLang } from './i18n.js'
export { buildLandscape, TARGET_MARKET_FACT } from './landscape.js'
export type { CandidateView, CellState, Gap, Landscape, LandscapeOptions, MatrixCell, ObservationView, PriceRow, RefState, SourceClass } from './landscape.js'
export {
  addCandidate,
  assertOwnerProcess,
  classifyCandidate,
  COMPETITIVE_DIRS,
  COMPETITIVE_TOPIC,
  linkEvidence,
  readCandidate,
  readScope,
  resolveEvidence,
  scanCandidates,
  setScope,
  setStatus,
  verifyDomain,
} from './store.js'
export type { AddCandidateInput, CandidateScan, LinkEvidenceInput, ResolvedEvidence } from './store.js'
