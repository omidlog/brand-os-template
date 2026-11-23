# Assurance: methodology registry and assessable controls (Trust v2 PR-A)

This is a pure library: `packages/brand-core/src/assurance/`, exported as `@brand-os/brand-core/assurance`. It defines which methods Brand OS may cite and at which claim level, one original assessable method with typed controls, and a deterministic evaluator that turns frozen inputs into an assessment.

- **It reads no brand file and writes nothing.** There is no command, route, MCP tool, agent scope, approval or store in this PR. Connecting the evaluator to a real workspace is PR-C, through the existing pinned refs (`strategy/model.ts` `FactRef` / `EvidenceRef`, `strategy/store.ts` `RefState`).
- **It is not a certification, a compliance statement or an independent audit.** The only assessable method is our own rubric. No ISO text is reproduced anywhere.
- **It never takes a brand value.** Inputs are ids, revisions, states and classifications. Outputs are ids, revisions, statuses and reason codes.
- **Human text is en / fa / tr** (`assurance/i18n.ts`); the engine speaks stable English codes only.
- **The only demo data is synthetic** (`assurance/fixtures.ts`), `brand_id: synthetic-demo`, stamped `SYNTHETIC DEMO — NOT A REAL BRAND`.

## Reuse map

| Need | Reused | New |
| --- | --- | --- |
| Pinned source references and staleness | `strategy/model.ts` `FactRef`, `EvidenceRef`, `canonicalJson`, `sha256Hex`; `strategy/store.ts` `RefState` (`current` / `changed` / `missing`) | none: the v2 `PinnedRef` schema is not implemented |
| Audiences | `auth.ts` `Audience` (`public` / `internal` / `restricted`) | none |
| Question ids and sensitivity | the question bank (`content/index.ts` `allQuestions`) | none: controls name existing ids only, and a test fails if one disappears |
| Quotes and evidence text | Knowledge research notes | none: a control cites a note by id and revision; the engine never sees its text |
| Claim ladder, registry, controls, evaluator | — | `claims.ts`, `registry.ts`, `controls.ts`, `assess.ts`, `report.ts` |

## Claim ladder

A method may be cited at the lowest of what it declares, what its rules access allows, what a person verified, and what an attestation supports. Nothing raises a level (`claims.ts` `effectiveClaim`).

| Level | Meaning | Reachable when |
| --- | --- | --- |
| `reference_only` | We named a source. | always |
| `informed_by` | The source shaped our own method. | rules access `reference_only` or better, edition and source checked |
| `mapped_to` | Selected requirements were mapped, with a scope. | rules `authored` or `licensed`, checked |
| `internally_assessed` | We assessed against rules we authored or licensed. | rules `authored` or `licensed`, checked |
| `externally_reviewed` | A named independent reviewer examined a scope. | an attestation of kind `review`, checked |
| `certified` | An accredited body certified a scope and dates. | an attestation of kind `certificate`, checked |

Cap reasons: `no_attestation`, `rules_access`, `edition_unverified`, `source_unverified`. An entry with `edition: null` or `checked_at: null` is always `reference_only`. A certificate held by someone else can be cited, but never makes a standard we hold no rules for assessable (`assessable()`).

The v2 master brief lists `referenced_by` and `externally_assessed`; its own legal taxonomy (doc 09) and schemas use `reference_only` and `externally_reviewed`. This library uses the schema names.

Open PR #25 (Visual P0) carries a different vocabulary (`PermittedClaim`). It is **not** changed here; the reconciliation is proposed in `trust-v2-audit.md` part F.1.

## Methodology registry

`registry.ts`. Template data in code, not under `brand/`, so a brand repository cannot raise its own claim level by editing a file. No edition below was verified against the issuer while writing it, so none is written down.

| `method_id` | Issuer | Kind | Rules access | Declared | Effective today | Edition | Checked |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `brand-os.positioning-readiness` | Brand OS | `original_method` | `authored` | `internally_assessed` | `internally_assessed` | `1` | 2026-11-23 |
| `w3c.prov-o` | W3C | `web_standard` | `reference_only` | `informed_by` | `reference_only` | — | — |
| `w3c.wcag-2.2` | W3C | `web_standard` | `reference_only` | `informed_by` | `reference_only` | — | — |
| `owasp.asvs` | OWASP Foundation | `professional_framework` | `reference_only` | `informed_by` | `reference_only` | — | — |
| `iso.20671` | ISO | `formal_standard` | `unlicensed` | `reference_only` | `reference_only` | — | — |
| `iso.iec.25010` | ISO/IEC | `formal_standard` | `unlicensed` | `reference_only` | `reference_only` | — | — |
| `strategyzer.bmc` | Alexander Osterwalder / Strategyzer | `professional_framework` | `reference_only` | `informed_by` | `reference_only` | — | — |

Every entry blocks the use `certification`. ISO entries also block `compliance_claim`, `clause_reproduction`, `rule_database` and `llm_training`. To lift an open entry to `informed_by`, a person opens the official source, records the edition, `checked_at` and `checked_by`, and the change is reviewed like code.

## Control statuses

Ten statuses, not grades on one scale. Renderers show text and shape, never colour alone.

| Status | Meaning | Blocks the completeness ratio |
| --- | --- | --- |
| `applicable_complete` | Every required approved fact is current and the evidence requirement is met. | no |
| `applicable_partial` | Some, not all, required facts are approved and current. | no |
| `applicable_missing` | No required fact is usable, or there is no evidence at all. | no |
| `not_applicable` | The applicability rule excludes the control. Removed from the denominator. | no |
| `applicability_unknown` | Applicability depends on a subject field answered `unknown`. | **yes** |
| `evidence_insufficient` | Evidence exists but is not enough or not independent, or the inputs are withheld from this audience. | no |
| `conflicted` | A recorded contradiction touches the control. Reported, never averaged. | no |
| `needs_review` | A cited source changed, or a judgment control has no valid reviewer judgment. | **yes** |
| `blocked_by_license` | We hold no right to assess against the method. Neither passed nor failed. | **yes** |
| `not_assessed` | Nothing was resolved for the control. | **yes** |

## Evaluation order

`assess()` checks each control in this order and stops at the first match: licence → applicability → input present → audience (restricted inputs withheld: no sources, no next questions, reason `withheld_for_audience`) → changed source (`needs_review`, no reviewer override) → recorded conflict → reviewer judgment (role from a fixed list that excludes agents, written rationale required) → deterministic facts and evidence.

- **Completeness** is `scoreable` only when no control is `applicability_unknown`, `needs_review`, `blocked_by_license` or `not_assessed`. Otherwise `numerator` and `denominator` are `null`, so no renderer can print a ratio.
- **Evidence quality** is categorical (`independently_verified`, `mixed`, `owner_stated`, `insufficient_evidence`, `not_assessed`) with a coverage count, never a percentage.
- **Maturity** is per domain on an original 0–4 ordinal scale (the weakest observed signal) or `unknown` / `not_applicable` / `insufficient_evidence`. `maturity_aggregate` is always `null`.
- **Reproducibility.** The result pins the method edition, `evaluation_rule_version`, a rule digest (registry entry + controls), a source snapshot digest, the audience and the injected clock. The same input gives byte-identical canonical JSON regardless of input order. The gap report adds its renderer version (`brand-os.gap-report-md/1`).

## Coverage matrix: Positioning Readiness v1

Fifteen controls. Twelve apply to a selling company without paid media; paid media or a person brand changes which. Every question id below is a real id in the question bank (`tests/assurance-controls.test.ts`); this table is checked against the code by `tests/assurance-i18n.test.ts`.

| Control | Domain | Applicability rule | Required questions | Related questions | Evidence | Mode | Criticality | Privacy | Maturity signal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PRR-01 | audience | `always` | `business.customer.primary_segment` | — | — | deterministic | critical | internal | no |
| PRR-02 | audience | `always` | `business.market.geography` | — | — | deterministic | important | internal | no |
| PRR-03 | audience | `always` | — | `business.customer.primary_segment` | ≥ 1 independent | deterministic | critical | internal | yes |
| PRR-04 | offer | `always` | `business.offer.value_proposition` | — | — | deterministic | critical | internal | no |
| PRR-05 | offer | `always` | `brand.strategy.differentiation` | — | — | deterministic | critical | internal | no |
| PRR-06 | offer | `always` | `brand.strategy.promise` | — | — | deterministic | important | internal | no |
| PRR-07 | offer | `sells_something` | `business.sales.pricing` | — | — | deterministic | important | internal | no |
| PRR-08 | proof | `always` | — | `brand.strategy.differentiation` | ≥ 1 independent | reviewer_judgment | critical | internal | yes |
| PRR-09 | proof | `always` | `brand.verbal.forbidden` | — | — | deterministic | important | internal | no |
| PRR-10 | proof | `always` | `business.marketing.availability_claim` | — | — | deterministic | critical | internal | no |
| PRR-11 | governance | `always` | `brand.strategy.decision_rule` | — | — | deterministic | important | internal | yes |
| PRR-12 | governance | `always` | `brand.strategy.purpose` | — | — | deterministic | supporting | internal | no |
| PRR-13 | measurement | `runs_paid_media` | `business.marketing.objective`, `business.marketing.attribution` | — | — | deterministic | important | internal | yes |
| PRR-14 | measurement | `runs_paid_media` | `business.marketing.budget` | — | — | deterministic | supporting | restricted | no |
| PRR-15 | audience | `person_brand` | `personal.positioning.known_for` | — | — | deterministic | critical | public | no |

PRR-14 exists so the absence of a budget envelope is visible. Its fact is restricted: the result is withheld below the `restricted` audience, and the value is never read by the engine.

## Synthetic fixtures

| Fixture | Subject | What it demonstrates |
| --- | --- | --- |
| `baseline` | selling company, no paid media, `internal` | 8 of 12 complete, 3 excluded; two `applicable_missing`, two `conflicted`; owner-stated evidence only |
| `unknown_scope` | paid media `unknown` | two `applicability_unknown`, completeness `not_scoreable` |
| `changed_source` | one cited fact changed | `needs_review`, completeness `not_scoreable` |
| `restricted` | paid media `yes`, `internal` | PRR-14 withheld (`evidence_insufficient`, `withheld_for_audience`, no sources) |

## Tests

| File | Covers |
| --- | --- |
| `tests/assurance-registry.test.ts` | registry invariants, the ladder never rises, ISO stays a reference, attestations by kind, assessability |
| `tests/assurance-controls.test.ts` | control invariants, real question ids, privacy classification ≥ question sensitivity, applicability with `unknown` |
| `tests/assurance-assess.test.ts` | fixture results, determinism and order independence, changed-source invalidation, withheld inputs, a privacy canary, reviewer rules, distinct findings, licence block |
| `tests/assurance-i18n.test.ts` | every emitted code has en/fa/tr text, the gap report in three languages, the demo banner, no ratio when not scoreable, this coverage matrix matches the code |

## Not built here

Evidence lineage over a real workspace (PR-B), a CLI that assesses a real brand (PR-C), any Studio view (PR-D), decision records (PR-E), PDF reports and manifests (PR-F), verification and expert review (PR-G), journeys, connectors and roles (PR-H). The plan and the reasons are in the owner's notes, `trust-v2-audit.md`.
