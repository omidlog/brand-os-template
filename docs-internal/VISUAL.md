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

## Adding a visual

1. Add a block type to `visual/model.ts` (additive; bump nothing unless an existing field changes meaning).
2. Build it from existing facts through `itemFor` (or another existing projection). If it needs data Studio cannot see (anything under `brand/.private`), it is not a Studio visual yet.
3. Add the framework to `packages/brand-core/src/visual/frameworks.json` if it cites one. Add en/fa/tr text, a renderer registered in `views/visual-registry.ts` (built from `visual-primitives.ts`), an illustrative fixture and tests for every state, and a browser check at five widths plus a printed PDF.

## Reading layer

The canvas cells carry only the reading: standard zone title, the canonical prompt and the entries with their state. Question ids, next questions, related answers, the edition note, the framework and the links note sit in a closed **Details and sources** disclosure under the canvas on screen, and on page 2 of the print view. Page 1 of the print view carries no technical id.

## List questions and canvas links (V3.1, owner decision D3)

Four Business Model Canvas zones now have list questions (`question_type: repeating_entity`): `business.model.segments`, `business.model.key_activities`, `business.model.key_resources` and `business.model.cost_items` (module `business-company`, optional, internal). Core: `packages/brand-core/src/entities.ts` (item specs, validator, operations), `entity-migration.ts` (legacy answers). Tests: `tests/repeating-entity.test.ts`, `tests/repeating-entity-readers.test.ts`, the V3.1 cases in `tests/visual-bmc.test.ts` and `tests/studio-visual.test.ts`.

- **Storage.** The ledger stores one canonical JSON string per list (`brand-os.entity-list/1`): `question`, `next`, and `items` with `id`, the spec's fields and optional `links`. Normalizing it again gives the same string, like the other structured types. `ENTITY_SPECS` is the one definition of the fields; the question bank carries a summary (`entity:`).
- **Fields.** Every item has a `name` (required, ≤120), a `detail` (≤400) and one standard choice: activity type (production, problem solving, platform or network), resource type (physical, intellectual, human, financial), segment priority (primary, secondary, exploring), cost behaviour (fixed, variable, mixed). Labels are en/fa/tr; item text is never translated. Cost items refuse money amounts in any script; amounts stay in the restricted `business.finance.costs`.
- **Ids and links.** Ids are `act-`, `res-`, `seg-`, `cost-` plus a number. Editing or moving keeps the id; `next` only grows, so a removed id is never reused and a link to it stays visibly unresolved. Activities may link to segments and resources, resources to activities, cost items to activities and resources. Offers, channels and revenue streams are still prose and are never linked.
- **Editing.** `npm run brand:interview -- --question <id> --entity add|edit|move|remove|list` (`--field key=value`, `--links id,id|none`, `--position N`, `--item <id>`, `--json`), or answer the whole list with `--answer` (one item per line or `;`: `name | detail | choice | links: seg-1`; an item keeps the id of the earlier item with the same name, or write `seg-2:` in front). Every write is a draft; on an approved list it is a pending change proposal (`brand:approve -- --ids chg-…`). The last item cannot be removed: "none" is `not relevant` or `unknown`. Studio stays read-only and shows the merged lists.
- **Legacy values.** A stored value that is not a canonical list is kept exactly as written and flagged (documents, Studio, canvas). `npm run brand:migrate` converts text that reads as a list: a draft becomes a `system` draft (the original text stays as its raw answer and in the superseded record); an approved fact is not touched and gets a change proposal instead. Text it cannot read as a list is reported by id and left alone. Running it again does nothing new.
- **Canvas.** List items fill their zone in the owner's order with their choice labels; a link reads as the target item's name, or "an item not shown in this edition" when the target is not visible (removed, unanswered, unpublished). A list zone with nothing visible shows a designed empty state. The links panel (Details and sources, print page 2) lists recorded links by zone and item name; `relationships` is `{ modeled: true, links }`, or `{ modeled: false, reason: 'no_list_items' }`. Item ids stay out of the main view.
- **Readers.** `brand_retrieve` returns an approved list with its items in `meta.entity` (drafts never). The Coach reads list questions by id and quotes no item. Task Context packs do not read list questions yet.
