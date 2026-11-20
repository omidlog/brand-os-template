# Implementation status

Updated after the external audit remediation. “Fixed” means a test or a build exercises the behavior. “Partial” means a real subset works and the gap is named.

## Audit findings

| ID | Status | Note |
| --- | --- | --- |
| P0-1 | Fixed | Restricted values are encrypted under gitignored `brand/.private`. Ledger and docs store an opaque id only. |
| P0-2 | Fixed | `materialize` creates missing files and does not overwrite existing catalogs, assets, or module pages. |
| P0-3 | Fixed | Approved, audience-visible facts are written to `published/claims` during docs prepare, with approver and source id. |
| P0-4 | Fixed | MCP uses `@modelcontextprotocol/sdk` stdio. A client test lists tools, calls them, and sends Persian text. |
| P1-1 | Partial | Free-form `note:` lines become quoted draft proposals and are not approved. No hosted LLM is connected. A browser interview UI is not built. |
| P1-2 | Fixed | Token, mascot, component, social, and search tools read the brand files and approved records. |
| P1-3 | Fixed | `--actor owner` cannot approve. Approval requires the human proof in `brand/.private/approval-secret`. |
| P1-4 | Partial | `upgradeCore` bumps `brand/engine.lock` and preserves content. The engine is not published to npm. |
| P1-5 | Fixed | `brand:init` writes the brand name and slug into `brand-manifest.json`. |
| P1-6 | Fixed | Stage validation checks unique ids and contiguous order. Six stages are only the example file. |
| P1-7 | Fixed | A disabled mascot omits module docs and emits an empty catalog JSON, so state ids are not in the data bundle. |
| P1-8 | Partial | Portal color, type, and radius read DTCG variables. Alias cycles are reported. Draft and approved tokens are separated in the tool, not by a second compiler pipeline. |
| P1-9 | Partial | `renderBusinessArtifacts` fills plan, marketing, PRD, roadmap, sales, support, finance, and OKR pages from the ledger and leaves unknowns unknown. They are not full models. |
| P1-10 | Fixed | Public builds copy only approved public assets inside `brand/assets`. The asset schema and path boundary are checked. |
| P1-11 | Fixed | A public prepare throws when `publish_docs` is private. The EXAMPLE template is public because it has no confidential facts. `brand:init` defaults to private. |
| P2-1 | Partial | Prompts are translated. Body copy is still English in the fa and tr builds. `docs-internal/LOCALIZATION.md` describes the approval path. |
| P2-2 | Fixed | Five more skills: strategist, logo, mascot animator, marketing creative, brand QA. |
| P2-3 | Partial | The docs site still has one token-backed button plus the component registry. There is no product component package or Figma node map. |
| P2-4 | Partial | The gallery can preview a published SVG. Unapproved files are not given download links. |
| P2-5 | Partial | Snapshot file is still local. There is no Figma API client. |
| P2-6 | Not fixed | `import existing:` records a URL and does not fetch it, to avoid turning the tool into an open web client. |
| P2-7 | Partial | Name, availability, and placeholder contradictions exist. There is no general schema rule language. |
| P2-8 | Fixed | Audit tests cover canaries, materialize, publishing, approval proof, upgrade, retrieval, alias cycles, MCP, and hidden mascot data. |
| P2-9 | Partial | Search reads approved facts and, when asked, draft markdown. There are no embeddings. |
| P2-10 | Partial | Reset backs up the ledger under `brand/.private/backups`. There is no multi-user lock service or retention policy beyond gitignore. |

## Commands that this remediation expects to pass

`npm run lint`, `npm run typecheck`, `npm run validate`, `npm run test`, `npm run build`, and `npm run build:docs:nomascot`.

## Second remediation contract

`docs-internal/REMEDIATION_TRACEABILITY.md` is the ticket record. Public export is a new allowlist. Approved facts stay approved when someone passes `confirm=true`. `include_unapproved` does not grant access. A private brand cannot be built as public. Asset publication rejects symlinks, traversal, active SVG, and checksum mismatches. Backup, restore, migrate, and reset are separate commands. Journeys A, B, and C have automated tests.

`authorize()` gates submit, approval, publication, reveal, export, and the MCP tools. `include_unapproved` is not an MCP parameter. Backups and restricted values use `BRAND_OS_DATA_KEY` and fail closed when it is absent. Fact files migrate to canonical schema 2. Each module compiles a cited page that leaves missing sections missing. Figma import returns `not_configured` without credentials and does not overwrite tokens.

Still external: SSO, a hosted LLM, live Figma, and npm publishing. The approval proof remains a local file. Compiled pages are not a designed brand book, and fa/tr text other than the marked draft guidance paragraphs stays English. A CI matrix is not configured.

## Remaining security limits

- The local encryption key sits next to the ciphertext in `brand/.private`. Copying that directory copies the secrets. It is not a KMS.
- The approval proof is a local shared secret, not SSO. Anyone who can read `approval-secret` can approve.
- `brand:init --reset` rewrites the ledger after copying it into the private backup. It does not rewrite mascot catalogs or module prose.
- A public build of a brand with `publish_docs: public` publishes approved public facts. Restricted values stay out. Internal facts stay out of the public audience.
