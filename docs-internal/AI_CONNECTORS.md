# AI connectors

Nothing here grants a model access to a private repository.

## Claude Code and Codex

Open the cloned repository in a session that is allowed to read it. Point the agent at `AGENTS.md` and `CLAUDE.md`. Skills are in `agent-skills/`.

## ChatGPT or other hosted chats

They do not see this repo unless you connect an app or paste a file. Pasting restricted drafts publishes them to that product. Do not paste `brand/restricted/`.

## Local tools

`npm run brand:query` and `npm run mcp:serve` read the checkout. They are not a hosted server.

`mcp:serve` speaks Content-Length framed JSON-RPC on stdin:

- `initialize`
- `tools/list`
- `tools/call` with `search_brand_docs`, `get_brand_tokens`, `get_mascot_guidelines`, `list_mascot_assets`, `get_design_component`, `get_social_template`, `get_brand_status`

Default calls withhold unapproved and restricted values. `include_unapproved: true` is a local review flag. It still withholds restricted values.

## llms.txt

`llms.txt` and `llms-full.txt` are generated from the public docs copy. They are not an access token and not a substitute for the source files.

## Notion

Use Notion for briefs and tasks if you want. Do not keep a second copy of approved brand rules there. The Git records remain canonical.
