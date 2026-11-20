---
title: Sonic Branding
sidebar_position: 14
tags:
  - brand
  - sonic
visibility: public
module_id: sonic
owner: brand
status_note: starter
---

# 14 — Sonic Branding

**Answer status in a fresh template:** not started. Guidance on this page is reusable. It is not an approved brand decision.
**Owner role:** brand.
**Visibility of this guidance:** public. Interview answers default to internal, and some finance or partner fields are restricted.

## Purpose

Optional sound: logos, cues, voice, loudness, and rights. Silence is a valid brand choice. Sound-off is required either way.

## Decision this informs

Whether sound exists and which rights allow it.

## How to complete this module

1. Run `npm run brand:interview`. The agent asks one eligible question at a time.
2. Read the draft it writes under `brand/generated/drafts/` or, for restricted answers, `brand/restricted/drafts/`.
3. Approve a field only after you mean it: `npm run brand:approve -- --question <id> --proof <secret>`.
4. Add real files to the asset manifest when you have them. Missing files stay missing.

## Canonical fields

| Field | Required | Sensitivity | Question |
| --- | --- | --- | --- |
| Sound | yes | internal | `brand.sonic.needed` |
| Sonic logo | optional | internal | `brand.sonic.logo` |
| Cues | yes | internal | `brand.sonic.cues` |
| Rights | yes | internal | `brand.sonic.rights` |
| Sound off | yes | internal | `brand.sonic.fallback` |
| Name usage | canonical reference | internal | `brand.verbal.name_use` |
| Third-party content | canonical reference | internal | `business.legal.third_party` |

## Guidance

A sonic logo is not required. Many brands should answer no.

Voiceover pronunciation follows the verbal module.

Music needs a license and a mood reference the owner supplies, not a downloaded track.

Loudness targets are TBD until a sound exists. Do not invent LUFS numbers as if they were measured.

## Fill-in record

The empty record is `brand/content/14-sonic-branding/record.yaml`. Live answers are stored in `brand/instance/` and the generated draft `brand/generated/drafts/sonic.md`, so editing this overview does not approve a fact.

## Worked example

> EXAMPLE — illustrative only. Not this brand’s position, offer, price, legal status, or artwork.

EXAMPLE: sound is off. No audio files are shipped.

## Do

- Keep a mute path.
- Record rights next to any cue.
- Separate UI sounds from advertising music.

## Don't

- Do not add stock audio to the repo without a license.
- Do not autoplay sound.
- Do not claim a mascot voice that was never recorded.

## Review checklist

- [ ] Need is yes or no.
- [ ] Rights are cited or not applicable.
- [ ] Sound-off behavior exists.

## Dependencies

- `verbal-identity`

## Related drafts

Machine draft: `brand/generated/drafts/sonic.md`

## Completion

Coverage counts required fields that have any honest disposition, including unknown. Approval counts only fields a permitted person has approved. `npm run brand:status` prints both. Unanswered is not approved.

## Update cadence

Review before any audio is published.

## Metrics

- None defined yet.


## Machine translation draft (fa)

> status: draft machine-translation. Not an approved brand fact.

این صفحه راهنمای قالب است، نه تصمیم تأییدشدهٔ برند. مصاحبه را با `npm run brand:interview` شروع کنید. پاسخ‌ها پیش‌نویس می‌مانند تا یک انسان با `--proof` آن‌ها را تأیید کند. فیلدهای نامشخص را خالی بگذارید و حدس نزنید.

## Machine translation draft (tr)

> status: draft machine-translation. Not an approved brand fact.

Bu sayfa şablon rehberidir, onaylanmış bir marka kararı değildir. Görüşmeyi `npm run brand:interview` ile başlatın. Yanıtlar, bir insan `--proof` ile onaylayana kadar taslak kalır. Bilinmeyen alanları boş bırakın; tahmin etmeyin.
