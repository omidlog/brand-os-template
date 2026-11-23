# Changelog

## Unreleased — Visual Blueprint P0: business model canvas

### Added

- `@brand-os/brand-core/visual`: a versioned semantic `VisualDocument` (blocks, data states, missing reasons, framework claim) and a nine-zone business model canvas built through the document model's `itemFor`, so approval, drafts, restriction and publication follow the same rules as the Brand Book. Gaps name the question to answer; nothing is guessed.
- Studio: read-only **Business model** page (`/brands/<slug>/visual`) and an A3-landscape print view (`/visual/print`, `?edition=public` without drafts), en/fa/tr, light/dark, reduced motion. No new non-GET route.
- `npm run visual:golden`: golden examples from an ILLUSTRATIVE / MOCK DATA fixture. Guide `docs-internal/VISUAL.md`. Tests: `visual-bmc`, `studio-visual`, `studio-visual-browser`.

## Unreleased — Content agent tools (Content Bridge Slice C)

### Added

- Agent token profile `content-read` (`brand:agent-token issue --profile content-read`). It reads facts as `marketing`, approved `content` strategies through `strategy_list` / `strategy_get`, and the new content tools. Existing tokens are unchanged.
- MCP tools `content_calendar` (approved, current calendar weeks in a date range, optionally one channel) and `content_brief` (one slot: voice, banned claims, audience, resolved key message / offer / CTA, channel plan, cited competitive angle, approved creative preference ids). Both are also in `brand:query`. Stable JSON with revision and digests; drafts and weeks that need review are only counted; a stale week pin is refused; restricted facts are never sent.
- MCP tool `content_report`: an agent reports a slot as `produced`, or `published` with an https URL. It is stored as an observation next to the calendar and changes no week, strategy or fact. The URL is checked for form and never opened. It grants no permission to publish.
- `npm run brand:content -- reports`: the owner's view of those reports (en/fa/tr).
- Tests: `content-agent` (7). Guide: `docs-internal/CONTENT_BRIDGE.md`.

## Unreleased — Content strategy and voice rules (Content Bridge Slice A)

### Added

- Strategy records gain a `content` type with a typed `content_strategy` block: content languages, pillars that cite the approved pillars fact, channels with role, formats and cadence (null until the owner decides), approved fact ids per role (voice, claims, audience, messaging, pillars, channels, offers, CTA, languages, objective), owner-written extra rules, pinned SEO / paid-media strategy revisions and explicit gaps. Review, approval, rejection and withdrawal are the existing `brand:strategy` commands.
- `npm run brand:content -- strategy`: proposes a content strategy from approved facts. It never writes voice: facts are cited by id, and anything missing, still `TBD`, or only the owner can decide is listed as a gap in en/fa/tr. `--out` writes a proposal file to edit, `--store` stores a draft.
- `npm run brand:content -- show`: the owner's voice rules projection of the approved content strategy (voice text, do / don't pairs, banned claims, availability rule, pillars, channels, gaps), resolved from approved facts. Drafts are never shown.
- A changed cited fact or a replaced cited SEO / paid-media strategy puts the content strategy in `needs_review`. Restricted facts such as the budget are refused. No agent reads content strategies yet.
- Guide `docs-internal/CONTENT_BRIDGE.md`. Tests: `content-strategy`, `content-cli`.

## Unreleased — Identity audit and logo brief (Identity Slice D)

### Added

- `npm run brand:identity`: the owner's identity audit and logo brief. `next` and `answer` run a short en/fa/tr diagnosis (path, why change, observed problem or preference, success, what must not change, recognition evidence, real uses, scripts, rollout). `equity` records preserve / refine / replace / evaluate / unknown per element; measured recognition needs a cited study note. `link-creative` links a Creative Learning project for concept rounds. `brief` prints a Markdown or JSON draft; `reviewed` records what the owner read.
- The brief covers new identities, retain, evolve and rebrand: problem and canonical inputs by fact id, existing assets, the equity matrix and migration risks, the competitor visual landscape from the Slice C identity projection only, 2–3 routes with why / why not / risks / red lines, uses and production checks, an unweighted rubric, the decision record, the approval hand-off and every missing item. It writes nothing and authorizes nothing.
- Creative Learning gains a `logo` surface. Selection there is never an approved mark.
- Skill `agent-skills/logo-identity-strategist` (before `logo-designer`). Guide `docs-internal/IDENTITY_BRIEF.md`. Tests: `identity-brief`, `identity-cli`.

## Unreleased — Cross-functional competitive drafts (Identity Slice C)

### Added

- `getCompetitiveContext(ws, purpose, {market, lang})`: one read-only projection of the competitive landscape per purpose (identity, positioning, marketing, pricing, seo, expansion). Marketing, pricing, SEO and identity drafts all read it, so they share competitor ids and cited refs. It returns `missing`, `candidate_only` or `evidence_insufficient` instead of empty lists.
- `brand:competitive memo --purpose marketing|pricing|seo|identity [--market] [--lang en|fa|tr] [--json]`: a marketing opportunity memo, a pricing benchmark memo, a cited SEO supplement or a visual landscape assessment. Drafts only: conflicts and stale sources are listed as unresolved, prices are never ranked or converted and carry rate labels, options are hypotheses with no number, approved facts are cited by id and revision. Nothing is written.
- `brand:competitive context --purpose …` and `brand:competitive import-seo-names [--dry-run]`. The import adds SEO interview names as unverified `seo_interview` candidates only when the owner runs it; existing names are reported, never merged.
- Tests: `competitive-context`, a second `competitive-cli` journey.

## Unreleased — Competitive landscape (Identity Slice B)

### Added

- `npm run brand:competitive`: an owner-only, per-brand competitor index in `brand/.private/competitive`. Owner-named businesses become unverified `candidate` records (`cmp_<uuid>`) with relationship (direct, indirect, substitute, aspirational benchmark) and geography (local, regional, international) as separate dimensions.
- Observations cite Knowledge research notes (recorded with `brand:seo research capture|replay`, topic `market_observation`) as `{note_id, revision, claim_key, observed_at}`. No quote is copied. A public price is accepted only when the cited quote shows the amount, currency and stated terms.
- `brand:competitive matrix` builds a deterministic landscape: matrix cells (`observed`, `unverified`, `hypothesis`, `historical`, `conflicting`, `needs_review`, `unknown`), prices listed but never ranked or converted, an en/fa/tr gap checklist and the inferences it never supports. Changed, stale, superseded or archived sources visibly degrade. No network, no brand-fact writes, refused under an agent token.
- Guide: `docs-internal/COMPETITIVE.md`. Tests: `competitive`, `competitive-cli`.

## Unreleased — Identity intake (Identity Slice A)

### Added

- The Studio new-brand wizard asks three optional questions on the Profile step: logo today, what to do with the identity, and how deep a change (only for refine or rebrand). They are in en, fa and tr, mirrored on the review step and prefilled by Edit and retry. Contradictions such as "no logo" + "keep" are refused.
- The answers are stored as an unapproved owner hint in `onboarding.identity` of `brand/brand.config.yaml` (`authority: unapproved_owner_intake`). They are never a fact, publication grant or asset, and no MCP, `brand:query`, public docs or Studio brand page shows them. Brands without the block read as unknown / undecided.
- `brand:init --logo-presence --identity-intent --change-depth`. Without these flags `brand:init` is unchanged. `brand:validate` warns about an invalid block.
- Guide: `docs-internal/IDENTITY_INTAKE.md`. Tests: `identity-intake`, `studio-identity-intake`, and the browser wizard journey.

## Unreleased — Strategy records and Strategy Feed (Spec Sprint 3)

### Added

- `npm run brand:strategy`: propose (`--file` or `--from-seo`), list, show, review (field diff, sources, blockers), approve (owner proof plus `--expect-sha`), reject, withdraw. Revisions are immutable under `brand/.private/strategy/records/` (gitignored) and cite approved facts and `knowledge:kn_…@sha256` research notes only.
- Agent-token profiles `strategy-seo-read` and `strategy-ads-read`, and the read-only `strategy_list` / `strategy_get` tools in the stdio MCP and `brand:query`. Only the approved, currently valid revision is served, as stable JSON with content, approval, source and feed digests. Restricted fields and the other kind's recommendations are listed under `redacted`. A stale pin is refused. Reading grants no permission to execute, spend or publish.
- Tests: `strategy-store`, `strategy-seo-import`, `strategy-cli`, `strategy-feed`. `audit` pins the two new tool names.

## Unreleased — Engine fixes

### Fixed

- A retracted (`brand:retract`, status `deprecated`) answer no longer counts as answered. Completeness counts a retracted required question as unanswered again, the interview queue and `brand:next` ask it again, and it no longer satisfies `depends_on`. Ledger history of the retracted answer is unchanged. New helper `isOpenAnswer` in `@brand-os/brand-core`. Tests: `brand-core-completeness`, `personal-evidence`.

## Unreleased — Phase 10 prep: Studio VPS deployment package

Theme: everything the launch operator needs to run the read-only Studio at `studio.omidataei.com` on the owner's VPS, behind the existing edge Caddy. **Nothing is deployed by this change.** Docs: `docs-internal/phase-10/`.

### Breaking changes

- None for brand repositories, the CLI, MCP or the docs build.
- Studio: with `STUDIO_TRUST_PROXY=1`, rate limits now use the rightmost `X-Forwarded-For` entry instead of the leftmost. Beyond loopback, requests for any hostname other than the public origin's get `421`.

### Added

- `infra/production`: Dockerfile (digest-pinned, multi-stage, non-root), Compose for `/opt/brand-os-studio` (only `172.18.0.1:8083`, read-only, 512 MiB, health check), `.env.example`, `Caddyfile.studio`, `smoke-test.sh`, `backup.sh`, `restore.sh`; root `.dockerignore` allowlist.
- `npm run studio:build` (esbuild bundle); `studio bootstrap-owner` and `studio check-config`.
- `/healthz` reports `503` when the data directory is not writable. The HTTP listener uses a 65 s keep-alive and a 16 KiB header limit.
- Tests: `studio-hardening`, `studio-cli`, `studio-deploy`, `studio-browser-production`; CI workflow `studio-image.yml` (image build, Compose run, smoke test, restore drill).
- Docs: `docs-internal/phase-10/` (architecture, deployment contract, operations, deploy runbook, Grok handoff, Claude editing workflow, security review).

### Fixed

- Studio registry: `studio register` and `unregister` run next to a live server (for example via `docker compose exec`) used to be invisible to the server until restart, and the server's next save, such as a new brand, overwrote them. The registry now reloads the file whenever it changed on disk.

### Not included

- The live launch (VPS, Caddy reload, TLS, owner enrollment, GitHub tokens, test repository). See `GROK_HANDOFF.md`.

## Unreleased — Creative Learning Sprint 2 (agent read path, aspect proposals, Studio decisions)

Guide: `docs-internal/CREATIVE_LEARNING.md`.

### Added

- `creative-read` agent-token profile and the read-only `creative_context` MCP tool (local stdio): approved scoped creative preferences and cited selection/rejection reasons. Drafts and superseded preferences are only counted; verbatim feedback only from shared notes. One access-log line per call.
- `brand:creative aspects suggest|list|approve|reject`: keep/avoid aspects suggested from feedback text by a deterministic fa/en/tr lexicon. Pending until the owner approves with the approval proof; never auto-applied.
- `brand:creative share --id cp_… [--dry-run]`: writes a derived summary of an approved decision to `brand/creative/shared/` for the owner to commit.
- Studio: read-only **Creative decisions** page for merged shared decisions (en/fa/tr).

### Security

- Existing tokens gain nothing; every other profile, guests and other brands are denied `creative_context`. Local note text, drafts, proposals and secret-looking text never reach agents or Studio. Studio admits only `brand/creative/shared/cp_<uuid>.json` under `brand/creative/`.

## Unreleased — Creative Learning MVP (Sprint 1)

Theme: auditable memory of the owner's design choices, built on the Knowledge Inbox. Guide: `docs-internal/CREATIVE_LEARNING.md`.

### Added

- `packages/brand-core/src/creative/` (subpath export `@brand-os/brand-core/creative`): projects, variants, feedback links, selection, scoped preferences with owner approval and supersession, and next-session context with `knowledge:kn_…@<sha256>` provenance.
- `npm run brand:creative` (`scripts/creative.ts`).
- `agent-skills/creative-memory/SKILL.md`.

### Security

- Owner-only: refused under `BRAND_OS_AGENT_TOKEN`; records in gitignored `brand/.private/creative`; restricted notes cannot be linked; brand-wide approval refused; approved facts, ledger and publication state are never written.

## Unreleased — Knowledge Inbox (Baalda-inspired)

Theme: capture messy ideas per brand, find them in fa/tr/en, link them, and turn them into draft proposals without ever bypassing approval. Guide: `docs-internal/KNOWLEDGE.md`.

### Breaking changes

- None. Brands without `brand/knowledge` keep working with zero notes and no flag.

### Security

- Studio's archive filter now blocks every `brand/knowledge/**` path except `brand/knowledge/shared/*.md`, checked before any other rule (it was a blocklist, so committed caches or link files would have reached Studio).

### Added

- `packages/brand-core/src/knowledge/`: note model (`kn_<uuid>`, reader-computed sha256 revision), local-by-default store under `brand/.private/knowledge`, AES-256-GCM restricted notes, revision-checked edits with anchors, per-note locks, snapshots and recovery, idempotent append, archive/restore, fa/tr/en search, links/backlinks/related/duplicates, fail-closed share to Git, doctor and migrate.
- `npm run brand:knowledge` (`scripts/knowledge.ts`).
- `brand:backup` now includes `brand/knowledge`.
- `brand:knowledge propose` / `provenance`: note → draft proposals over the existing intake, with `knowledge:<id>@<sha256>` provenance, stale detection and a preview of every quotation that would enter tracked interview files.
- `knowledge-read` agent-token profile and read-only MCP tools `knowledge_list`, `knowledge_search`, `knowledge_read`, `knowledge_backlinks`, `knowledge_suggest_proposal` (shared notes only). Existing profiles unchanged.
- `agent-skills/knowledge-inbox/SKILL.md`.
- Studio: read-only **Knowledge** section for merged shared notes (labelled unverified ideas), en/fa/tr, filters, search, detail with backlinks and linked questions. No new write route.
- Tests: `knowledge-storage`, `knowledge-search`, `knowledge-security`, `knowledge-cli`, `knowledge-proposals`, `knowledge-agent`, `studio-knowledge`; Knowledge page browser checks in `studio-browser`.

## Unreleased — SVG checker, normalizer and asset approval

Theme: an editor's SVG export should not be silently refused. Brand OS now says what is wrong, fixes what is safe to fix without changing the drawing, and ties asset approval to exact bytes.

### Breaking changes

- `npm run validate` now fails when a present SVG in the asset manifest is not publishable. The message names the problem and, when it is fixable, the command. Run `npm run brand:assets -- check` after a template update.
- The check is stricter in two places: a prefixed XHTML element such as `<h:script>` is now refused (the regex gate missed it), and a non-SVG namespace or an unknown element is refused unless the normalizer can remove it.

### Added

- `checkSvg`: structured, namespace-aware SVG check with codes, lines and `fixable`. Internal `url(#id)` and gradient `href="#id"` references are allowed. A leading XML declaration is allowed.
- `npm run brand:assets -- check | normalize <id> | approve --ids <id>`.
- Normalizer on SVGO 4.1.0 (five plugins, no shape changes), originals kept in `brand/assets-src/`, `derived_from` and `normalizer` in the manifest, a pixel-identical render check (resvg) before an approval is carried.
- Asset approval of exact bytes (`approved_sha256`), with the owner proof rules of the other approval commands.
- Studio names the SVG problem and shows the fix command (en/fa/tr).
- Fixtures from Illustrator, Inkscape and Figma; tests `svg-check`, `svg-assets`, `studio-svg-issues`.
- devDependencies: `svgo` 4.1.0, `@resvg/resvg-js` 2.6.2.

## Unreleased — Phase 9: Read-only Brand OS Studio

Theme: one private place to create brands and see their approved state, while all editing stays in Claude Code. Guide: `docs-internal/STUDIO.md`.

### Breaking changes

- None for brand repositories, the CLI, MCP or the docs build. Studio is a new, optional app.

### Added

- `apps/studio`: private, authenticated, read-only Studio at `/brands/<slug>` with owner sign-in (password and TOTP), the New Brand wizard, provisioning status, Overview, Brand Book, Design System, Assets & Mascot, Business OS, Personal Brand (Phase 8, read-only), History & Review and the GitHub & Claude Code handoff (copy repository URL, copy starter prompt, private-access notice).
- Owner-only provisioning of one private repository per brand from the template using the core initializer, with retries, partial-create cleanup and concurrency locks. This is Studio's only write.
- Read path from the merged default branch with safe archive extraction, projections from brand-core, cached SHA and sync time, stale and error states, and a signed push webhook.
- en, fa (RTL) and tr interface catalogs; light and dark themes; responsive layout.
- `npm run studio:start`, `npm run studio`, `npm run studio:hash-password`, `npm run test:e2e`; `apps/studio/.env.example`.
- Tests: `studio-github`, `studio-provision`, `studio-sync`, `studio-server` and `studio-browser` (real headless Chrome when installed), 205 tests in total.

### Not included

- Server deployment (Phase 10). No Studio is running anywhere because of this change.

## Unreleased — Phase 8: Personal Brand OS

Theme: one engine for people as well as companies. A personal brand is an optional module with combinable facets, explicit relationships to organizations, evidence and rights for public claims, and ten source-backed deliverables. Guide: `docs-internal/PERSONAL_BRAND.md`. Review: `docs-internal/archive/PHASE_8_PERSONAL_BRAND_REVIEW.md`.

### Breaking changes

- None for existing brands. A config without `modules.personal` is treated as disabled, and `brand:migrate` adds the block with `enabled: false`.
- Assets with `subject: portrait | person | case_study | client_logo | testimonial`, or tagged `portrait`, `headshot`, `case-study`, `client-logo` or `testimonial`, are no longer public without a granted, public, unexpired `rights` record.
- The MCP server lists one more tool, `draft_personal_content`. Clients that pin the exact tool list need an update.
- `DocumentItem` has a new `verification` field (null for non-personal items), and `DocumentSection` may carry a `length` report.

### Added

- `brand:init --profile personal-brand --facets <list>` and `--personal true`; `modules.personal { enabled, facets }`.
- Personal question bank (`brand/interview/question-bank/personal.yaml`): identity, positioning, story, experience and credentials, evidence and portfolio, thought leadership and channels, visual presence, privacy and contact, plus founder, consultant, creator, artist and speaker facets. Prompts in English with fa and tr locale data.
- Condition `config.modules.personal.facets has|lacks <facet>` and `config.brand.profile`; `moduleEnabled()` shared by the dashboard, compiled pages and docs build.
- Exclusive interview profiles (`exclusive: true`): questions outside the profile are not applicable for completeness.
- `relationships` structured answer type with relation, dates and ownership state.
- Privacy guard for personal answers, proposals and evidence (`personal-privacy.ts`).
- Evidence and rights register with `brand:evidence list|add|verify|reject|withdraw|check`, publication requirements (`verified_evidence`, `rights_permission`) and `brand:retract`.
- Asset `subject` and `rights` fields in `schemas/asset.schema.json`.
- Documents: `personal-brand-book`, `professional-bio`, `linkedin-pack`, `website-pack`, `media-kit`, `speaker-kit`, `content-strategy`, `portfolio-pack`, `services-pack`, `evidence-register`.
- `draft_personal_content` (MCP and `brand:query`): approved facts for one deliverable, always a draft.
- Personal pages in the docs build (`Personal Brand`, `Approved Personal Book`) when the module is on.
- Tests: `personal-brand`, `personal-evidence`, `personal-documents` and journey D (157 tests in total).

### Changed

- `design`, `marketing` and `finance` agent profiles read only the person-facing personal modules (finance none). Career history, evidence and privacy boundaries are `internal-read` only.
- `factIsPublic`, MCP retrieval and the public claims list re-check evidence, rights and privacy at read time.
- `brand:migrate` adds the personal bank, profile, field-registry and knowledge-graph entries and config block when missing.
- `brand:init` and `brand:reset` clear the evidence register, so a new brand never inherits another brand's evidence.

## 0.2.0 — 2026-11-20

Theme: approved brand truth that agents can actually use. Scoped agent access, an agent-driven interview, batch approval and publication, cited documents and tokens from structured answers, finance and mascot retrieval, end-to-end journeys, and an internal review dashboard.

### Breaking changes

- `brand:approve --proof <secret>` (and any proof on argv) is refused. The proof comes from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt.
- Mascot catalog statuses `not_started` / `draft` / `in_review` fail validation until `npm run brand:migrate` converts them to the lifecycle enum.
- `brand:init --languages` defaults to `en`. Pass `--languages en,fa,tr` to enable the optional Persian and Turkish locales (previously all three were enabled by default).
- `mcp:serve` and `brand:query` exit on an unknown, revoked, or other-brand `BRAND_OS_AGENT_TOKEN` instead of running as guest.

### Final phase

- End-to-end journeys rebuilt in `tests/journeys.test.ts`: A (education app with mascot: English-first CLI init, a labelled localized Persian interview turn, a Turkish locale case, review, batch approval, mascot art, Brand Book and plans, tokens, publication, agent retrieval, guest isolation, change and regeneration), B (B2B without mascot: branching, documents, finance, retrieval, privacy, template upgrade) and C (unauthorized reads and approval, cross-brand tokens, draft and restricted leakage, token drift, invalid assets, stale proposals, interrupted migration, backup corruption, failed model output, prompt injection, missing credentials, invalid extraction). All use temporary brand copies and the mock provider.
- Internal review dashboard: `buildDashboard` in brand-core and a `/dashboard` docs page with coverage per module, the review queue and open contradictions (including intake conflicts). Only internal builds get data; the public build gets a stub, and the navbar links the page only in internal builds.
- Fix: backups now include `brand/migrations.yaml` and `brand/engine.lock`, so restoring a backup also undoes a half-written migration.
- Fix: documents show an approved restricted fact as approved and withheld, not as missing.
- English-first sweep: help text lists `en|fa|tr`, module guidance no longer names Persian first, and the spec's language requirement and sample question are English-first with fa/tr as labelled locale data.
- `docs-internal/archive/CLAUDE_FINAL_REVIEW.md`: what changed, what was not done and why, tests run, unverified areas, required credentials, remaining risks, and scores.
- README: English-first quickstart, change and approval workflow, agent access, languages and locales.

### Earlier phases

- `brand:doctor` checks Node, `BRAND_OS_DATA_KEY` (presence and length only), the approval secret file and its mode, config parsing, the publication policy brand id, and that `.env` is ignored. `--create-approval-secret` creates the secret without printing it.
- `.env.example` documents `BRAND_OS_DATA_KEY`.
- Fix: Persian answers longer than 12 characters are recorded for the current question. Only `note:` starts free-form capture.
- Fix: re-approving an approved fact is refused, and approval versions never reset to 1.
- Fix: fact, ledger, policy, private store, and draft writes are atomic (temp file, fsync, rename).
- Fix: restore validates every path before writing anything.
- `brand:query --include-unapproved` now says it is ignored.
- Audit: `docs-internal/archive/CLAUDE_INDEPENDENT_AUDIT.md`.
- Agent access: `brand:agent-token issue|list|revoke` (needs the owner proof from env or a hidden prompt). Tokens are hashed at rest, bound to one brand, and mapped to a read-only profile: `internal-read`, `design`, `marketing`, or `finance`.
- `mcp:serve` and `brand:query` resolve `BRAND_OS_AGENT_TOKEN` once at startup. They fail closed on an unknown, revoked, or other-brand token.
- New MCP tool `brand_retrieve`. The 17 existing tools now share its retrieval path. Results carry brand id, classification, approval state, revision, source path, and missing ids.
- Restricted values are never returned to agents. Agents only ever receive approved items.
- `brand/.private/access-log.jsonl` records who read which ids, never the values. The public scan rejects token files and raw tokens.
- Review queue: `brand:review --module <id> | --ids <…> [--json]` diffs each draft or pending change against the approved revision and lists impacted documents and questions. `--full` keeps the older recap.
- Batch approval: `brand:approve --module <id> | --ids <id,chg-…>` approves with one proof and reports every item. A wrong proof writes nothing. Stale and competing change proposals are refused, not guessed.
- `brand:publish --ids | --module [--unpublish]` publishes approved public facts only. Approval and publication stay separate. An approved replacement for a published fact is unpublished until published again.
- Breaking: `brand:approve --proof <secret>` is refused. The proof comes from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt.
- Questions may declare `approval_grant`. Validation fails if a restricted question uses anything but `financial`.
- Approval and publication logic moved from `engine.ts` to `approval.ts`.
- Agent-driven interview: `brand:interview --question <any id> --answer … --json` and `brand:next --json`. `brand:next` gives adaptive next questions with reasons, plus conflicts, follow-ups, tentative and unresolved answers, and owner-only restricted questions.
- `brand:propose --file` takes a zod-validated proposal batch. Each item has `question_id`, `value`, `state` (`proposed`/`tentative`/`unresolved`), `confidence`, a verbatim `quotation`, an optional `follow_up` and an optional `correction`. Proposals become drafts with provenance in `brand/interview/intake-log.yaml`. Unknown, restricted, and not-applicable ids are refused, as are invented quotations. A different existing draft becomes a conflict to ask about. A correction to an approved fact becomes a pending change proposal.
- Model provider adapter (`packages/brand-core/src/llm/`) has three providers. `none` is the default. `mock` is deterministic and local. `anthropic` calls the API over fetch and is active only with `llm.provider: anthropic` and `ANTHROPIC_API_KEY`. The adapter has a timeout, input and output limits, and a per-run request budget. Prompts fence owner text as data. Restricted-looking passages are withheld before any provider sees them. Output is schema-validated and goes through the same intake. `brand:interview --assist` falls back to deterministic rules when no provider is configured or the provider fails.
- `note:` capture no longer uses a hardcoded Persian keyword list. It uses locale cue data (en base; fa and tr equal) that also handles mixed-language answers. It keeps tentative and unresolved states, and never stores "unknown" as a value.
- `founder-core` interview profile (40 questions, no restricted ones). `brand.profile` narrows next-question selection. `brand:validate` checks profile files and warns about a profile with no file.
- New skill: `agent-skills/brand-interviewer/SKILL.md` (next → ask → propose → summarize → human approval).
- Structured answer types `color`, `font`, `logo_spec` and `voice_pairs`. Answers are validated and stored as one canonical string (`primary #123A73; surface #FFFFFF`). Persian/Arabic-Indic digits and Arabic-script separators are accepted; role names that become token ids must be ASCII. Founder-core now asks `brand.color.roles` (color), `brand.type.scale` (font), `brand.logo.min_size` (logo_spec) and the new `brand.verbal.voice_pairs`; `brand.type.fallback` and `brand.logo.clear_space` left the profile in their favour (still 40 ids).
- Yes/no words for boolean answers moved to i18n locale data (en base; fa and tr equal).
- `brand:tokens:generate [--dry-run] [--json]` turns approved structured answers into draft DTCG tokens in `brand/tokens/generated/`. Drafts from unapproved answers are never generated. An id already in `brand/tokens/approvals.yaml` is never overwritten; the run reports `refused_approved`. Contrast failures are reported.
- `brand:tokens:approve --ids` records the value hash of generated tokens (EXAMPLE base tokens are refused) and `brand:tokens:publish --ids [--unpublish]` adds hash-approved ids to `approved_token_ids`. Same proof rules as `brand:approve`. Generated tokens are retrievable by agents only after approval, and by guests only after publication.
- Brand Book, business plan summary and marketing plan on one section model (`packages/brand-core/src/documents/`). Each item is tagged `approved`, `assumption`, `recommendation` or `missing` with its source ids. Restricted values are withheld. Public editions carry only approved and published facts. `brand:document --type brand-book|business-plan|marketing-plan [--audience internal|public] [--json]`.
- Docs portal `/brand-book` page: color swatches, type specimens, logo spec and voice do/don't tables, rendered from the audience projection. UI strings are English with fa and tr in `apps/docs/i18n/`; styles use logical properties for RTL.
- Fix: `change <id>: unknown` (and `skip`, `n/a`) marks the disposition instead of storing the word as a draft value. On an approved fact it is refused.
- Finance library (`finance.ts`) and `brand:finance --input <file outside the repo | restricted:<name>>`: CAC, margin-adjusted LTV, LTV:CAC, churn and retention, MRR/ARR, gross profit and margin %, net burn, runway, break-even and scenario projections. Each result carries unit, period, basis (actual/forecast/hypothetical, the weakest of its inputs) and formula, or an explicit missing/invalid/undefined result. Inputs are validated; mixed periods are refused, not converted. Inputs inside tracked directories are refused; `brand/restricted/finance/` is gitignored.
- Mascot lifecycle: catalog `status` is now `defined | pending | created | reviewed | approved | published | deprecated`, on each row and on optional `artwork[]` variants (stage, angle, intensity, outfit, accessories, asset id, preview, animation refs, version, license). `brand:validate` checks the lifecycle against the asset manifest, stages and angles. Breaking: legacy `not_started`/`draft`/`in_review` fail validation until `brand:migrate` converts them (no artwork → `defined`; an `approved` row without artwork is reported and set to `defined`).
- Mascot finder: `brand_retrieve` `kind: mascot` with `filters` (`emotion`, `stage`, `use_case`, `angle`), also `brand:query --kind mascot --emotion … --stage … --use-case … --angle …`. Returns approved or published artwork only, with an explanation of what is missing otherwise. A disabled mascot module is `not_applicable`.

## 0.1.0

First template slice of Brand OS.

- Repository skeleton, Docusaurus portal (English, Persian RTL, Turkish), and local search.
- DTCG token sources with CSS and TypeScript export and contrast checks.
- Twenty brand modules, twelve Business OS modules, optional mascot catalog (90 states, 6 example stages, 8 angles, 15 motions), and optional gamification.
- Interview CLI: one question at a time, ledger, drafts, resume, approval, impact, and restricted-field handling.
- Schemas, validation, tests, and GitHub Actions.
- Agent instructions, ten skills, and a local read-only tool adapter.

Known limits are listed in `docs/IMPLEMENTATION_STATUS.md`. No approved brand facts are included.
