---
title: Finance & Unit Economics
sidebar_position: 7
tags:
  - business
  - business-finance
visibility: public
module_id: business-finance
owner: finance
status_note: starter
---

# BO-07 — Finance & Unit Economics

**Answer status in a fresh template:** not started. Guidance on this page is reusable. It is not an approved brand decision.
**Owner role:** finance.
**Visibility of this guidance:** public. Interview answers default to internal, and some finance or partner fields are restricted.

## Purpose

Record currency, accounting basis, and the assumptions behind any model. Figures stay unknown unless the owner supplies them with a date and a confidence label. This is not an audit.

## Decision this informs

Which financial statements are assumptions, and which systems are authoritative.

## How to complete this module

1. Run `npm run brand:interview`. The agent asks one eligible question at a time.
2. Read the draft it writes under `brand/generated/drafts/` or, for restricted answers, `brand/restricted/drafts/`.
3. Approve a field only after you mean it: `npm run brand:approve -- --question <id> --proof <secret>`.
4. Add real files to the asset manifest when you have them. Missing files stay missing.

## Canonical fields

| Field | Required | Sensitivity | Question |
| --- | --- | --- | --- |
| Reporting currency | yes | internal | `business.finance.currency` |
| Accounting basis | yes | internal | `business.finance.basis` |
| Revenue figure | yes | restricted | `business.finance.revenue_figure` |
| Cost drivers | yes | restricted | `business.finance.costs` |
| Runway | optional | restricted | `business.finance.runway` |
| Pricing economics note | yes | internal | `business.finance.economics_note` |
| Finance system | optional | internal | `business.finance.system` |
| Scenarios | optional | internal | `business.finance.scenarios` |
| Pricing summary | canonical reference | internal | `business.sales.pricing` |
| Revenue model | canonical reference | internal | `business.model.revenue` |

## Guidance

Every number needs currency, period, source, and whether it is actual, plan, or estimate.

Do not compute a vanity LTV from missing inputs. Show the missing input instead.

Bank statements, tax identifiers, and raw ledgers do not belong in this repository.

Optimistic, base, and conservative cases are labels for scenarios the owner defines, not three invented spreadsheets.

## Inputs

- Pricing record
- Owner estimates with dates

## Artifacts

- Assumption sheet
- Scenario labels
- System-of-record pointer

## Acceptance

- A reader can see that the template contains no financial performance.

## Fill-in record

The empty record is `brand/business-os/07-finance-unit-economics/record.yaml`. Live answers are stored in `brand/instance/` and the generated draft `brand/generated/drafts/business-finance.md`, so editing this overview does not approve a fact.

## Worked example

> EXAMPLE — illustrative only. Not this brand’s position, offer, price, legal status, or artwork.

EXAMPLE: reporting currency is undecided, revenue is unknown, and there is no runway claim.

## Do

- Point at the finance system of record.
- Keep restricted figures in the restricted collection.
- Say unknown.

## Don't

- Do not manufacture MRR, burn, or runway.
- Do not claim audit readiness.
- Do not store account numbers.

## Review checklist

- [ ] Currency is set or unknown.
- [ ] No restricted figure appears in a public draft.
- [ ] Pricing economics reference the sales pricing record.

## Dependencies

- `business-company`
- `business-sales`

## Related drafts

Machine draft: `brand/generated/drafts/business-finance.md`

## Completion

Coverage counts required fields that have any honest disposition, including unknown. Approval counts only fields a permitted person has approved. `npm run brand:status` prints both. Unanswered is not approved.

## Update cadence

Update assumptions when a real close happens. Do not copy the live ledger into Git.

## Metrics

- Fields with provenance
- Restricted leaks

