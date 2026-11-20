# Brand OS template

A private-first GitHub template for one brand and the business system inside it. The docs, tokens, and interview engine are reusable. The answers are not. Nothing in this repository is an approved brand.

## Commands

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

| Command | What it does |
| --- | --- |
| `npm run docs:start` | Local preview, internal audience, port 3000 |
| `npm run docs:build` | Public docs build (English, Persian RTL, Turkish) |
| `npm run build:docs:nomascot` | Public build with mascot and gamification hidden |
| `npm run brand:init -- --name "Name" --slug name --yes` | Set identity and reset the interview |
| `npm run brand:interview` | Ask one question at a time |
| `npm run brand:resume` | Continue the saved session |
| `npm run brand:next -- [--json] [--profile <id>]` | Next questions with reasons, open conflicts, follow-ups, tentative and unresolved answers, and restricted questions that only the owner answers |
| `npm run brand:interview -- --question <id> --answer "…" [--json]` | Answer any question in any order. This is the agent mode. Restricted questions are refused here. |
| `npm run brand:propose -- --file <batch.json \| -> [--dry-run] [--json]` | Store a schema-validated batch of extracted proposals as drafts with quotations. It never approves. It rejects unknown and restricted ids, and quotations that are not in the source text. |
| `npm run brand:interview -- --assist --file <text \| -> [--json]` | Read a free-form answer and propose drafts. It uses the model set in `llm` in `brand.config.yaml` (off by default), or deterministic rules if none is set. Restricted passages are withheld first. |
| `npm run brand:status` | Coverage and approval, separately |
| `npm run brand:review -- [--module <id> \| --ids <id,…>] [--json]` | Review queue: each draft or pending change against the approved revision, with impacted documents and questions. Restricted values are withheld. `--full` prints the older ledger recap. |
| `npm run brand:approve -- --module <id>` or `-- --ids <id,chg-…>` | Approve a whole module or a list of question ids and change ids with one proof. Every item is reported (`approved`, `skipped`, `refused`, `stale`, `unknown`); nothing is dropped silently. A wrong proof changes nothing. `--dry-run` shows the queue without a proof. The proof is read from `BRAND_OS_APPROVAL_PROOF`, piped stdin, or a hidden prompt; `--proof` on the command line is refused. Create the secret once with `npm run brand:doctor -- --create-approval-secret`. It lives in `brand/.private/approval-secret` and is not committed. |
| `npm run brand:publish -- --ids <id,…>` or `-- --module <id>` | Add approved, public-classified facts to the publication allowlist. Approval never publishes. Internal and restricted facts are refused. `--unpublish` withdraws them. Same proof rules as approve. |
| `npm run brand:doctor` | Check Node, `BRAND_OS_DATA_KEY`, the approval secret, the config and publication policy, and that `.env` is ignored. Never prints secret values. `--json` for machines. Exits non-zero on a hard failure. |
| `npm run brand:export` | Gitignored snapshot. `--public` redacts non-public answers |
| `npm run brand:validate` | Schema, catalog, token, and asset checks |
| `npm run example:education` | Education-app fixture in a temp directory |
| `npm run example:b2b` | Mascot-free B2B fixture in a temp directory |

Details: `docs-internal/SETUP.md`.

## Mark this repository as a template

GitHub → **Settings** → **General** → check **Template repository**. This checkout is already private and marked as a template. Leave it that way. Do not put secrets in it.

## Create a brand repository

Use **Use this template**, not a fork. Create a new private repository, clone it, then:

```bash
npm install
export BRAND_OS_DATA_KEY="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))")"  # store it in your secret manager; losing it loses restricted answers
npm run brand:init -- --name "Your brand" --slug your-brand --industry "TBD" --language en --languages en,fa,tr --mascot false --gamification false --publish private --yes
npm run brand:doctor -- --create-approval-secret
npm run brand:interview
```

Scripts do not load `.env` automatically. Keep `BRAND_OS_DATA_KEY` in your shell or secret manager.

`--mascot false` hides the mascot docs and skips those questions. The catalog stays in the repo. See `docs-internal/NEW_BRAND.md`.

## Interview

The agent asks one question, explains why it matters, and shows an example labeled as an example. Answers are stored in `brand/interview/answer-ledger.yaml` with source, authority, and visibility. Drafts are written between field markers. `unknown` and `skip` stay unresolved. `npm run brand:resume` uses the session file, not the model's memory.

Changing an approved answer prints the impacted documents and questions and does nothing until you confirm. Confirmation withdraws the approval and saves a new draft.

Restricted finance and partner fields are stored under `brand/restricted/` and are omitted from the public site, the public export, and the default review.

## Docs

`npm run build` prepares a public site only when `publish_docs` is `public`. The EXAMPLE template is public because it holds no confidential facts. `brand:init` defaults to private, and a public build of a private brand stops. `build/fa` is right to left. Search is local and currently English-only. `npm run docs:start` is the local preview. Restricted values stay in `brand/.private` and are omitted from the site. See `docs-internal/DEPLOYMENT.md`.

## Tokens and assets

Edit `brand/tokens/*.json`, then `npm run tokens:build`. Outputs are CSS variables and TypeScript. The palette is EXAMPLE and the contrast pairs in the template pass WCAG AA for the listed combinations. The SVG files under `brand/assets` are placeholders. The mascot turnaround is missing on purpose.

## Agents

`AGENTS.md`, `CLAUDE.md`, and `agent-skills/` describe how to read this repo without inventing facts. `npm run brand:query` and `npm run mcp:serve` are local. They are not a hosted connection. See `docs-internal/AI_CONNECTORS.md`.

## Status

`docs/IMPLEMENTATION_STATUS.md` lists what is implemented, partial, and not started.
