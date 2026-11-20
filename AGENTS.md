# Agent instructions

This repository is a Brand OS template. It does not contain an approved brand. Treat every EXAMPLE, DRAFT, and TBD as unapproved.

## Source priority

1. Approved facts in `brand/instance/approved-facts.yaml`, and only those.
2. The question that owns a field. Do not create a second persona, price, or positioning.
3. Drafts in `brand/generated/drafts/` and `brand/restricted/drafts/`. Drafts are not rules.
4. Module guidance under `brand/content` and `brand/business-os`. Guidance is how to fill the system, not this brand's decisions.
5. DTCG tokens in `brand/tokens`. They are EXAMPLE until a person approves them. Tokens in `brand/tokens/generated/` come from approved answers but are still drafts until their hash is approved (`brand:tokens:approve`, a human step).
6. The mascot catalog in `brand/mascot`. Rows without `source_assets` have no artwork.

If a file disagrees with an approved fact, the approved fact wins until a person accepts a diff.

## How to look something up

- Stable ids live in `brand/interview/field-registry.yaml`, `brand/mascot/catalog.yaml`, and `brand/assets/asset-manifest.yaml`.
- `npm run brand:query -- --tool get_brand_status` returns coverage and approval without answer values.
- `npm run brand:query -- --tool get_brand_tokens` returns only tokens that are hash-approved and published. EXAMPLE values are never returned. `--include-unapproved` is ignored and grants nothing.
- `npm run brand:query -- --tool list_mascot_assets` returns no rows until artwork is approved.
- `npm run brand:query -- --tool brand_retrieve --kind mascot --emotion <e> --stage <id|order> [--use-case <u>] [--angle <a>]` finds approved mascot artwork or explains what is missing. Never substitute a different state.
- `brand:query` and the MCP server run as a guest unless the owner started them with `BRAND_OS_AGENT_TOKEN`. As a guest on a brand with `publish_docs: private`, every tool returns `denied`. That is expected, not a bug to work around. Ask the owner for a token; do not look for one in `brand/.private`.
- With a token, `brand_retrieve` (or `npm run brand:query -- --tool brand_retrieve --kind facts --module <id>`) returns approved facts for your profile. Items marked `withheld` have no value. Do not guess them. Restricted values are never returned to agents.
- You cannot pass a token, role, or audience as a tool argument. You cannot issue tokens, approve, or publish.
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

An agent can run the interview as a conversation. Follow `agent-skills/brand-interviewer/SKILL.md`. In short:

- `npm run brand:next -- --json` returns the next questions with reasons, plus conflicts, follow-ups, and owner-only questions.
- `npm run brand:interview -- --question <id> --answer "…" --json` answers any question in any order.
- `npm run brand:propose -- --file batch.json --json` stores extracted proposals as drafts. Each proposal needs a verbatim quotation and a state: `proposed`, `tentative`, or `unresolved` with value `null`.
- `npm run brand:interview -- --assist --file - --json` runs the built-in extractor. It uses a configured model, or deterministic rules if none is set.

All of these produce drafts only. Restricted questions are refused: the owner answers them in the interactive interview. `brand.profile: founder-core` in `brand/brand.config.yaml` narrows the interview to about 40 questions.

Approval is a human step: `npm run brand:review -- --module <id>`, then `npm run brand:approve -- --module <id>` (or `-- --ids <id,chg-…>`). The proof comes from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt; `--proof` on the command line is refused, and both commands refuse to run while `BRAND_OS_AGENT_TOKEN` is set. `--actor owner` alone is rejected. The proof file is `brand/.private/approval-secret` and is not committed. Finance and restricted fields need the finance or owner role plus that proof. Publication is a separate command, `npm run brand:publish -- --ids <id>`, and accepts only approved public facts. An agent never approves or publishes; it stops and hands the ids to a human.

## Commands

`npm run lint`, `npm run typecheck`, `npm run validate`, `npm run test`, and `npm run build`.
