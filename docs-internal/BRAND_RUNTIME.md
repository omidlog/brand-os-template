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
- **Not for real brands yet.** The CLI runs only with `--demo` (the SYNTHETIC DEMO brand). Running on a real brand is an
  owner decision (see "Open questions").

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
| `post.format`, `post.headline_fit`, `set.*` | `runtime.manifest`: integrity of the artifact itself (size, count, distinct files and messages) | facts about the files, not quality verdicts |

Visual and semantic review are `not_tested`: no model looked at anything, and the summary says a person must.

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
```

Owner-local: refused while `BRAND_OS_AGENT_TOKEN` is set (the demo builds a workspace and the Coach is owner-only).

## Tests

`tests/runtime-social-batch.test.ts` (13) and `tests/asset-model-use.test.ts` (3): schema validity, SVG checker and
publication gate on every post, determinism across builds, source pins, en/fa/tr copy unchanged, `model_use` default,
checksum-changed logo refused, writes only in the output dir and `git status brand/` unchanged, tampered pack / wrong
task / wrong count refused, too few messages or no palette ⇒ `blocked` (no padding), banned claim ⇒ `copy.claims: fail`,
Coach and Assurance called (and the Coach still refuses under an agent token), CLI parity with the library.

## Open questions (owner)

1. Real brands: allow `--pack <file>` from `brand:query --tool task_context`? Logo bytes would then need the owner's
   workspace (owner CLI only, per preflight §4).
2. Should artifact integrity checks (`post.format`, `set.*`) move into Assurance as artifact controls, so the Runtime
   reports none of its own?
3. Fonts: the renderer names families (Vazirmatn, Inter) but embeds none. Approved `brand.type.scale` is not applied yet.
4. Coach quality on the facts behind the copy (e.g. `too_brief_for_output`) is reported but does not block a draft.
   Should any Coach status block?
5. A `content-read` pack has no `business.market.geography`, so Assurance reports PRR-02 as missing for this caller.
   That is correct per source, but may read as a brand gap.
