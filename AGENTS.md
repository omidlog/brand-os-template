# Agent instructions

This repository is a Brand OS template. It does not contain an approved brand. Treat every EXAMPLE, DRAFT, and TBD as unapproved.

## Source priority

1. Approved facts in `brand/instance/approved-facts.yaml`, and only those.
2. The question that owns a field. Do not create a second persona, price, or positioning.
3. Drafts in `brand/generated/drafts/` and `brand/restricted/drafts/`. Drafts are not rules.
4. Module guidance under `brand/content` and `brand/business-os`. Guidance is how to fill the system, not this brand's decisions.
5. DTCG tokens in `brand/tokens`. They are EXAMPLE until a person approves them.
6. The mascot catalog in `brand/mascot`. Rows without `source_assets` have no artwork.

If a file disagrees with an approved fact, the approved fact wins until a person accepts a diff.

## How to look something up

- Stable ids live in `brand/interview/field-registry.yaml`, `brand/mascot/catalog.yaml`, and `brand/assets/asset-manifest.yaml`.
- `npm run brand:query -- --tool get_brand_status` returns coverage and approval without answer values.
- `npm run brand:query -- --tool get_brand_tokens` returns only tokens that are hash-approved and published. EXAMPLE values are never returned. `--include-unapproved` is ignored and grants nothing.
- `npm run brand:query -- --tool list_mascot_assets` returns no rows until artwork is approved.
- `brand:query` and the MCP server run as a guest. On a brand with `publish_docs: private` every tool returns `denied`. That is expected, not a bug to work around.
- Read `examples/agent-requests.md` before designing a post or a mascot screen.

## What you must not do

- Do not invent a name, color, price, metric, legal status, customer, or character.
- Do not mark a missing asset approved. `present: false` means the file is absent.
- Do not paste restricted values into public docs, issues, or tool replies. Restricted drafts live under `brand/restricted/`.
- Do not rewrite an approved field in place. Run the interview change flow so the owner sees the diff and the impacted ids.
- Do not translate an approved brand sentence into another language unless that translation is itself approved.
- Do not assume you can see this private repository, Figma, or a hosted MCP server. Access is described in `docs-internal/AI_CONNECTORS.md`.

## Interview

`npm run brand:interview` asks one question. `unknown`, `skip`, `not relevant`, and `decide later` are real answers and must not be filled in. `npm run brand:resume` continues from `brand/interview/session-state.yaml`.

Approval is `npm run brand:approve -- --question <id> --proof <secret>`. `--actor owner` alone is rejected. The proof file is `brand/.private/approval-secret` and is not committed. Finance and restricted fields need the finance or owner role plus that proof.

## Commands

`npm run lint`, `npm run typecheck`, `npm run validate`, `npm run test`, and `npm run build`.
