# Architecture

Brand OS is one repository per brand. Business OS is the `brand/business-os/` tree inside it. The template engine (packages, scripts, docs app) is separable from brand answers (`brand/instance`, `brand/interview`, `brand/generated`).

## Pieces

| Piece | Role |
| --- | --- |
| `packages/brand-core` | Question bank generator, interview engine, completeness, contradictions, permissions |
| `packages/design-tokens` | DTCG compiler to CSS and TypeScript, WCAG contrast |
| `packages/asset-catalog` | Manifest checksums |
| `apps/docs` | Docusaurus 3 portal |
| `brand/` | Content, tokens, mascot catalog, assets, interview state |
| `schemas/` | JSON Schema draft-07 |

## Decisions

See `docs-internal/adr/0001-stack.md` and `docs-internal/adr/0002-tokens.md`.

## Visibility

`public` pages can be deployed. `internal` pages are included only when `DOCS_AUDIENCE=internal` or `--audience internal`. `restricted` answers are written under `brand/restricted/` and are not copied into any docs build.

## Interview data flow

A command stores an append-only ledger row, updates `brand/instance/draft-facts.yaml` (restricted values replaced with a marker), updates the field block in the related draft, and refreshes `contradictions.yaml`. Approval copies a non-secret view into `approved-facts.yaml` and records the actor. Changing an approved answer requires confirmation and withdraws the approval first.

## What is not in this version

Live Figma API, a hosted MCP server, automatic translation of brand claims, and fetching imported URLs. Those are specified as next steps in `docs/IMPLEMENTATION_STATUS.md`.
