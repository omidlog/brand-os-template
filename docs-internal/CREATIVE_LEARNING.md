# Creative Learning (Sprint 1 MVP)

Auditable memory of the owner's design choices: why a variant was selected, which rejected patterns matter, and which
preferences the owner explicitly approved, so a later Claude session can use them with citations. It is not model
training and not a performance system. Reuse map and change control: `docs-internal/CREATIVE_LEARNING_REUSE_MAP.md`.

## What is stored where

| Thing | Where | Contains |
| --- | --- | --- |
| Owner feedback, verbatim, any language | Knowledge note, `brand/.private/knowledge/local/kn_….md` | The words. Tags `creative-feedback`, `proj-<id>`, `variant-<x>`; `source.ref = creative:<project>/<variant>`. |
| Inspiration commentary | Knowledge note (usually `--source-kind research`) | The commentary. The reference asset itself is never copied. |
| Project + variants + selection | `brand/.private/creative/projects/<id>.json` | Ids, `kn_…` + revision, closed-vocabulary aspects (`keep`/`avoid`), short labels, manifest asset id or `missing`. |
| Scoped preference | `brand/.private/creative/preferences/cp_….json` | ≤200-char statement, ≤300-char context, source `kn_…` + revision, counterexamples, state, approval digest, supersession links. |

All of it is under `brand/.private/` (gitignored, 0600, excluded from Studio, never read by docs builds, included in
`brand:backup`). Nothing is committed, shared, published or sent anywhere.

## Commands (`npm run brand:creative -- <command> --json`)

```sh
# 1. Project and variants (asset = manifest id or the word missing; never a path or URL)
npm run brand:creative -- project --id pilito-intro-reels --title "Pilito intro reels" --surface reel --series onboarding --lang fa [--inspiration kn_…:unknown]
npm run brand:creative -- variant --project pilito-intro-reels --variant B --asset missing
# 2. Owner feedback: the text becomes a Knowledge note; the project stores only its id + revision
npm run brand:creative -- feedback --project pilito-intro-reels --variant B --text "خیلی بچگانه است." --verdict reject --avoid tone
npm run brand:creative -- feedback --project pilito-intro-reels --variant C --text "نورپردازی خوب است ولی متن زیادی دارد." --verdict change_request --keep lighting --avoid text_density
npm run brand:creative -- feedback --project pilito-intro-reels --variant E --text "زاویه‌ی دوربین خوب است." --verdict like --keep camera_angle
# 3. The owner's choice for this project (not publication, not brand approval, not a performance result)
npm run brand:creative -- select --project pilito-intro-reels --variant E
# 4. Draft preference (project scope, unverified) → owner approval with the existing approval proof
npm run brand:creative -- suggest --project pilito-intro-reels --statement "Use dynamic camera angles on onboarding reels" --source kn_<E note> --counterexample A
BRAND_OS_APPROVAL_PROOF=… npm run brand:creative -- approve --id cp_… [--scope series]
# 5. Next session
npm run brand:creative -- context --surface reel --series onboarding      # or --project <id>
# 6. Changed mind: capture the new words, suggest with --supersedes, approve
npm run brand:knowledge -- capture --title "Changed mind" --text "…" --source-kind owner_note
npm run brand:creative -- suggest --project pilito-intro-reels --statement "…" --source kn_<new> --supersedes cp_<old>
```

## Rules the code enforces

- **Owner only.** Every command refuses while `BRAND_OS_AGENT_TOKEN` is set. The only agent read path is the
  read-only `creative_context` MCP tool below.
- **Feedback must be the owner's words.** A linked note must have source kind `owner_note`, `agent_capture` or
  `meeting`. `research`/`imported_text` notes can only be inspirations. Restricted notes cannot be linked at all.
- **Draft until approved.** `suggest` writes a `draft` with project scope. `approve` needs the existing owner proof
  (`approvalProofMatches`), checks that every source note is still at the recorded revision, and accepts scope
  `project` or `series` only. `--scope brand` is refused with the route for brand-wide rules: owner note →
  `brand:knowledge propose` → `brand:review` → `brand:approve`. Creative commands never write approved facts, the
  answer ledger or publication state.
- **Supersession keeps history.** Approving a preference with `supersedes` marks the old one `superseded` with
  `superseded_by`; both records keep their sources and approval. Until the new one is approved, the old one applies.
- **Context only cites.** `context` returns: approved brand facts via the existing `design` reader; approved
  preferences whose scope covers the target (anything else under `not_applied` with a label); the selected variant,
  rejected variants (reject verdict or `avoid` aspects) and `keep` aspects of other variants **from in-scope projects
  only**, each with the note quote, `knowledge:kn_…@<sha256>` provenance and the source state. Variants without an
  owner reason are not offered. `performance: not_measured`, `authorizes: []`.
- **Drift is visible.** Edited source → `stale` (both revisions shown). Archived → `archived`, quote withheld. An
  approved preference whose source changed → `needs_review`, not applied. A hand-edited approved record no longer
  matches its approval digest → `invalid_approval`, not applied. Manifest checksum change → asset `changed`.

## Agent read path: `creative_context` (MCP, `creative-read` profile)

The owner issues a token with `npm run brand:agent-token -- issue --profile creative-read --label "design agent"` and
starts `npm run mcp:serve` with it. The local stdio server then answers one extra, read-only tool:

```json
{ "name": "creative_context", "arguments": { "surface": "reel", "series": "onboarding" } }
{ "name": "creative_context", "arguments": { "project_id": "pilito-intro-reels" } }
```

- **Who is answered.** Only a `creative-read` token of this brand. Guests, unprofiled agents and every other profile
  (including `design` and `knowledge-read`) get `denied`. No argument selects a brand, role, profile or scope; extra
  arguments are ignored.
- **What it returns.** `preferences`: approved, currently valid preferences whose scope covers the target.
  `withheld.preferences`: counts of drafts, superseded, needs-review and tampered preferences (never their text).
  `references`: selected, rejected and partly kept variants with verdict, `keep`/`avoid` aspects, asset state and
  `knowledge:kn_…@<sha256>` provenance. `brand_rules`: approved facts the profile may read (the `design` modules).
  `performance: not_measured`, `authorizes: []`, `execute_permission: false`, `publication_permission: false`.
- **Note text.** A reason's verbatim quote is returned only when its note is **shared** (`brand:knowledge share`, in
  the private brand repository) and passes the sharing safety check. Otherwise `quote: null` with
  `quote_withheld: local_note | archived | missing | unsafe`. Local notes stay on the owner's computer, as for
  `knowledge-read`. Statements, contexts, labels and titles that look like credentials or private data are withheld.
- **Access log.** Every call, allowed or denied, appends one line to `brand/.private/access-log.jsonl` (0600):
  principal, profile, tool `creative_context`, requested project id, returned preference/variant/note ids, withheld
  preference and note ids, decision and reason. Never note text or statements.
- **Revocation** takes effect when the MCP server restarts (same as every token).

## Tests

`tests/creative-journey.test.ts` (the full owner journey through both CLIs) and `tests/creative-security.test.ts`
(cross-brand, agent token, knowledge-read MCP, guest/design readers, gitignore, restricted and
third-party notes, stale/archived/tampered sources, brand-scope refusal, assets, no publish path), plus
`tests/studio-creative.test.ts` (Studio's archive filter excludes creative records and feedback notes), and
`tests/creative-agent.test.ts` (`creative_context`: profile and brand refusals, drafts/superseded withheld, local
note text withheld, shared quote served, secret-looking text withheld, access log, stdio MCP).

## Known limitations

- Aspects are a closed English vocabulary; the owner (or Claude, with the owner's agreement) chooses them when
  recording feedback. They are not extracted automatically from the text.
- Series scope is `surface + series` only; there is no hierarchy or campaign scope.
- The agent read path is local stdio MCP only (`creative_context`). There is no remote/HTTP access.
- No Studio view. No sharing of creative records to Git.
- Concurrency: projects are updated under a per-project lock; preference approval under one lock. Suggest does not
  lock (it only creates a new file).
- Inspiration rights (`own|licensed|unknown`) are the owner's statement, not verified licensing.
