# Figma

Figma is a design workspace, not the source of truth. Approved tokens and component ids in Git win.

## Link a file

Set `design.figma.file_url`, `file_key`, and `library_url` in `brand/brand.config.yaml` when you have them. Leave them null until then. Do not put a Figma token in Git. `FIGMA_ACCESS_TOKEN` belongs in the environment.

## Reconcile

1. Export variables from the Figma library.
2. Compare names to `brand/tokens/figma-variables.snapshot.json`, which `npm run tokens:build` writes from the DTCG sources.
3. If a Figma variable has no token path, either add a token or remove the variable. Do not keep two palettes.
4. Component names in Figma should match `brand/content/12-product-ui-system/components.yaml`.

This version does not call the Figma API. The snapshot check is local and only proves the token file and the snapshot list the same paths.
