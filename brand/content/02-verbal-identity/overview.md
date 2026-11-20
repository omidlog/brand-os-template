---
title: Verbal Identity
sidebar_position: 2
tags:
  - brand
  - verbal-identity
visibility: public
module_id: verbal-identity
owner: brand
status_note: starter
---

# 02 — Verbal Identity

**Answer status in a fresh template:** not started. Guidance on this page is reusable. It is not an approved brand decision.
**Owner role:** brand.
**Visibility of this guidance:** public. Interview answers default to internal, and some finance or partner fields are restricted.

## Purpose

Fix the name, voice, vocabulary, and microcopy rules. Official statements are stored in the language the owner approved. This system does not auto-translate them.

## Decision this informs

Which words are allowed, required, or forbidden.

## How to complete this module

1. Run `npm run brand:interview`. The agent asks one eligible question at a time.
2. Read the draft it writes under `brand/generated/drafts/` or, for restricted answers, `brand/restricted/drafts/`.
3. Approve a field only after you mean it: `npm run brand:approve -- --question <id> --actor owner`.
4. Add real files to the asset manifest when you have them. Missing files stay missing.

## Canonical fields

| Field | Required | Sensitivity | Question |
| --- | --- | --- | --- |
| Name usage | yes | internal | `brand.verbal.name_use` |
| Public name override | yes | internal | `brand.identity.public_name_override` |
| Tagline | optional | internal | `brand.verbal.tagline` |
| Tone of voice | yes | internal | `brand.verbal.voice` |
| Forbidden language | yes | internal | `brand.verbal.forbidden` |
| Localization | yes | internal | `brand.verbal.localization` |
| Microcopy principle | yes | internal | `brand.verbal.microcopy` |
| Trade name | canonical reference | public | `business.identity.trade_name` |
| Personality | canonical reference | internal | `brand.personality.traits` |

## Guidance

Record spelling, pronunciation, and what never to abbreviate.

Taglines are optional. A missing tagline stays missing.

Tone adapts by channel only after the base voice exists.

Keep Persian, English, and Turkish UI chrome separate from approved brand sentences.

## Fill-in record

The empty record is `brand/content/02-verbal-identity/record.yaml`. Live answers are stored in `brand/instance/` and the generated draft `brand/generated/drafts/verbal-identity.md`, so editing this overview does not approve a fact.

## Worked example

> EXAMPLE — illustrative only. Not this brand’s position, offer, price, legal status, or artwork.

EXAMPLE forbidden line: “The world’s most loved app.” No evidence, so it is not a template default.

## Do

- Point product microcopy at the same voice.
- List forbidden claims (superlatives, medical or financial promises) explicitly.
- Note localization owners per language.

## Don't

- Do not publish a slogan the owner has not approved.
- Do not machine-translate a legal or brand promise.
- Do not invent a pronunciation that conflicts with the owner.

## Review checklist

- [ ] Name spelling matches the canonical trade name or an approved override.
- [ ] Forbidden language includes unapproved prices and unshipped features.
- [ ] Examples in the docs are labeled EXAMPLE.

## Dependencies

- `brand-strategy`

## Related drafts

Machine draft: `brand/generated/drafts/verbal-identity.md`

## Completion

Coverage counts required fields that have any honest disposition, including unknown. Approval counts only fields a permitted person has approved. `npm run brand:status` prints both. Unanswered is not approved.

## Update cadence

Review before any public campaign.

## Metrics

- None defined yet.

