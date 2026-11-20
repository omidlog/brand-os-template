---
title: Illustration System
sidebar_position: 9
tags:
  - brand
  - illustration
visibility: public
module_id: illustration
owner: design
status_note: starter
---

# 09 — Illustration System

**Answer status in a fresh template:** not started. Guidance on this page is reusable. It is not an approved brand decision.
**Owner role:** design.
**Visibility of this guidance:** public. Interview answers default to internal, and some finance or partner fields are restricted.

## Purpose

Art direction for scenes that are not the mascot model sheet: shape, light, crop, and complexity.

## Decision this informs

What an illustration is allowed to contain.

## How to complete this module

1. Run `npm run brand:interview`. The agent asks one eligible question at a time.
2. Read the draft it writes under `brand/generated/drafts/` or, for restricted answers, `brand/restricted/drafts/`.
3. Approve a field only after you mean it: `npm run brand:approve -- --question <id> --proof <secret>`.
4. Add real files to the asset manifest when you have them. Missing files stay missing.

## Canonical fields

| Field | Required | Sensitivity | Question |
| --- | --- | --- | --- |
| Shape language | yes | internal | `brand.illustration.shapes` |
| Light and materials | yes | internal | `brand.illustration.light` |
| Complexity | yes | internal | `brand.illustration.complexity` |
| Character integration | yes | internal | `brand.illustration.character` |
| Unacceptable variations | yes | internal | `brand.illustration.unacceptable` |

## Guidance

Describe shape language and outline weight as rules a second illustrator can follow.

Scene complexity should name a maximum cast and a crop rule.

Educational diagrams and marketing scenes can differ if you say so.

If a mascot appears, it follows the mascot module. If the mascot is off, illustrations stay character-free.

## Fill-in record

The empty record is `brand/content/09-illustration-system/record.yaml`. Live answers are stored in `brand/instance/` and the generated draft `brand/generated/drafts/illustration.md`, so editing this overview does not approve a fact.

## Worked example

> EXAMPLE — illustrative only. Not this brand’s position, offer, price, legal status, or artwork.

EXAMPLE: flat shapes, no fake brand characters, no stock watermark art.

## Do

- Write unacceptable variations.
- Keep stock-art policy explicit.
- Separate spot art from hero scenes.

## Don't

- Do not paste unlicensed reference art into the repo.
- Do not use a photoreal child or a real customer as a style default.
- Do not let illustration contradict product status.

## Review checklist

- [ ] Style rules exist or are TBD.
- [ ] License path is clear.
- [ ] Mascot integration matches the enable flag.

## Dependencies

- `color-system`
- `brand-strategy`

## Related drafts

Machine draft: `brand/generated/drafts/illustration.md`

## Completion

Coverage counts required fields that have any honest disposition, including unknown. Approval counts only fields a permitted person has approved. `npm run brand:status` prints both. Unanswered is not approved.

## Update cadence

Review before the first commissioned set.

## Metrics

- None defined yet.

