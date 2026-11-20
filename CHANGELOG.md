# Changelog

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
- `docs-internal/CLAUDE_FINAL_REVIEW.md`: what changed, what was not done and why, tests run, unverified areas, required credentials, remaining risks, and scores.
- README: English-first quickstart, change and approval workflow, agent access, languages and locales.

### Earlier phases

- `brand:doctor` checks Node, `BRAND_OS_DATA_KEY` (presence and length only), the approval secret file and its mode, config parsing, the publication policy brand id, and that `.env` is ignored. `--create-approval-secret` creates the secret without printing it.
- `.env.example` documents `BRAND_OS_DATA_KEY`.
- Fix: Persian answers longer than 12 characters are recorded for the current question. Only `note:` starts free-form capture.
- Fix: re-approving an approved fact is refused, and approval versions never reset to 1.
- Fix: fact, ledger, policy, private store, and draft writes are atomic (temp file, fsync, rename).
- Fix: restore validates every path before writing anything.
- `brand:query --include-unapproved` now says it is ignored.
- Audit: `docs-internal/CLAUDE_INDEPENDENT_AUDIT.md`.
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
