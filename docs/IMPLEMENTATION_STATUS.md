# Implementation status

Honest checklist for template version 0.1.0. “Done” means the command or file exists and the tests or the docs build exercise it. “Partial” means a real subset ships and the rest is named here. “Not started” means there is no working feature, only a document.

## Done

- Repository skeleton, MIT license for the engine, `.gitignore`, `.env.example`, Git LFS attributes for large masters (no large masters are committed).
- `npm run lint`, `npm run typecheck`, `npm run validate`, `npm run test`, and `npm run build` (Docusaurus for `en`, `fa`, and `tr`).
- Public docs build and a second build with mascot and gamification off.
- Persian locale sets `dir="rtl"`. Light and dark theme. Local search plugin (English index).
- DTCG token sources, CSS and TypeScript export, contrast checks that pass for the EXAMPLE pairs.
- Twenty brand modules and twelve Business OS modules with purpose, guidance, fields, an EXAMPLE, do/don't, and a checklist.
- Optional mascot catalog: 90 states (20/20/15/15/10/10), 25 MVP flags, 6 example stages, 8 angles, 15 motion briefs. Explorer page filters them. Previews are empty.
- Optional gamification module, hidden when disabled.
- Asset manifest with three real placeholder SVGs and one missing turnaround.
- Interview: one question at a time, ledger, draft documents, resume, unknown/skip/not applicable/later, suggestions from the question bank, approval by role, impact before changing an approved answer, restricted values kept out of public files.
- `brand:init` resets one brand's ledger without reading another brand's directory.
- Education and B2B example fixtures.
- `AGENTS.md`, `CLAUDE.md`, five skills, `brand/brand-manifest.json`, `llms.txt`.
- Local query tools and a stdin JSON-RPC tool adapter.
- GitHub Actions validate workflow and a manual docs artifact workflow.

## Partial

- Question bank is a starter set (at least five questions per module, more on company, product, and strategy). It does not collect every phrase in the specification as its own field.
- “Suggest options” returns authored examples. It does not call a language model.
- `import existing: <url>` stores the citation and does not download or extract the page.
- Figma support is a local variable-name snapshot, not the Figma API.
- The MCP adapter is a local process. It has no OAuth and no hosted URL.
- Docs body copy is English inside the Persian and Turkish locales. Direction and `htmlLang` are set. Search stemming is English.
- Product UI is an index plus one EXAMPLE button, not a shippable component package.
- Business numbers are not calculated. The finance module refuses to invent them.
- Mascot and gamification visuals are data and pages, not illustration or animation files.
- Template upgrade is documented. There is no automated migration that merges a newer engine into a filled brand repo.

## Not started

- Live Figma read or write.
- Hosted, authenticated MCP for ChatGPT or another product.
- Fetching PDFs, decks, or websites into the ledger.
- A product application that consumes the tokens as a real UI kit.
- Licensed font files.
- Persian or Turkish full-text stemming.
- Notion sync.

## Verification run with this commit

Commands that passed locally while preparing 0.1.0:

- `npm run lint`
- `npm run typecheck`
- `npm run validate`
- `npm run test` (8 tests)
- `npm run build -w @brand-os/docs` for the default module set, including `en`, `fa` (`dir="rtl"`), and `tr`
- `npm run build:docs:nomascot` (43 docs copied, 8 excluded)

No restricted canary was found in the docs build output.
