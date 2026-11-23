# Content Bridge: approved voice and strategy for content agents

The Content Bridge gives every content or publishing agent (Instagram, X, LinkedIn, a newsletter writer, a Creative
Director) one source for the brand: its approved voice, audience, messaging, pillars, offers and approved strategy. It is
built in four slices, one PR each:

| Slice | What | State |
| --- | --- | --- |
| A | `content` strategy type, `brand:content strategy` proposer, voice rules projection | this guide |
| B | Calendar planner and per-week owner approval, read-only Studio page | not started |
| C | `content_calendar` / `content_brief` agent tools through the existing gates | not started |
| D | `content-planner` skill and integration guide | not started |

Brand OS plans and governs. It never posts, schedules or publishes, and approving a content strategy authorizes nothing
(`authorizes: []`).

## Preflight reuse map (against main `9861920`)

Every structure below names what it reuses and why it is not a parallel source of truth.

| Existing module | Reused for | New small type | Why it is not a second truth | Tests |
| --- | --- | --- | --- | --- |
| `facts.ts` `readFacts` (approved, `revision_hash`, `classification`) | Voice, audience, messaging, pillars, channels, offers, CTA, claims and language facts. The proposer reads them; the projection resolves their approved value at read time. | none | Fact values stay in `approved-facts.yaml`. A strategy stores fact ids pinned to `revision_hash`, never a copy of the voice. A changed fact turns the strategy `needs_review`. Restricted facts are refused. | `content-strategy` |
| `content/*-modules.ts` question bank | The fixed source catalog (which fact ids feed which role). | `CONTENT_SOURCES` (ids only) | It names existing question ids; no question is added or copied. | `content-strategy` |
| `structured.ts` `parseStructured('voice_pairs')` | Do/don't pairs in the projection. | none | Parsed from the approved fact on every read. | `content-strategy` |
| `strategy/` `StrategyRecord` / `StrategyRevision`, `proposeRevision`, `reviewRevision`, `approveRevision`, `evaluate` (Sprint 3) | The content strategy **is** a strategy record of a new type, `content`, with one optional typed block, `content_strategy`. | `ContentStrategyBlock` | Same store (`brand/.private/strategy/records/`), same immutable revisions, same hash-bound owner approval with HMAC seal, same `needs_review` / `expired` / `integrity_failed` checks, same `brand:strategy review/approve/reject/withdraw`. No new store and no new approval path. | `content-strategy`, existing `strategy-*` |
| Strategy Feed (`feed.ts`) | Untouched for agents in Slice A: no profile reads `content`, so every agent gets nothing. Slice C adds a profile and tools through the same `strategyAccess` / access-log pattern. | none | Same gate; the projection reuses the feed's `servable` rule (only `current` / `review_due`). | existing `strategy-feed` |
| Approved SEO / paid-media strategies | A content strategy may pin them (`strategy_refs: {strategy_id, revision, content_sha256}`). | `StrategyRef` | Pins, like fact refs. If the cited strategy is replaced or stops being served, the content strategy turns `needs_review`. | `content-strategy` |
| Knowledge Inbox (`kn_…@sha256`) | `evidence_refs` of the strategy, unchanged. | none | Notes are never copied. | existing |
| `documents/marketing-plan.ts` | Same fact selection for messaging, channels and guardrails. | none | The marketing plan is a rendered document; the content strategy is the approved, pinned decision layer that cites the same facts. | — |
| `competitive/` `buildCompetitiveMemo(ws, 'marketing')` (Identity Slice C) | Not used in Slice A. Slice B/C cite its observation ids for the per-slot "competitive angle". | none | Quotes stay in Knowledge research notes; the memo is a projection. | Slice B/C |
| `creative/` approved scoped preferences, `creativeContext` | Not used in Slice A. Slice C adds applicable approved preferences to a content brief by id. | none | Preferences stay in Creative Learning. | Slice C |
| `auth.ts`, `agent-tokens.ts`, `access-log.ts`, stdio MCP, `brand:query` | Not used in Slice A (owner-only CLI). Slice C reuses them. | none | — | Slice C |
| `identity/i18n.ts` pattern | en/fa/tr catalogs for generated proposal text, gap messages and projection labels. | `content-bridge/i18n.ts` | Text catalog only. | `content-strategy` |
| Template sync / migrations | Nothing to migrate: the new type and block are optional; old revisions hash the same (an absent key is not hashed). `brand/**` stays brand-owned. | none | — | existing `template-sync`, `strategy-store` |

Not reused, on purpose: `business.marketing.budget` and other `restricted` facts. They are never cited by a content
strategy and never projected.

## Layers (one truth per layer)

1. **Approved facts** hold the voice, audience, messaging, pillars, channels and claims.
2. **Content strategy** (Slice A) holds the decisions facts do not: which pillars, the role, formats and cadence of each
   channel, content languages, owner-written extra rules, and explicit gaps. It cites facts; it does not restate them.
3. **Content calendar** (Slice B) will cite the approved content strategy revision.
4. **Content brief** (Slice C) will be a read-only projection of 1–3.

## Slice A: the content strategy record

### Data model

A content strategy is a `StrategyRevision` with `type: "content"` and a `content_strategy` block
(`packages/brand-core/src/strategy/model.ts`, `parseContentStrategy`):

| Field | Meaning |
| --- | --- |
| `languages` | Content languages (locale codes). Default: the brand default locale. |
| `pillars[]` | `{id, name, fact_refs}`. Each pillar must cite at least one approved fact. |
| `channels[]` | `{channel, role, formats, cadence, languages, pillars, fact_refs}`. `role` and `cadence` are `null` until the owner decides; `formats` from `reel, carousel, post, thread, story, article, email, short_video, video, live`. |
| `sources` | Approved fact ids per role: `voice, claims, audience, messaging, pillars, channels, offers, cta, languages, objective`. Values are never copied. |
| `voice_rules`, `vocabulary`, `banned_claims`, `cta_rules` | Owner-written additions. The proposer leaves them empty. |
| `strategy_refs[]` | Pinned approved SEO / paid-media revisions `{strategy_id, revision, content_sha256}`. |
| `gaps[]` | `{field, reason, fact_ids}`, reason `not_approved`, `placeholder` or `owner_decision`. Kept in the approved revision. |

Rules enforced on `propose`:
- Every fact id in the block must be in the revision's `fact_refs` (pinned to `revision_hash`).
- Restricted facts are refused (`business.marketing.budget` and anything classified `restricted`).
- A cited strategy must be the revision served now; only SEO and paid-media strategies can be cited.
- Unknown keys are refused at every level; text goes through the same safety check as every strategy (no money, credentials, personal data or placeholders).

Status at read time is the Sprint 3 evaluation plus one check: a cited strategy that is replaced or no longer served
makes the content strategy `needs_review`, like a changed fact.

### Proposer (`brand:content strategy`)

`buildContentStrategy` (`packages/brand-core/src/content-bridge/propose.ts`) reads the fixed source catalog
(`sources.ts`, `CONTENT_SOURCES`; personal-brand facts only when `modules.personal.enabled`):

- A role with no approved fact is a `not_approved` gap naming the questions to answer. A fact whose approved value says
  `TBD`, `none`, `unknown`, `نامشخص` or `henüz yok` is a `placeholder` gap. Nothing is assumed in its place.
- Pillar names are split from the approved pillars fact (lines, `;`, bullets, short comma lists) and cite it. If it
  cannot be split into short names, the owner names them (`owner_decision`).
- Channels: `--channels` if given; otherwise channels named in affirmative clauses of approved channel facts. A clause
  with a negation ("not TikTok", "no paid social", "YouTube later", "بدون", "değil") is skipped. A note says which
  channels were detected.
- Every channel gets `owner_decision` gaps for role, and for formats and cadence unless `--formats` / `--cadence` give
  them. Cadence is never guessed.
- Currently served SEO and paid-media strategies are pinned.
- The generated title, objective, rationale, guardrails and non-goals are fixed process text in en/fa/tr. They say
  how the strategy works, never how the brand sounds.

It writes nothing. `--out` writes the proposal file (never overwrites), `--store` stores it as a draft through
`proposeRevision`.

### Voice rules projection (`brand:content show`)

`contentStrategyView` (`projection.ts`) returns `brand-os/content-strategy-view/v1` for every content strategy whose
approved revision is servable now (the Strategy Feed's `servable` rule: `current` or `review_due`):

- `voice.sources`, `audience`, `messaging`, `offers`, `objective`, `language_sources`: the approved fact values, read now.
  A served strategy has every cited fact at its pinned revision, so this is exactly what the owner approved.
- `voice.do` / `voice.dont`: from `brand.verbal.voice_pairs` plus owner-written rules, each with its source.
- `claims.banned`: split from `brand.verbal.forbidden` plus owner-written claims; `claims.availability_rule` from
  `business.marketing.availability_claim` (en/fa/tr).
- `gaps` with en/fa/tr text, `digests.view_sha256` (deterministic), `authorizes: []`, `publication_permission: false`.
- Drafts, rejected, superseded, withdrawn and stale revisions are only counted under `withheld`.

It is owner-only in Slice A (refused under `BRAND_OS_AGENT_TOKEN`). Slice C exposes it to content agents through the
existing token profiles, MCP tools and access log.

### Owner workflow

```bash
npm run brand:content -- strategy                          # gap report, nothing written
npm run brand:content -- strategy --channels instagram,linkedin \
  --cadence instagram=3/week --formats instagram=reel+carousel --out content.json
# edit content.json: channel roles, extra rules, pillar names
npm run brand:strategy -- propose --id content-main --file content.json
npm run brand:strategy -- review  --id content-main --revision 1
BRAND_OS_APPROVAL_PROOF=… npm run brand:strategy -- approve --id content-main --revision 1 --expect-sha <sha256>
npm run brand:content -- show [--lang fa|tr]
```

### Tests

| Behaviour | Test |
| --- | --- |
| Missing facts become explicit gaps (en/fa/tr); nothing written; no voice invented | `content-strategy` "missing facts…" |
| Placeholder facts are gaps; restricted facts never cited; budget canary absent | `content-strategy` "placeholder facts…" |
| Pillars from the fact, negated channels skipped, voice cited not copied | `content-strategy` "approved facts become cited sources…" |
| Approved v1 visible, draft v2 invisible until approved, then v2 served; changed fact → `needs_review` | `content-strategy` "approved v1 is visible…" |
| No agent profile reads `content`; block only on `content`; old hashes unchanged | `content-strategy` "no agent reads…" |
| Pinned SEO strategy replaced → `needs_review`; stale pin refused | `content-strategy` "a cited SEO strategy…" |
| CLI journey with proof-gated approval through `brand:strategy` | `content-cli` |

### Limits (Slice A)

- No calendar, no per-slot brief and no agent read path yet (Slices B and C).
- Channel detection reads wording; the owner checks the detected list before approving.
- Approved fact text is shown as written; the projection does not translate it. Gap and rule text is en/fa/tr.

## Slice B preflight reuse map (against main `06ac484`)

Written before any Slice B code. The calendar adds one small store (per-week records), because no existing store
holds dated slots. Everything else is reused.

| Existing module | Reused for | New small type | Why it is not a second truth |
| --- | --- | --- | --- |
| `content-bridge/projection.ts` `contentStrategyView` (Slice A) | The planner's only input: the served content strategy (pillars, channels, cadence, formats, languages, source fact ids, banned claims, availability rule). | none | The planner never reads facts or drafts on its own. It pins the served revision (`strategy_id`, `revision`, `content_sha256`). |
| `strategy/feed.ts` `servable`, `strategy/store.ts` `factState`, `evidenceState`, `assertOwnerProcess` | Week status at read time: the pinned strategy must still be the one served, every cited fact at its `revision_hash`, every research ref at its revision. | none | Same rules as strategies: a change makes the week `needs_review`, never silently re-pointed. |
| `strategy/model.ts` `canonicalJson`, `sha256Hex`, `approvalSeal`, `newApprovalEventId`, `RevisionEntry`, `StrategyApproval`; `store.ts` `requireProof` | Week revisions are immutable and hashed; approval is owner proof + `--expect-sha` + HMAC seal keyed by the same approval secret. | `ContentWeekRecord`, `ContentWeekRevision` (same entry and approval shapes) | No new approval scheme. The seal gets its own domain string so a week approval can never verify as a strategy approval. |
| Knowledge `withLock`, `writeVaultFile`, `safeRead`, `dirUsable`, `ensureDir` | Atomic 0600 writes under `brand/.private/content/calendar/<week_id>/` and a per-week lock. | none | Same private, git-ignored area as strategies; never in Studio, docs builds or exports. |
| `competitive/memos.ts` `buildCompetitiveMemo(ws, 'marketing')` (Identity Slice C) | Optional research angles (`--research`): observation id, its `knowledge:kn_…@sha256` ref and a confidence label from the cell state. | `SlotResearch` | Quotes stay in Knowledge research notes; a slot cites the observation, never its text. |
| `creative/share.ts` (`brand:creative share`, `buildStudioCreative`) | Studio pattern: the owner explicitly shares a derived summary of an approved week to a tracked file; Studio reads only that file from the merged commit, strictly validated. | `SharedContentWeek` | The shared file is a derived copy with ids and dates, labelled as of `shared_at`; the private week record stays the truth. |
| `apps/studio` tar allowlist, projection, sync, brand sections, views, i18n | Read-only "Content calendar" page. | `StudioCalendarProjection` | No new non-GET route. |
| `content-bridge/i18n.ts` | en/fa/tr for gaps, CLI lines, notices and conflict messages. | more catalog keys | Text only. |
| Template sync / migrations | Nothing to migrate: new folders only, `brand/**` stays brand-owned. | none | — |

Not reused, on purpose: `brand:strategy` records for weeks. A week is not a strategy (no agent profile, validity
window or recommendations), and putting weeks in the strategy store would make them visible to the Strategy Feed scan.
