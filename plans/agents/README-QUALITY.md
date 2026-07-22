# Work Order — QUALITY (Testing + Deployment Verification)

Track F. You go LAST — you test everything and change no application code.

## Mission

You build the complete verification layer for AI Judge: Vitest unit suites for the pure logic (panels, scoring, validators, eligibility, cost, retry, idempotency), integration suites that drive the OpenRouter client and run engine against a local mock server and temp SQLite databases, Playwright end-to-end coverage of the full configure → run → reconnect → report → leaderboard → export flow plus accessibility and responsive checks, and the shared fixture library all layers use. You also verify the plan-12 operational checklist (npm scripts, backup, security greps) and execute the manual smoke run.

## Read first (in order)

1. [../00-overview.md](../00-overview.md) — shared vocabulary: tables, statuses, categories, SSE contract, methodology rules
2. [../11-testing-verification.md](../11-testing-verification.md) — your primary spec: every test file, case list, fixture tree, smoke checklist
3. [../12-env-deployment.md](../12-env-deployment.md) — npm scripts, env override contract, backup script, security baseline you verify
4. [../02-seed-bundle.md](../02-seed-bundle.md) + [../06-scoring-judging.md](../06-scoring-judging.md) — validator boundaries and scoring math your tests pin
5. [../13-bundle-catalog.md](../13-bundle-catalog.md) — Octant/`mini-benchmark-v1` identity + content-hash pin (`tests/unit/bundle-identity.test.ts`)
5. [../README.md](../README.md) — collision rules and the shared-contract "do not break" list

## You own (create/edit)

- `vitest.config.ts`, `playwright.config.ts`
- `tests/unit/panel-selection.test.ts`, `tests/unit/scoring.test.ts`, `tests/unit/eligibility.test.ts`, `tests/unit/cost.test.ts`, `tests/unit/retry.test.ts`, `tests/unit/idempotency.test.ts`, `tests/unit/calibration.test.ts`, `tests/unit/bundle-identity.test.ts`
- `tests/unit/validators/common.test.ts`, `tests/unit/validators/math.test.ts`, `tests/unit/validators/coding.test.ts`, `tests/unit/validators/dispatch.test.ts`
- `tests/integration/helpers/mock-openrouter.ts` (scriptable in-process mock: models list, byte-exact SSE replays, 429/500/hang/socket-drop behaviors), `tests/integration/helpers/test-db.ts` (temp SQLite + migrations)
- `tests/integration/stream-parsing.test.ts`, `tests/integration/judge-repair.test.ts`, `tests/integration/cancellation.test.ts`, `tests/integration/sse-reconnect.test.ts`, `tests/integration/crash-recovery.test.ts`
- `tests/e2e/global-setup.ts`, `tests/e2e/full-run-flow.spec.ts`, `tests/e2e/run-controls.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/responsive.spec.ts`
- `tests/fixtures/**` — full tree per plan 11 §4 (models list, per-category candidate outputs in valid/invalid-JSON/constraint-violating flavors, judge parse-outcome fixtures, byte-level `.sse` recordings, human-reviewed `calibration/cases/*.json` + provenance README)
- `scripts/record-fixture.ts` (dev-only fixture recorder; never runs in CI)

## You must NOT touch

- Any application code: `lib/**`, `app/**`, `components/**`, migrations, `scripts/migrate.ts`, `scripts/backup.ts`, `.env.example`, `package.json` scripts, `tsconfig.json`. If a test exposes a spec violation, report it against the owning plan file / workload (Database = plans 01/02/12, Backend = plans 03–06, Frontend = plans 07–10) instead of patching the code
- Do not run `scripts/record-fixture.ts` in CI or against the real API without an explicit budget decision

## Dependencies

- **Before you start:** all three other workloads must be substantially complete — you exercise their public surfaces. Specifically you rely on: `lib/db.ts` honoring `DATABASE_PATH` overrides with a callable migration runner; `lib/openrouter.ts` reading `OPENROUTER_BASE_URL` at call time (mock-server substitution); panel selection and scoring math exported as pure functions from `lib/run-engine.ts`/`lib/prng.ts`/`lib/scoring.ts`; SSE events with durable monotonic ids; and Frontend's ARIA roles + `data-testid` hooks (`cell-<candidate>-<category>`, drawer, step headings, live region, export buttons)
- **Environment (from plan 12):** dev deps `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `@axe-core/playwright`, `tsx`, `cross-env` are installed by the Database workload; scripts `test` / `test:watch` / `test:e2e` already exist in `package.json`
- **Isolation rules:** integration/e2e tests never touch `./data/ai-judge.sqlite` (temp-file DBs, deleted in teardown), never call real OpenRouter (dummy `OPENROUTER_API_KEY=test-key`), and every randomness-touching test passes an explicit seed

## Shared contracts (do not break — your tests PIN these)

- **8 categories (exact, lowercase):** `roleplay, coding, math, research, marketing, poster, story, judging` — dispatch tests route each to its validator set; unknown category throws
- **`task_results.status`:** `pending, streaming, validating, judging, scored, error` with the legal transition chain — crash-recovery tests assert no `scored` row without its `task_scores` row and that resume skips `scored`/`error`
- **Run statuses:** `queued, running, paused` + terminals `completed / cancelled / incomplete`; cancelled and incomplete runs never leaderboard-eligible
- **SSE events:** persisted events carry durable monotonic integer ids from `run_events`; `Last-Event-ID` replay returns every event > cursor in order with no gaps/duplicates, surviving engine restart; token events are ephemeral
- **Table names:** the 13 canonical tables + `run_events` + `app_settings` — fixtures/assertions use exact snake_case names
- **Math ground truth:** free = **552**, paid = **432** exactly; regression tests must reject 436 (the classic 4%-of-448 churn error) and any tolerance window
- **Validator boundaries:** poster passes 64 words / fails 65+; story passes exactly 500 and 700, fails 499/701; roleplay exactly 3 questions + 5 steps; coding ≥ 5 tests, shape-only — a grep-tripwire test proves no `eval`/`new Function`/`node:vm`/`child_process` on model output
- **Blind seeded panels:** determinism against golden values, seed sensitivity, category independence, shared panel per category, self-exclusion swaps to the first seeded reserve for that candidate only with the substitution recorded, typed error on insufficient pools
- **Scoring:** median/disagreement math, server-computed overall (claimed overall never aggregated), equal-weight macro-average, leaderboard median of complete runs, provisional boundary at exactly 3; infrastructure failure → `incomplete`, never zero, while judged-bad garbage IS a real (low) score
- **Idempotency:** same-run duplicate suppression only; hashes differ across runs and trial indices (no benchmark leakage)
- **Env vars:** `OPENROUTER_BASE_URL` and `DATABASE_PATH` overrides are your mock/temp hooks; verify `OPENROUTER_API_KEY` never appears in client bundles, exports, or logs (plan 12 security greps)

## Definition of done

- [ ] `npm test` runs all unit + integration suites green in < 2 minutes, no network access, no writes outside temp dirs
- [ ] `npm run test:e2e` runs all Playwright specs green against the mock OpenRouter server with a dummy key
- [ ] Unit suites cover every case list in plan 11 §1: panel fairness/self-exclusion (golden values), scoring precision, all validator boundaries (552/432, 64/65, 499/500/700/701, 3+5, off-by-one array counts), eligibility distinction (infra vs judged-bad), retry classification + backoff under fake timers, idempotency hashing
- [ ] Integration suites cover plan 11 §2: chunk-split/UTF-8-torture SSE parsing, malformed judge JSON → schema retry → reserve replacement with all attempts persisted, mid-stream cancellation aborting sockets, `Last-Event-ID` replay across engine restart, crash recovery that skips scored work and never double-writes derived scores
- [ ] E2E covers the full flow (configure → preflight → run → reconnect via mid-run reload → report → leaderboard → export with parsed downloads) plus pause/resume/cancel/retry controls
- [ ] Axe scans report no serious/critical violations on `/`, `/run` (all 4 steps), `/runs/[id]` live + completed, `/leaderboard`, `/compare`, `/judges`; keyboard-only run setup and arena inspection pass; live-region announcements and reduced-motion asserted
- [ ] Responsive checks pass at 375 / 768 / 1440 with no horizontal overflow
- [ ] Fixture tree matches plan 11 §4 exactly, including the human-reviewed calibration set with provenance README; no test layer invents ad-hoc model outputs for covered scenarios
- [ ] Plan 12 operational checks verified: `db:migrate` idempotent, `db:backup` valid while app runs, no `runtime = "edge"` anywhere, API key absent from `.next/static`, CSV formula-injection neutralized
- [ ] Manual smoke run executed once with cheap models under a $0.50 hard cap; actual cost within the preflight range; results recorded

## Kickoff prompt

> You are the Quality agent for AI Judge. The Database, Backend, and Frontend workloads are complete. Read plans/agents/README-QUALITY.md fully, then plans/00-overview.md, plans/11-testing-verification.md, and the npm-scripts/backup/security sections of plans/12-env-deployment.md. Implement exactly the files listed under "You own": vitest.config.ts, playwright.config.ts, every tests/unit, tests/integration, and tests/e2e file from plan 11, the two integration helpers (mock OpenRouter server, temp-DB factory), the full tests/fixtures tree, and scripts/record-fixture.ts. All integration and e2e tests must use temp DATABASE_PATH files and point OPENROUTER_BASE_URL at the in-process mock — never the real API, never ./data. Pin the shared contracts in assertions: math 552/432 (rejecting 436), poster/story/roleplay word and count boundaries, seeded panel determinism with golden values, infra-failure-never-zero eligibility, Last-Event-ID replay, and crash-recovery invariants. Do not modify any application code — if a test exposes a spec violation, report it against the owning plan file and workload instead of patching. Finish with the plan-12 operational verifications and the manual smoke-run checklist.
