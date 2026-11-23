# Brand Runtime — first vertical slice: ten Instagram posts

Read this before touching `packages/brand-core/src/runtime/` or `scripts/runtime.ts`. Preflight and the wider plan:
`docs-internal/BRAND_RUNTIME_PREFLIGHT.md`.

One real path, end to end: **a `task_context` pack → ten real SVG posts → deterministic checks from the existing
layers → files in a local output directory**. No model, no network, no publishing (`authorizes: []`).

## What it is not

- **Not a third quality system.** The Runtime owns no rule and no quality vocabulary. It calls the layers that already
  own each check and reports their result under the owner's name (`layer`). It prints no score.
- **Not a context store.** Context is one `brand-os/task-context/v1` pack, verified by its digest (`verifyPack`).
- **Not a copywriter.** Every message on a post is an approved pack item, byte for byte. Set-valued facts (pillars)
  are split with the Content Bridge's own `splitItems`; nothing is paraphrased, shortened or translated. Labels around
  the copy ("Our promise", the counter, the draft stamp) are fixed en/fa/tr UI strings.
- **Not a writer of brand data.** `--pack` renders a real brand's approved pack file; it reads that file (and, with
  `--root`, the owner's own checkout of the same brand, read-only) and writes only to an empty `--out`.

## Inputs

| Input | Where the pack comes from | Coach | Logo |
| --- | --- | --- | --- |
| `--demo` | `createDemoBrand()` + `buildTaskContext` for a `content-read` agent, in a temp dir | called | demo logo, through the publication gate |
| `--pack <file>` | the JSON `brand:query --tool task_context --task-type social_batch --count 10` printed (envelope or bare pack) | not called | none |
| `--pack <file> --root <dir>` | same, plus the owner's checkout of the **same** brand (slug = pack `brand_id`), owner process only | called | approved logo, publication gate + pinned checksum |

A pack file is checked in this order: regular file (no symlink), ≤ 2 MB, valid JSON, a `task_context` envelope must be
`status: ok` with empty `authorizes` and the same `brand_id` as its pack, then the shape guard (`assertPackShape`), then
the same checks the demo goes through in `runSocialBatch`: digest (`verifyPack`), `social_batch`, count 10, empty
`authorizes` and permissions. A tampered, wrong-type or wrong-count file is refused exactly like a demo pack.

## Flow

```
createDemoBrand()  ── temp dir under os.tmpdir(), never this repo's brand/
   │  approved demo facts, one approved demo logo (no model_use ⇒ not_allowed), approved content strategy
   ▼
buildTaskContext(engine, content-read ctx, social_batch, count 10)     ← task-context, unchanged
   ▼
planSocialBatch(pack)   ten distinct angles × five layouts, palette from approved brand.color.roles
   ▼
renderPost()            pure SVG, 1080×1350, live text, draft stamp in the artwork
   ▼
postChecks / setChecks / coachLayer / assuranceLayer   ← existing layers only
   ▼
writeBatch(out)         posts/post-NN.svg, posts/post-NN.manifest.json, batch-summary.json
```

## Who owns each check

| Check | Owner (called, not copied) | Result shape |
| --- | --- | --- |
| `svg.allowlist` | `@brand-os/asset-catalog` `checkSvg` | `warn` for the live-text warning (text stays editable on purpose) |
| `svg.publication_gate` | `@brand-os/asset-catalog` `svgPublicationIssues` (both gates) | pass/fail + issue codes |
| `svg.normalized` | `@brand-os/asset-catalog/normalize` `normalizeSvg` | pass when the normalizer would change nothing |
| `copy.claims` | Content Bridge `claimConflicts` (banned claims + availability rule from the pack) | fail with `banned:<field>:<source>` |
| `color.contrast` | `@brand-os/design-tokens` `contrastRatio`; thresholds informed by WCAG 2.2 (`informed_by` in the assurance registry, no conformance claim) | ratios per drawn pair |
| `pack.digest`, `pack.staleness` | Task Context `verifyPack`, pack `staleness` | pass/warn/fail |
| Coach | `coachAnalyze` — `quality_review` for every fact a post cites, `consistency_review` brand-wide | status + finding codes + context digest; never answer text |
| Assurance | `assess()` over the pack's source states (Positioning Readiness v1) | control statuses + reason codes; `demo_data`, `internal_assessment_only` |
| `post.format`, `post.headline_fit`, `post.signoff_fit`, `set.*` | `runtime.manifest`: integrity of the artifact itself (size, count, distinct files and messages) | facts about the files, not quality verdicts |

Visual and semantic review are `not_tested`: no model looked at anything, and the summary says a person must.

**Coach never blocks** (owner decision). Coach results that are not `ready` are listed in `batch-summary.json`
`warnings[]` (question id, status, finding codes, `blocks: false`) and printed as advice. `status: blocked` comes only
from the plan (too few approved messages, no approved palette); a pack that fails integrity is refused before any post;
a banned claim is a `copy.claims: fail` on the post. Taglines and brand promises are short by design: the Coach itself
exempts `brand.verbal.tagline` and `brand.strategy.promise` from `too_brief_for_output` (`SHORT_BY_DESIGN_IDS`).

## Type

Drafts use the approved `brand.type.scale` from the pack (`type.ts`), parsed with the core `font` structured type:

| Post slot | Approved role names, in order | Fallback |
| --- | --- | --- |
| headline | `display`, `headline`, `heading`, `h1`, `title`, `hero` | body role, then the first role |
| label (eyebrow) | `label`, `eyebrow`, `overline`, `caption`, `subtitle`, `small` | body role, then the first role |
| body (CTA, sign-off) | `body`, `text`, `paragraph`, `base`, `copy` | the first role |

- Family and fallbacks are the approved stack, verbatim; `sans-serif` is appended only when the stack names no generic
  family (`appended_generic: true`).
- Sizes: canvas px = approved CSS px × 2 (`CANVAS_SCALE`; a 1080 px post shows at about 540 CSS px). A role without a
  size keeps the renderer default (`size_source: renderer_default`). An approved headline size that has to shrink to
  fit is drawn smaller and reported as `post.headline_fit: warn`.
- Weights: only from hash-approved `type.fontWeight.<role>` tokens in the pack. The scale has no weight field, so
  otherwise the renderer default is used and labelled `weight_source: renderer_default`.
- Counter and draft stamp use the label family at fixed sizes so the stamp stays legible.
- Without an approved scale every slot is the v1.0 renderer default, labelled. `manifest.typography` records it all,
  and `brand.type.scale` (and any weight token) is cited in `sources[]` with its revision.

## Final export (`--final`)

Drafts keep live, editable text. `--final --font-file <ttf|otf> …` converts every `<text>` to `<path>` (`outline.ts`):

- needs an approved type scale; the **first approved family of every slot** must be among the supplied files' family
  names (`name` table), and **every drawn character** must be in a supplied font's `cmap`. Otherwise `invalid_font`
  and nothing is written. Nothing is substituted.
- resvg (local, already used for previews) shapes the text with only the supplied files (`loadSystemFonts: false`). Same
  pack + same font bytes ⇒ same SVG bytes. The result passes `checkSvg` with no live-text warning, both publication
  gates and the normalizer; `<title>`/`<desc>` are kept.
- `manifest.export` records `mode`, `text: outlined`, the outliner version and each font by **file name and sha256**
  (never a path). No font is embedded or committed.

Limits: WOFF/WOFF2 are refused (resvg reads TTF/OTF/TTC). A variable font is drawn at its default instance, and an
approved weight that the file does not contain is not synthesised. The font licence is the owner's
(`brand.type.license`).

## Outputs

- Direction follows the **script of the approved copy**, not the UI locale: Persian copy is laid out right-to-left even
  with `--locale en`. Each RTL string is wrapped in RLE…PDF (display only); Latin labels are never wrapped.
- `posts/post-NN.svg` — the drafts. Same pack ⇒ same bytes (tested across two independent demo builds).
- `posts/post-NN.manifest.json` — `brand-os/runtime-post-manifest/v1`: sha256, size, renderer (`model: null`,
  `network: false`), pack digest, `sources[]` (`source_id` + `source_revision` from the pack), `assets[]` with
  effective `model_use` and `sent_to_model: false`, `checks[]`.
- `batch-summary.json` — `brand-os/runtime-batch/v1`: status `drafted|blocked`, blockers, pack readiness, set checks,
  Coach and Assurance results, `batch_sha256`.
- `previews/*.png` only with `--png` (resvg, system fonts; previews are not hashed and not deliverables).

The writer refuses a non-empty directory, a symlink, and any path inside a `brand/` folder; files are created with `wx`.

## `model_use` on assets

`schemas/asset.schema.json` has an optional `model_use`: `not_allowed` | `local_only` | `external_allowed`.
`effectiveModelUse()` (`@brand-os/asset-catalog`) reads absent or unknown values as `not_allowed`. `brand_retrieve`
asset values and `task_context` asset items now carry the effective value. Recording a value grants nothing: no code
path in this repository sends an asset to a model.

## Usage

```bash
npm run brand:runtime -- social-batch --demo --out ./tmp/runtime-demo --png
npm run brand:runtime -- social-batch --demo --out ./tmp/runtime-en --locale en --json
# a real brand: the content agent saves the pack with its own token (BRAND_OS_AGENT_TOKEN in its environment) …
npm run -s brand:query -- --tool task_context --task-type social_batch --count 10 --locale fa > /tmp/pack.json
# … and the owner renders it, in a shell without an agent token
npm run brand:runtime -- social-batch --pack /tmp/pack.json --out /tmp/posts            # pack only
npm run brand:runtime -- social-batch --pack /tmp/pack.json --root . --out /tmp/posts   # + Coach and logo (owner)
npm run brand:runtime -- social-batch --pack /tmp/pack.json --root . --final \
  --font-file ~/fonts/Display.ttf --font-file ~/fonts/Body.ttf --out /tmp/final
```

Owner-local: `--demo` and `--root` are refused while `BRAND_OS_AGENT_TOKEN` is set (the demo builds a workspace, the
Coach and the logo read the owner's checkout). A bare `--pack` reads only the file.

## Tests

`tests/runtime-pack.test.ts` (6): pack file happy path and same bytes twice, tampered / wrong task / wrong count /
authorizing / malformed / non-ok / symlinked / oversized files refused, `--root` same brand + owner only + workspace
byte-for-byte unchanged, Coach warnings never block, CLI parity. `tests/runtime-type.test.ts` (7): approved scale
applied and cited, weight tokens, renderer defaults labelled, reduced headline ⇒ warn, sign-off wraps and is reported,
final refused without fonts / scale / family / glyphs, final outlines everything and is deterministic (skipped with a
reason when DejaVu Sans is not installed), CLI flags. `tests/runtime-social-batch.test.ts` (13) and
`tests/asset-model-use.test.ts` (3): schema validity, SVG checker and
publication gate on every post, determinism across builds, source pins, en/fa/tr copy unchanged, `model_use` default,
checksum-changed logo refused, writes only in the output dir and `git status brand/` unchanged, tampered pack / wrong
task / wrong count refused, too few messages or no palette ⇒ `blocked` (no padding), banned claim ⇒ `copy.claims: fail`,
Coach and Assurance called (and the Coach still refuses under an agent token), CLI parity with the library.

## Open questions (owner)

Decided on 2026-11-23: `--pack` for real brands (built), artifact checks stay in the runtime (not moved to Assurance),
the approved type scale on drafts and outlines only in final export (built), the Coach never blocks and taglines and
promises are exempt from `too_brief_for_output` (built), MCP tool in the next slice.

1. Persian copy and an approved Latin-only type scale: `brand.type.rtl` is not in the `social_batch` recipe, so an RTL
   label or message is set in the Latin stack (the system fallback draws it in drafts; final export refuses). Add
   `rtl_rules` to `social_batch` and use it for RTL lines?
2. Variable fonts in final export are drawn at their default instance (often Thin). Accept static TTFs per weight only,
   or add instance selection?
3. A `content-read` pack has no `business.market.geography`, so Assurance reports PRR-02 as missing for this caller.
4. The logo is embedded as approved, whatever the background; a dark logo on a dark post has no contrast check.
   Pick the logo variant per background from `brand.logo.variants`?
