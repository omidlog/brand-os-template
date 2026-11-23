# Claude Code

Follow `AGENTS.md`. This file does not restate those rules.

Start with:

- `brand/brand.config.yaml` for module flags
- `brand/brand-manifest.json` for the document index
- `brand/instance/approved-facts.yaml` before repeating any brand claim
- `docs/IMPLEMENTATION_STATUS.md` before calling a feature finished
- `docs-internal/PERSONAL_BRAND.md` when `modules.personal.enabled` is true (person-centered brands, evidence, privacy)
- `docs-internal/STUDIO.md` before touching `apps/studio` (read-only viewer; the only writes are creating a new private repository and opening, never merging, a template update pull request)

Skills for specific work:

- `agent-skills/brand-interviewer/SKILL.md`
- `agent-skills/brand-designer/SKILL.md`
- `agent-skills/mascot-creator/SKILL.md`
- `agent-skills/ui-designer/SKILL.md`
- `agent-skills/motion-designer/SKILL.md`
- `agent-skills/social-designer/SKILL.md`
- `agent-skills/knowledge-inbox/SKILL.md` (notes are unapproved ideas; `docs-internal/KNOWLEDGE.md`)
- `agent-skills/creative-memory/SKILL.md` (design feedback and scoped preferences; `docs-internal/CREATIVE_LEARNING.md`)
- `agent-skills/seo-strategist/SKILL.md` (draft SEO/GEO strategy with cited, dated sources; `docs-internal/SEO_STRATEGIST.md`)
- `docs-internal/STRATEGY_FEED.md` before touching `brand:strategy` or the `strategy_*` agent tools (owner-approved revisions; approval authorizes no execution)
- `docs-internal/COMPETITIVE.md` before touching `brand:competitive` (owner-only competitor index and its purpose drafts; quotes stay in Knowledge research notes; drafts never set prices or facts)
- `agent-skills/content-planner/SKILL.md` (owner plans and approves content weeks; content agents read briefs with a pin and report; `docs-internal/CONTENT_AGENT_INTEGRATION.md` connects an external bot read-only)
- `docs-internal/CONTENT_BRIDGE.md` before touching `brand:content` or the `content` strategy type (content strategy cites approved facts, never restates voice; approval is `brand:strategy`)
- `docs-internal/ASSURANCE.md` before touching `packages/brand-core/src/assurance` (claim ladder that only goes down, methodology registry, assessable controls; an internal assessment is never a certification or a compliance claim)
- `docs-internal/TASK_CONTEXT.md` before touching `packages/brand-core/src/task-context` or `task_context`, and before drafting for a task: one read-only pack of approved context per task, gaps as existing question ids, `authorizes: []`
- `docs-internal/STRATEGIC_COACH.md` before touching `brand:coach` or anything under `packages/brand-core/src/coach` (owner-local, read-only advice; `authorizes: []`; a finding never quotes an answer and never authorizes a change)
- `docs-internal/IDENTITY_BRIEF.md` before touching `brand:identity` (owner-only identity audit and logo brief; a brief or concept selection never approves a logo; skill `agent-skills/logo-identity-strategist/SKILL.md`)

Claude Code can read this checkout only after the folder is open in a permitted session. A chat product does not automatically see this private repository.

Brand Runtime: read `docs-internal/BRAND_RUNTIME.md` before touching `packages/brand-core/src/runtime` or `brand:runtime` (drafts only, copy is approved pack text, quality checks are calls into existing layers, `authorizes: []`).
