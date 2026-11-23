# Visual documents (Visual Blueprint P0)

Studio and the print view draw purpose-built visuals from one semantic view model instead of generic text cards. This first slice has one framework: the **business model canvas**.

Core: `packages/brand-core/src/visual/` (`@brand-os/brand-core/visual`). Studio: `apps/studio/src/views/visual.ts` (renderer), `views/visual-page.ts`, `routes/visual.ts`, `static/visual.css`, `static/visual.js`. Tests: `tests/visual-bmc.test.ts`, `tests/studio-visual.test.ts`, `tests/studio-visual-browser.test.ts`.

## Rules

- **One truth path.** The canvas is built through `documents/model.ts` `itemFor`, exactly like the Brand Book: approved facts, labelled owner drafts, missing answers, restricted values withheld. The public edition shows only approved, public, published facts. There is no new store and nothing is written.
- **No invented content.** A zone with no question (key activities, key resources) is a designed gap; the proposed question id is listed under **Details and sources**. Links between segments, offers, channels and revenue are not drawn, because the bank stores one prose answer per field (`relationships.modeled: false`).
- **Language-neutral document.** Values stay as approved and are never translated. Labels, prompts and states come from `visual/i18n.ts` (en/fa/tr). The canvas keeps its canonical left-to-right topology in Persian; text inside zones is right-to-left.
- **Claims.** The framework reference says *informed by*, with the licence status under review. Nothing says certified, compliant or official. The layout is original Brand OS geometry, not Strategyzer artwork.
- **Screen and print from the same document.** The print view (`/visual/print`) is a static A3-landscape composition: page one the canvas, page two sources, states, framework and next questions. Saved as PDF from the browser. Not labelled print-ready: no bleed, colour profile or PDF/X claim.
- **Golden examples** use the fixture in `visual/fixtures.ts`, stamped ILLUSTRATIVE / MOCK DATA on every page and never read from or written to a brand. `npm run visual:golden [-- --out dir] [--no-pdf]`.

## Renderer registry, primitives and framework registry (V1.1)

- **Renderer registry** `apps/studio/src/views/visual-registry.ts`: one renderer per `VisualBlock['type']`, typed so a new block type without a renderer fails the type check. Compositions call `renderBlock`.
- **Shared primitives** `apps/studio/src/views/visual-primitives.ts`: state chip, legend, ghost geometry (`lines`, `swatches`, `specimen`, `mark`), source footnote (plain label, version, date; never a field id), topology mini-map. Every block uses these instead of its own copy.
- **Framework registry** `.brand-os/frameworks.yaml` (template-owned) with `schemas/framework-registry.schema.json`. `npm run validate` checks the schema and the claim rules (`visual/framework-registry.ts`): no `externally_certified`; `aligned_with` / `verified_against` need `verified_on`; `original_professional_template` only for Brand OS layouts; no certification or compliance wording. Metadata only, never a fact. Renderers read the copy that ships with the template code (`frameworkRef(id)`).

## Adding a visual

1. Add a block type to `visual/model.ts` (additive; bump nothing unless an existing field changes meaning).
2. Build it from existing facts through `itemFor` (or another existing projection). If it needs data Studio cannot see (anything under `brand/.private`), it is not a Studio visual yet.
3. Add the framework to `.brand-os/frameworks.yaml` if it cites one. Add en/fa/tr text, a renderer registered in `views/visual-registry.ts` (built from `visual-primitives.ts`), an illustrative fixture and tests for every state, and a browser check at five widths plus a printed PDF.

## Reading layer

The canvas cells carry only the reading: standard zone title, the canonical prompt and the entries with their state. Question ids, next questions, related answers, the edition note, the framework and the links note sit in a closed **Details and sources** disclosure under the canvas on screen, and on page 2 of the print view. Page 1 of the print view carries no technical id.
