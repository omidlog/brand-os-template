# Schemas

JSON Schema draft-07 is used so Ajv can validate records without a draft-2020 vocabulary dependency.

| Schema | Records |
| --- | --- |
| `question.schema.json` | Interview questions |
| `answer.schema.json` | Ledger entries |
| `mascot-state.schema.json` | The 90 catalog rows |
| `asset.schema.json` | Asset manifest rows |

Token files are checked by the DTCG compiler in `@brand-os/design-tokens`, which is stricter than a generic object schema. Color values in this template are sRGB objects with a 6-digit `hex`. Components are optional and, when present, must match the hex.
