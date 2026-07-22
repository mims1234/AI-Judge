# Calibration fixture provenance

Human-reviewed calibration set used by `tests/unit/calibration.test.ts` (plans/11 §4).

| Case | Reviewer | Reviewed | Notes |
|---|---|---|---|
| perfect-math | Quality scaffold | 2026-07-22 | Ground-truth 552/432; high evidence expected |
| math-off-by-rounding | Quality scaffold | 2026-07-22 | Classic 436 wrong-paid trap |
| poster-66-words | Quality scaffold | 2026-07-22 | Word-limit boundary fail |
| story-499-words | Quality scaffold | 2026-07-22 | Story lower bound fail |
| roleplay-4-questions | Quality scaffold | 2026-07-22 | Count off-by-one |
| coding-shape-ok | Quality scaffold | 2026-07-22 | Shape-only coding pass |
| empty-fluff | Quality scaffold | 2026-07-22 | Low concreteness / evidence |
| confident-wrong | Quality scaffold | 2026-07-22 | High claim, contradicted validators |

Source copies also live under `lib/fixtures/calibration` (Backend loader path). Keep both trees in sync when editing cases.
