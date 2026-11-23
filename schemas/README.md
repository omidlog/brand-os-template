# Schemas

JSON Schema draft-07 is used so Ajv can validate records without a draft-2020 vocabulary dependency.

| Schema | Records |
| --- | --- |
| `question.schema.json` | Interview questions |
| `answer.schema.json` | Ledger entries |
| `mascot-state.schema.json` | The 90 catalog rows. `status` is the artwork lifecycle (`defined`, `pending`, `created`, `reviewed`, `approved`, `published`, `deprecated`). Optional `emotion`, `use_cases`, `outfit`, `accessories`, `animation_refs`, `license`, and `artwork[]` variants (`id`, `stage`, `angle`, `intensity`, `outfit`, `accessories`, `asset_id`, `preview_asset_id`, `animation_refs`, `status`, `version`, `license`). `brand:validate` adds lifecycle rules; `brand:migrate` converts pre-0.2 statuses. |
| `asset.schema.json` | Asset manifest rows |
| `task-context.schema.json` | The `task_context` pack (`brand-os/task-context/v1`). Not a stored record: it is the read-only output contract of the Task Context Engine (`docs-internal/TASK_CONTEXT.md`), checked against this schema in `tests/task-context.test.ts`. |
| `coach-result.schema.json` | One Strategic Coach analysis (`brand:coach`). Advisory and derived: `authority` is always `derived_advice`, `authorizes` is always empty, and the record carries ids, closed-vocabulary codes and explanation text only — never an answer value, a quotation, a restricted value or a score. The authoritative validator is the Zod schema in `packages/brand-core/src/coach/model.ts`; `tests/coach-core.test.ts` checks real results against both so they cannot drift. |

Token files are checked by the DTCG compiler in `@brand-os/design-tokens`, which is stricter than a generic object schema. Color values in this template are sRGB objects with a 6-digit `hex`. Components are optional and, when present, must match the hex.
