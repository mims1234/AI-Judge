# Spec violations observed by Quality (do not patch here)

Quality does not modify application code. Gaps below are reported against the
owning workload so the suite can stay honest about plan 11 contracts.

| ID | Owner | Contract | Observed |
|---|---|---|---|
| Q-B01 | Backend (plans 05/09) | `resolvePanelForCandidate` exported as pure fn for unit tests (plan 11 §1.1) | Private method on `RunEngineImpl` — unit suite covers `selectPanels` only; self-exclusion covered via behavioral engine/integration paths where feasible |
| Q-B02 | Backend (plan 04) | `requestHash` / retry helpers exported for unit tests (plan 11 §1.6–1.7) | `requestHash`, `backoffMs`, `classifyHttpError` are module-private — retry/idempotency pinned via `streamChat` public behavior + `request_hash` on results |
| Q-B03 | Backend (plan 06) | `disagreement`, `bundleRunTotal`, `isEligible`, `computeOverall` pure exports (plan 11 §Contracts) | Available as `computedOverall` / `median` / `mean`; disagreement is inline in `aggregateTask`; eligibility via `finalizeRun` + `queryLeaderboard.provisional` |
| Q-B04 | Backend (plan 06) | Unknown category throws in validator dispatch (plan 11 §1.3) | `runValidators` falls through `default: break` and returns universal findings only |
| Q-B05 | Backend (plan 06) | Calibration fixtures live under Quality tree | Runtime loader reads `lib/fixtures/calibration` (Backend); Quality also mirrors under `tests/fixtures/calibration` per plan 11 §4 |
| Q-F01 | Frontend (plan 10) | Leaderboard row expansion "Latest run →" link | Compare link present; latest-run deep link missing |
| Q-F02 | Frontend (plan 10) | `/compare` and `/judges` `error.tsx` boundaries | Only `/leaderboard` and `/bundles` ship route error boundaries among analytics/static pages |
| Q-F03 | Frontend (plan 07) | WCAG AA contrast for nav/`text-dim` | `#66798a` on `#070b0f` = 4.38:1 (< 4.5). Axe `color-contrast` disabled in e2e until token bump |
| Q-F04 | Frontend (plan 09/11) | Unique `data-testid="step-heading-N"` | Duplicated on `WizardStepper` md:hidden caption **and** step body; e2e uses `:visible` filter |
| Q-F05 | Frontend (plan 08/09) | No nested interactive controls | `/run` step 1 radio card wraps a focusable `/bundles` link (`nested-interactive`) |
| Q-F06 | Frontend (plan 07 Tabs) | Valid `aria-controls` IDREF | Judge/calibration Tabs use model ids with `/` in tab keys → invalid aria-controls values |

Update this file when owning workloads close gaps; flip any `it.fails` cases to normal assertions at that time.
