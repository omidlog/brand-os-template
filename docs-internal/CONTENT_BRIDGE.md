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
