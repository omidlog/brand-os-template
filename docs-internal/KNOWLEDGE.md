# Knowledge Inbox

A private, per-brand notebook for messy ideas, research and meeting notes. Inspired by Baalda's plain-Markdown,
revision-checked design; the code is an original Brand OS implementation (no Baalda code, UI or assets).

**A note is never a brand fact.** It is an unapproved idea until the owner turns part of it into a draft
proposal and then approves that draft with the existing `brand:review` / `brand:approve` flow. Sharing a note to Git
is not publication.

## Four kinds of information

| Kind | Where it lives | Who can see it | Becomes official how |
| --- | --- | --- | --- |
| Local note (default) | `brand/.private/knowledge/local/kn_<uuid>.md` (gitignored, 0600 in 0700 folders) | Only this checkout | Never by itself |
| Shared note | `brand/knowledge/shared/kn_<uuid>.md` (tracked in the private brand repo) | Anyone with repo access; Studio after merge | Never by itself |
| Restricted note | `brand/.private/knowledge/restricted/kn_<uuid>.enc` (AES-256-GCM) | Owner, with `BRAND_OS_DATA_KEY` **and** the approval proof | Never |
| Draft proposal | `brand/interview/answer-ledger.yaml` (tracked) | Repo | `brand:approve` (human) |
| Approved / published fact | `brand/instance/approved-facts.yaml` | Per publication policy | `brand:publish` (human) |

No configuration flag is needed. A brand without `brand/knowledge` works with zero notes; folders are created on
first capture or share. This matters because template sync never updates `brand/**`.

## Everyday use

```bash
# Capture (local, untracked). Text from --text, --file <path> or --file - (stdin).
npm run brand:knowledge -- capture --title "Pilot rank progression" --lang fa \
  --tags mascot,gamification,retention --question-ids brand.gamification.streaks --file ./idea.md

npm run brand:knowledge -- list --status inbox
npm run brand:knowledge -- search --query "mascot streak"        # fa / tr / en, see below
npm run brand:knowledge -- show --id kn_<uuid>                    # prints the revision
npm run brand:knowledge -- backlinks --id kn_<uuid>
npm run brand:knowledge -- related --id kn_<uuid>
npm run brand:knowledge -- similar --id kn_<uuid>                 # possible duplicates, never merged
```

Every command takes `--json`. Errors print `code: message` (or `{ok:false,error:{code,message}}`) and never echo
note text.

### Editing safely

Edits need the revision from `show` (`sha256` of the file bytes, computed by the reader, never stored in the note).
If the note changed since you read it, the edit fails with `stale_revision` and writes nothing.

```bash
npm run brand:knowledge -- edit --id kn_… --expected-revision <sha256> --insert-after "anchor text" --text " more"
npm run brand:knowledge -- edit --id kn_… --expected-revision <sha256> --replace "old words" --with "new words"
npm run brand:knowledge -- edit --id kn_… --expected-revision <sha256> --file ./revised-body.md
npm run brand:knowledge -- edit --id kn_… --expected-revision <sha256> --status triaged --add-tag ux
npm run brand:knowledge -- append --id kn_… --text "Later thought" --idempotency-key turn-42
```

- An anchor or `--replace` passage must appear exactly once; missing or ambiguous rejects the whole edit.
- A retried `append` with the same `--idempotency-key` does nothing (keys kept hashed for 30 days).
- Writes take a per-note lock, so two writers with the same revision cannot both succeed.
- Text that looks like a credential is refused in plain-text notes.

### Archive and recovery

`archive` is reversible (`restore` returns the previous status). Every change snapshots the previous text under
`brand/.private/knowledge/revisions/<id>/` (last 20; restricted snapshots stay encrypted).

```bash
npm run brand:knowledge -- history --id kn_…
npm run brand:knowledge -- recover --id kn_… --revision <old sha prefix> --expected-revision <current sha>
```

`brand:backup` includes `brand/knowledge` and `brand/.private` (local, restricted and snapshots), encrypted with
`BRAND_OS_DATA_KEY`.

### Sharing to Git (and Studio)

```bash
npm run brand:knowledge -- share --id kn_… --dry-run          # shows the exact text that would become tracked
npm run brand:knowledge -- share --id kn_… --expected-revision <sha from dry run>
git add brand/knowledge/shared/kn_….md   # then commit on a branch and open a PR
```

Sharing is refused when:

- the repository is public, or its visibility cannot be established. Brand OS asks `git remote get-url origin` and,
  if installed and signed in, the GitHub CLI (`gh api repos/<owner>/<repo>`). It never reads a token itself. If the
  result is unknown, check GitHub and re-run with `--confirm-private <owner/repo>` naming the origin exactly. A
  repository GitHub reports as public cannot be confirmed private;
- the note looks like it contains credentials, personal private data (home address, phone, id numbers) or
  restricted financial/legal data (the same cues the interview withholds from models; this over-refuses on purpose);
- the note is restricted.

Committed text stays in Git history permanently. `unshare` moves the file back to local; commit that removal so
Studio stops showing it.

### Restricted notes

```bash
BRAND_OS_DATA_KEY=… npm run brand:knowledge -- capture --classification restricted --title "…" --file ./x.md
npm run brand:knowledge -- show --id kn_… --scope restricted
```

Restricted operations need `BRAND_OS_DATA_KEY`, the owner approval proof (`BRAND_OS_APPROVAL_PROOF` or the hidden
prompt; never argv), and are refused while `BRAND_OS_AGENT_TOKEN` is set. The key is derived with HKDF from
`BRAND_OS_DATA_KEY` under a knowledge-specific label, and the note id is authenticated data, so a ciphertext copied
under another id fails. Title, tags and body are all inside the ciphertext; the filename is the random id. Restricted
notes are never listed by default, searched, cached, shared, snippeted or returned to agents.

### Diagnostics

`brand:knowledge doctor` reports malformed metadata, duplicate ids, filename/id mismatches, broken links, unknown
question ids, notes for another brand, symlinks and hard links, stray files under `brand/knowledge`, credential-like
text or restricted classification in shared notes, loose permissions, a missing `.gitignore` entry, and a corrupt or
stale search cache (then rebuilds it). It names files, ids and fields only.

`brand:knowledge migrate [--apply]` fills missing metadata (brand slug, schema version, defaults) idempotently and
keeps unknown frontmatter keys.

## Note format

```markdown
---
schema_version: 1
id: kn_550e8400-e29b-41d4-a716-446655440000
brand_slug: pilito
title: Mascot promotion after seven days
kind: idea            # idea | research | reference | meeting | decision_draft | general
status: inbox         # inbox | triaged | active | archived (archive/restore only)
classification: internal
language: fa
tags: [mascot, gamification, retention]
links:
  - { id: kn_…, relationship: supports }   # related | supports | contradicts | supersedes
question_ids: [brand.gamification.streaks] # must exist in the question bank
source: { kind: owner_note, ref: manual-capture-2026-11-21 }
created_at: 2026-11-21T13:00:00.000Z
updated_at: 2026-11-21T13:00:00.000Z
---

After seven consecutive learning days, consider promoting the pilot mascot one rank.
```

`[[kn_…]]` in the body is also a link. Identity is the `id`; renaming the file keeps the id and backlinks. Hand-written
notes need only `id` (and ideally `title`); `doctor` lists what is missing. Source kinds: `owner_note`, `meeting`,
`agent_capture` (the owner's words) and `research`, `imported_text` (third-party material, never owner authority).
Limits: 1 MiB per note, 200-character titles, 30 tags, 100 links, 50 results per page, snippets up to 1,000 characters.

## Search

Ranking: title phrase > exact tag > body phrase > token matches (title before body, prefix matches for suffixing
languages) > linked question id or source metadata; ties by most recently updated. Matching normalizes Unicode (NFKC),
Persian `ي/ى/ئ→ی`, `ك→ک`, alef forms, Arabic diacritics and tatweel, removes ZWNJ/ZWJ, maps Persian and Arabic-Indic
digits to ASCII, folds Turkish `İ/I/ı→i` and Latin diacritics. Stored text is never changed. Snippets are always a
substring of the note. Filters: `--status --kind --tag --lang --since --until --scope --question --include-archived`.
`--with-facts` adds approved facts through the same reader as `brand:query` (agent token from the environment, or a
guest). No search call contacts a model or the network.

The index is built in process from the files. `brand/.private/knowledge/cache/index.json` records which file states
were indexed so `doctor` can detect a stale or corrupt cache; deleting it is always safe.
