# Deployment

## Public

```bash
DOCS_AUDIENCE=public npm run docs:build
```

This omits internal and restricted documents. The default `npm run build` does this. Persian (`build/fa`) is RTL. Turkish is `build/tr`.

## Private

```bash
npm run docs:start
```

or prepare with `--audience internal` and build. Internal drafts can appear. Restricted values still do not.

## GitHub

`.github/workflows/deploy-docs.yml` is manual. It uploads a build artifact. GitHub Pages runs only if the repository variable `DOCS_PAGES` is `true` and the audience is public. Leave that variable unset until you intend to publish. A private repository can still leak if Pages is public. Prefer an internal host for internal audience builds.

Do not deploy `brand/restricted/`, `brand/interview/answer-ledger.yaml`, or `brand/exports/`.
