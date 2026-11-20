# Remediation traceability

Contract: `BRAND_OS_REMEDIATION_2.md`. Baseline before this pass: `cd4ead5`. Paths were re-read from the current tree. Contract line numbers were not used as edit anchors.

Deviation kept from the previous audit: restricted values stay encrypted in gitignored `brand/.private`, materialize stays create-only, approval still requires the local human proof, and MCP still uses the official SDK. This pass does not undo those fixes.

A ticket is **fixed** only when the named test passed in this workspace. **partial** means the tested slice works and the named gap remains. Nothing here is marked fixed from a scaffold alone.

| ID | Severity | Current location | Test | Status | Commit | Proof |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | BLOCKER | `packages/brand-core/src/projection.ts` `exportPublic` | `tests/security-contract.test.ts` | partial | 153b954 | Public export is a new allowlist of published public facts. An unpublished approved name is absent. `exportSnapshot('internal')` still returns owner answer records. |
| P0-02 | BLOCKER | `engine.ts` `changeAnswer`, `approveChange`, `publishFact` | `tests/security-contract.test.ts`, `tests/interview.test.ts` | partial | 153b954 | `confirm=true` and `--actor owner` do not withdraw or approve. Stale `expected_version` is rejected. Reviewer id is the local proof, not SSO. |
| P0-03 | BLOCKER | `auth.ts` `authorize`, `query.ts`, `scripts/mcp.ts` | `tests/security-contract.test.ts` | partial | 153b954 | `include_unapproved` is ignored. Guest, agent, and cross-brand checks pass in `authorize`. That function is not yet called on every engine write. |
| P0-04 | BLOCKER | `scripts/prepare-docs.ts`, `brand/publication-policy.yaml`, `.github/workflows/deploy-docs.yml` | `tests/journeys.test.ts`, `tests/security-contract.test.ts` | partial | 153b954 | Missing frontmatter is internal. No `BRAND_OS_ALLOW_PUBLIC_BUILD` override. Public claims require publication and a policy id. Internal CI upload was removed. The built site was not exhaustively scanned as a release artifact. |
| P0-05 | BLOCKER | `packages/asset-catalog/src/index.ts` `inspectAssetForPublication` | `tests/security-contract.test.ts` | partial | 153b954 | Symlink, `..`, encoded `..`, absolute path, active SVG, and checksum mismatch are rejected. No browser execution test of a copied SVG. |
| P0-06 | BLOCKER | `packages/brand-core/src/backup.ts` | `tests/security-contract.test.ts`, `tests/journeys.test.ts` | partial | 153b954 | Backup keeps relative paths and refuses a non-empty destination. Restore checks the checksum. Reset requires the exact sentence. Migrate records a version and does not rewrite facts. Backups are not encrypted. |
| P1-01 | CORE | approved facts `publication`, `version` | `tests/security-contract.test.ts` | partial | 153b954 | Publication is separate from visibility. The full canonical fact schema in the contract is not the only writer yet. |
| P1-02 | CORE | `writePublished`, `artifacts.ts` | `tests/journeys.test.ts` | open | | Public output is still a claims page plus short ledger artifacts, not a per-module brand book. |
| P1-03 | CORE | `engine.ts` `extractPersianCandidates` | `tests/journeys.test.ts` | partial | 153b954 | One Persian note proposes student, tentative B2B, and unknown price as drafts. No hosted model and no browser interview UI. |
| P1-04 | CORE | `artifacts.ts` `allocateBudget` | `tests/journeys.test.ts` | partial | 153b954 | A supplied total allocates exactly. A missing total stays missing. Business documents are still short. |
| P1-05 | CORE | `prepare-docs.ts` catalog preview | `tests/audit.test.ts` | partial | 153b954 | A preview is set only when `source_assets` points at a file that passes publication inspection. The template has no approved stage-3 artwork. |
| P1-06 | CORE | `query.ts` token hash | `tests/security-contract.test.ts` | partial | 153b954 | A changed hex drops the token from retrieval. Example CSS is still the labeled draft theme. |
| P1-07 | CORE | `scripts/mcp.ts`, `query.ts` | `tests/audit.test.ts`, `tests/security-contract.test.ts` | partial | 153b954 | The SDK client test still passes. The client boolean does not widen results. The contract's full tool registry is not implemented. |
| P1-08 | CORE | `backup.ts` `migrateBrand` | `tests/journeys.test.ts` | partial | 153b954 | Two temp brands are exercised. The core is not an npm release. |
| P1-09 | CORE | `tests/journeys.test.ts`, `tests/security-contract.test.ts` | local `npm test` and `npm run docs:build` | partial | 153b954 | 28 tests passed locally and the en/fa/tr docs build succeeded. CI for this commit is not recorded yet. |
| P2-01 | POLISH | `docs-internal/FIGMA_SYNC.md` | none | open | | Snapshot only. No Figma API client. |
| P2-02 | POLISH | `AGENTS.md`, module overviews | review | partial | 153b954 | Approval instructions now require `--proof`. Skills were not expanded to the contract's depth. |
| P2-03 | POLISH | locales | none | open | | fa/tr site builds. Article bodies stay English. |
| P2-04 | POLISH | `apps/docs/src/pages/index.tsx` | none | open | | Public status hides the working name and the next-question list. It is not a separate internal dashboard. |
| P2-05 | POLISH | `deploy-docs.yml` | workflow review | partial | 153b954 | An internal audience is no longer uploaded as an Actions artifact. There is no hosted private site. |

## Deviations

- `getMascotGuidelines` no longer treats a client boolean as true. Published public mascot facts are the only rows.
- Disabled mascot and gamification modules are removed from the interview queue and from completion scoring.
- `upgradeCore` now calls `migrateBrand` and writes engine version `0.2.0`. It still does not rewrite brand content.
