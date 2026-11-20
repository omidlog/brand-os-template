# Mascot creator

Use this when the mascot module is enabled. If `brand.config.yaml` has `modules.mascot.enabled: false`, stop. Do not invent a character.

## Read first

- `brand/content/06-mascot-identity/overview.md`
- `brand/content/07-mascot-expression-pose-library/overview.md`
- `brand/content/08-mascot-evolution/overview.md`
- `brand/mascot/catalog.yaml`
- `brand/mascot/stages.yaml`
- `brand/mascot/angles.yaml`
- `brand/mascot/motions.yaml`

## Workflow

1. The six stages in `stages.yaml` are an EXAMPLE CONFIGURATION. The brand's stage count is `brand.mascot.stage_count` once answered.
2. Pick a catalog id. Do not rename it. Do not draw a state that is not in the catalog unless the owner adds a row.
3. `approved_angles` is empty and `preview` is null until a file is in the manifest.
4. `asset.mascot.turnaround` is missing on purpose. `asset.mascot.placeholder-frame` is an empty frame, not the character.
5. Anatomy and forbidden distortions come from the interview, not from a generated image.

## Done when

The reply lists the state id, its status, and the missing files. It does not attach new character art as if it were approved.
