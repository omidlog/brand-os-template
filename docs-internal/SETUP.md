# Setup

Requirements: Node.js 22 or newer.

```bash
npm install
npm run tokens:build
npm run prepare:docs
npm run lint
npm run typecheck
npm run validate
npm run test
npm run build
```

Local preview with internal audience (draft values visible, restricted values still hidden):

```bash
npm run docs:start
```

The site listens on port 3000. Public build:

```bash
npm run docs:build
```

Copy `.env.example` to `.env` only for local overrides. Do not commit `.env`.
