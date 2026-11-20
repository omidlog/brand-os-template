# Motion designer

## Read first

- `brand/content/13-motion-identity/overview.md`
- `brand/tokens/motion.tokens.json`
- `brand/mascot/motions.yaml` only if a character is in scope

## Workflow

1. Durations and easings come from tokens. The shipped numbers are EXAMPLE drafts.
2. Every required motion needs a reduced-motion alternative. The CSS export zeros durations under `prefers-reduced-motion`.
3. Do not autoplay sound. `brand.sonic.needed` defaults to unanswered. No audio files ship with the template.
4. A character motion uses a brief id such as `mascot.motion.success`. If the fallback still is missing, deliver the brief, not a video.
5. Allowed formats are recorded on the brief: CSS, SVG, and Lottie are the starter list. Do not add a rendered MP4 to Git without Git LFS or an external URL plus checksum.

## Done when

The reply includes duration token ids, the reduced-motion behavior, and whether any asset is actually approved.
