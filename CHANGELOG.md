# Changelog

## Unreleased (0.2.0 in progress)

- `brand:doctor` checks Node, `BRAND_OS_DATA_KEY` (presence and length only), the approval secret file and its mode, config parsing, the publication policy brand id, and that `.env` is ignored. `--create-approval-secret` creates the secret without printing it.
- `.env.example` documents `BRAND_OS_DATA_KEY`.
- Fix: Persian answers longer than 12 characters are recorded for the current question. Only `note:` starts free-form capture.
- Fix: re-approving an approved fact is refused, and approval versions never reset to 1.
- Fix: fact, ledger, policy, private store, and draft writes are atomic (temp file, fsync, rename).
- Fix: restore validates every path before writing anything.
- `brand:query --include-unapproved` now says it is ignored.
- Audit: `docs-internal/CLAUDE_INDEPENDENT_AUDIT.md`.

## 0.1.0

First template slice of Brand OS.

- Repository skeleton, Docusaurus portal (English, Persian RTL, Turkish), and local search.
- DTCG token sources with CSS and TypeScript export and contrast checks.
- Twenty brand modules, twelve Business OS modules, optional mascot catalog (90 states, 6 example stages, 8 angles, 15 motions), and optional gamification.
- Interview CLI: one question at a time, ledger, drafts, resume, approval, impact, and restricted-field handling.
- Schemas, validation, tests, and GitHub Actions.
- Agent instructions, ten skills, and a local read-only tool adapter.

Known limits are listed in `docs/IMPLEMENTATION_STATUS.md`. No approved brand facts are included.
