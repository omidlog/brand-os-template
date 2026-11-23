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
- **Framework registry** `packages/brand-core/src/visual/frameworks.json` (template-owned, bundled into the production Studio image) with `schemas/framework-registry.schema.json`. `npm run validate` checks the schema and the claim rules (`visual/framework-registry.ts`): no `externally_certified`; `aligned_with` / `verified_against` need `verified_on`; `original_professional_template` only for Brand OS layouts; no certification or compliance wording. Metadata only, never a fact. Renderers read the copy that ships with the template code (`frameworkRef(id)`).

## Brand Book "Visual identity" chapter (V2.1)

`visual/identity.ts` builds a `visual_identity` document from three facts and the asset manifest: `brand.color.roles`, `brand.type.scale`, `brand.logo.min_size`, plus the master asset. Rules:

- **Approved only.** A plate is drawn from an approved fact (or approved and past review, labelled stale). A draft or withheld value is not even carried in the document (`value: null`); the plate shows the designed "awaiting approved asset" page with the reason and, for the owner, the next step.
- **Master asset.** The logo plate needs an approved (status `approved`/`published`), checksummed, previewable, non-example manifest asset tagged `logo` (published, for the public edition). Template example placeholders and draft-status files never count. Which one is the master is resolved in this order, never guessed: (1) an asset named in the approved `brand.logo.masters` answer by its exact asset id or exact manifest `path`/`preview` (whole-token match; first named wins); (2) an asset tagged `master`; (3) the only approved logo. Several approved logos with none named or tagged give the designed `ambiguous` state, which asks the owner to name the master in `brand.logo.masters`. Status is authoritative: a `draft` tag on an approved file does not block it, but the internal edition shows "Tagged draft" (and "Internal · not published" when it is not published) next to the master; the public edition never does. The file is shown through the existing asset route; its proportions come from the SVG viewBox or PNG header, otherwise a square frame is drawn and the note says so.
- **Measured contrast.** Ratios are computed with the WCAG 2 formula (`@brand-os/design-tokens` `contrastRatio`), compared exactly, displayed rounded down. Combinations are only those the role names declare (`onPrimary` on `primary`); the grid measures every pair up to ten colours. A ratio is not an accessibility audit.
- **Type.** Specimens are SVG text at true CSS-pixel size. A family Studio bundles (Inter, Rajdhani, Vazirmatn, all OFL) is drawn with the bundled file; other families render if installed on the device, otherwise the fallback. Persian lines fall back to Vazirmatn.
- **Layout.** Editorial book: chapter opener with contents, numbered plates, hairline rules. The print view uses a named A4 portrait page (`@page vz-book`) on the existing browser print path; the V1.2 book engine (page-numbered TOC, running heads) is not built.

## Mascot atlas and six-stage evolution sheet (V3.4)

`visual/mascot.ts` builds a `mascot_atlas` document (blocks `mascot_atlas`, `mascot_evolution`) from `brand/mascot/catalog.yaml`, `brand/mascot/stages.yaml` and the asset manifest. Nothing is generated, traced or inferred. Rules:

- **Approved artwork only.** A state or stage is drawn only when the catalog row and the artwork variant are `approved`/`published` and the asset is approved, checksummed, previewable and not a template example. The file is shown through the existing asset route. Usage, do and don't notes travel only with a drawn state.
- **Drafts.** Artwork that is `created`/`reviewed` (or approved artwork on an unapproved row or asset) is never drawn. The internal edition names the state under "Not yet drawn" with "Artwork in review, not approved"; the public edition does not mention it.
- **Public edition.** Needs the artwork and the row `published`, the asset published (publication policy), and no `draft` tag on the file. A draft-tagged file stays hidden from public view until it is published without the tag; the internal edition shows it with "File still tagged draft" and "Internal only, not published".
- **Evolution sheet.** Stages in `order`, at least six frames; frames past the recorded stages are "Not defined" placeholders. A stage's picture is approved artwork recorded for that stage id (front angle first, then catalog order, then artwork id). The template's `configuration: example` stages are labelled "Example configuration" internally; in public, only approved stage names are shown.
- **Module off.** `modules.mascot.enabled: false` gives a designed "module is off" plate; nothing is read.
- **Studio.** `GET /brands/<slug>/visual/mascot[/print[?edition=public]]`, linked once from the Assets page's mascot card. Ids (state, artwork, asset, stage) are only in the details disclosure and the print appendix. Print uses the book's A4 portrait page on the existing browser print path; the V1.2 engine is not on main.
- **Registry.** `MASCOT-MODEL-SHEET` (`original_professional_template`, Brand OS layout). Fixture: `illustrativeMascotAtlas` (ILLUSTRATIVE / MOCK DATA; mock artwork is a labelled frame, not a character), in `npm run visual:golden`.

## Adding a visual

1. Add a block type to `visual/model.ts` (additive; bump nothing unless an existing field changes meaning).
2. Build it from existing facts through `itemFor` (or another existing projection). If it needs data Studio cannot see (anything under `brand/.private`), it is not a Studio visual yet.
3. Add the framework to `packages/brand-core/src/visual/frameworks.json` if it cites one. Add en/fa/tr text, a renderer registered in `views/visual-registry.ts` (built from `visual-primitives.ts`), an illustrative fixture and tests for every state, and a browser check at five widths plus a printed PDF.

## Reading layer

The canvas cells carry only the reading: standard zone title, the canonical prompt and the entries with their state. Question ids, next questions, related answers, the edition note, the framework and the links note sit in a closed **Details and sources** disclosure under the canvas on screen, and on page 2 of the print view. Page 1 of the print view carries no technical id.
