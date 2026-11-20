# Localization

The portal builds `en`, `fa` (right to left), and `tr`. Interview prompts exist in those three languages. Official brand sentences are not auto-translated.

Approved translations, when a human writes them, belong in `brand/translations/<locale>/<field-id>.md` with `status: approved` and the approver's name. Until that file exists, the English source remains the only official wording and the other locales reuse it for layout. Search stemming is English-only in this version.
