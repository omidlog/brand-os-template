# Engine updates

How a change in the Brand OS template reaches every brand, in plain words.

## The model: engine + data

- **The template** is where Brand OS is developed and fully tested (about 1,100 tests).
- **A brand repository** holds only brand data in `brand/`, plus the **engine** in `.brand-os/engine/`: one bundled program (`brand-os.mjs`) with every brand command, its definitions (questions, profiles, guidance, schemas, base tokens) and the agent guides. It needs no `npm ci`.
- Definitions are read from the engine, so a new or reworded question reaches a brand with the engine. A brand keeps only its own changes in `brand/overrides/` (for example `brand/overrides/profiles/personal-brand.yaml` with `add:` / `remove:`).
- A brand's CI runs `npm run check` (`brand-os check`): it validates the brand's own data in about a second and runs no test suite.

## What happens after a merge to main

1. `validate` passes on `main` in the template.
2. `engine-release` builds the engine and publishes the GitHub release `engine-v<version>`.
3. Its `fleet` job opens **one pull request** in every brand repository with the topic `brand-os-brand` (owned by the owners in `BRAND_OS_FLEET_OWNERS`):
   - it replaces `.brand-os/engine/`, runs the engine's migrations (`brand-os migrate`) and rewrites the engine-owned root files (`brand-os scaffold`): `package.json` scripts, `.github/workflows/brand.yml`, `AGENTS.md`, `CLAUDE.md`;
   - the first time, it also converts an older brand (a full template copy) with `brand-os convert` (see below);
   - it runs `brand-os check` and writes the result into the pull request;
   - older open `engine-update/*` pull requests are closed as superseded.
4. **Auto-merge (optional, per brand):** a brand repository with the topic `brand-os-auto-merge` is merged by the fleet job once its own `brand-check` passes on GitHub. Without the topic, the owner merges the pull request.

Nothing is ever pushed to a default branch or force-pushed. Migrations change only engine-owned files and structure; no answer, fact, approval, asset or evidence changes, and approving or publishing stays the owner's step.

To update by hand, or only some brands: **Actions → engine-release → Run workflow**, with `repos` (`owner/name,owner/name`) or empty for all.

## One-time setup (the owner)

1. Create a fine-grained personal access token: resource owner = the owner of your brand repositories; repository access = the brand repositories (or all); permissions **Contents**, **Pull requests** and **Workflows**: read and write; **Metadata**: read. Never paste it into a chat.
2. In the template repository: **Settings → Secrets and variables → Actions**:
   - secret `BRAND_OS_FLEET_TOKEN` = that token;
   - variable `BRAND_OS_FLEET_OWNERS` = the GitHub owner(s) of your brand repositories, comma-separated (for example `omidlog`).
3. On each brand repository: **Settings → General → Topics**: add `brand-os-brand`, and `brand-os-auto-merge` if engine updates should merge on their own after a green check. Studio sets `brand-os-brand` on brands it creates.

Until the secret and the variable exist, `engine-release` still builds and publishes the engine and the fleet job only prints a notice.

## Converting an older brand

`brand-os convert` (run by the fleet the first time, or by hand: copy an engine to `.brand-os/engine/`, then `node .brand-os/engine/brand-os.mjs convert --template-dir <template clone>`):

- removes the template's code and tooling (`packages/`, `apps/`, `scripts/`, `tests/`, `schemas/`, `docs-internal/`, the template README, CHANGELOG and package files, docs build outputs);
- removes the question bank, field registry and knowledge graph copies, and every guidance page or base token file that equals any version the template ever had; a page the brand really edited stays and replaces the engine's;
- turns a full profile copy into `brand/overrides/profiles/<id>.yaml` holding only the brand's additions (questions the copy lacks are reported, never removed);
- never touches brand data: the answer ledger, facts, assets, evidence, tokens/generated and approvals, knowledge, strategy, `.private`.
