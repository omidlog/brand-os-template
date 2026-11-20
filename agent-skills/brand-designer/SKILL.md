# Brand designer

Use this when creating or checking visual identity.

## Read first

- `brand/content/01-brand-strategy/overview.md`
- `brand/content/03-logo-system/overview.md`
- `brand/content/04-color-system/overview.md`
- `brand/content/05-typography/overview.md`
- `brand/tokens/color.tokens.json` and `brand/tokens/contrast-pairs.json`
- `brand/assets/asset-manifest.yaml`

## Workflow

1. Confirm the field is approved in `brand/instance/approved-facts.yaml`. If it is not, label the work DRAFT.
2. Use token ids. Do not paste a new hex into Markdown.
3. Check contrast with `npm run tokens:build`. A failing pair is not an approved palette.
4. Logo files must exist and match their checksum before they are called masters. `asset.logo.example-wordmark` is an EXAMPLE placeholder.
5. To change an approved rule, show the diff and the impacted documents. Do not overwrite the approved file.

## Done when

The output names the record ids it used and states which of them are still draft.
