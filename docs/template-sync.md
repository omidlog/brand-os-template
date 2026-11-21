# Template sync

How a fix in the Brand OS template reaches every brand repository, in plain words.

## The idea

There is one template repository and one private repository per brand. Each brand repository started as a copy of the template. When the template gets a fix or a feature, every brand should get it too, without anyone copying files by hand and without losing anything the brand wrote.

So the template's files are split into three kinds, written down in `.brand-os/sync.json`:

- **Core** files belong to the template: scripts, packages, the Studio and docs apps, schemas, workflows, agent skills, internal docs, tests. An update replaces them.
- **Brand** files belong to the brand: everything under `brand/`, plus docs data the build generates from the brand. An update never touches them.
- **Merge-carefully** files are shared: `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `CHANGELOG.md`. An update merges the template change into the brand's copy line by line and stops at the first real conflict.

A path that no rule matches is treated as a brand file and left alone.

Each brand repository also records which template commit it came from, in `brand/template-version.json`. Studio writes it when it creates a brand, `brand:init` writes it too, and `template:update` moves it forward.

## What an update does

1. Look at the commit the brand recorded and the latest template commit.
2. List the files the template changed between those two commits.
3. For each changed file:
   - brand file: skip it and say so;
   - core file the brand never edited: take the template's version;
   - core file the brand did edit: leave it alone and report a conflict for a person to look at;
   - merge-carefully file: merge both sides; a clean merge is applied, a conflict is reported.
4. Put the result on a **new branch** with one commit, never on `main`.
5. A person reviews and merges the pull request. Nothing is merged automatically.

## Running it yourself

From a brand repository, with a local clone of the template next to it:

```sh
npm run template:update -- --template ../brand-os-template          # dry run: prints what would change
npm run template:update -- --template ../brand-os-template --apply  # creates branch template-update/<sha> and commits
```

Options: `--to <ref>` picks a template commit or tag (default: the template's `HEAD`), `--base <sha>` sets the starting commit when the brand has no record yet, `--branch <name>` names the branch, `--json` prints the plan as JSON. The command never pushes; push the branch and open a pull request as usual. It exits with code 2 when some files need a person, so scripts notice.

## Studio does it for you

The template repository is private, so a brand repository's own `GITHUB_TOKEN` cannot read it. Studio already holds a GitHub token for creating brands, so Studio does the cross-repository work:

- Studio shows **Updates available** on the brand list and on a brand's Overview when its recorded commit is behind the template. If GitHub is slow or rate-limited, it says *Template not checked* and tries again later.
- **Open update PR** (owner only) does what `template:update --apply` does, through the GitHub API: core files the brand never edited are updated, shared files are merged, brand files are skipped, and files that need a person are listed in the pull request. The result is one commit on a new branch `template-update/<sha>` and one pull request.
- If an update pull request is already open, Studio links it instead of opening another.
- Studio **opens** update pull requests and never merges them. This is Studio's second permitted write, after creating a new private repository. It never writes brand files (apart from moving `brand/template-version.json` forward), facts, approvals or the default branch. Every request is recorded in Studio's audit log.
- **Periodic check.** Studio checks every brand against the template on its own, every 6 hours by default (`STUDIO_TEMPLATE_CHECK_MINUTES`; `0` turns it off). By default it only checks, so the brand list shows **Updates available** without anyone opening the page. Set `STUDIO_TEMPLATE_AUTO_PR=1` and it also opens the update pull request for each brand that is behind. It keeps at most one open update pull request per brand: if one is open, it links it and opens nothing. If GitHub fails or limits requests, it waits longer before trying again. Each run is written to the audit log.

## Plan

| Chunk | What | Status |
| --- | --- | --- |
| 1 | Manifest (`.brand-os/sync.json`), template version record, `template:update` CLI with dry run and apply on a new branch, tests with throwaway git repositories | Done in part 1 |
| 2 | Studio: record the template commit at creation, **Updates available** indicator, **Open update PR** through the GitHub API (mocked in tests); document the second write | Done |
| 3 | Studio periodic job: check every brand and open at most one open update PR per brand; skip when one is already open. Opening is off unless `STUDIO_TEMPLATE_AUTO_PR=1` | Done |
| 4 | Versioned migrations for breaking changes (`.brand-os/migrations/<version>`), run by the update and listed in the PR | Planned |
| 5 | Optional brand-side GitHub Action ("Template update") for owners who add a repository secret that can read the template | Planned |
| 6 | Fake-brand end-to-end test: create, change template, update PR, merge locally, second update is empty | Planned |
