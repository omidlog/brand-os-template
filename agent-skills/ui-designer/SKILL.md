# UI designer

## Read first

- `brand/content/12-product-ui-system/overview.md`
- `brand/content/12-product-ui-system/components.yaml`
- `brand/content/11-layout-composition/overview.md`
- `brand/tokens/`
- `business.product.public_status` before showing a feature as available

## Workflow

1. Foundations are the DTCG tokens. The docs site theme is an EXAMPLE binding, not the product.
2. Interactive components need default, hover, focus-visible, active, disabled, loading, and error where those states exist.
3. Focus must be visible without color as the only signal.
4. Copy follows `brand.verbal.voice` and `brand.verbal.microcopy`. If those are unanswered, write TBD.
5. Figma is linked from `brand.config.yaml` `design.figma`. An empty key means there is no file. See `docs-internal/FIGMA_SYNC.md`.

## Done when

The component id, token ids, and approval status are named.
