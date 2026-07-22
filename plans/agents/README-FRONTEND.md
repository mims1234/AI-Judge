# Work Order — FRONTEND (Design System, Pages, Workbench, Analytics)

Tracks D + E combined. Starts once the Database scaffold exists; the live workbench targets Backend's frozen API/SSE contracts (build against mocks until Backend lands).

## Mission

You build the entire user-facing surface of AI Judge: the dark-only "lab instrument" design system (tokens, ~21 UI primitives, motion, a11y), the static pages (`/`, `/models`, `/bundles`, `/settings`), the four-step run wizard and the live SSE-driven arena workbench at `/runs/[id]`, and the analytics surfaces (`/leaderboard`, `/compare`, `/judges`, the completed-run Report tab) with hand-rolled SVG charts. The API routes and SSE events you consume are frozen in plans 03/09 — code against those contracts with mocks wherever Backend isn't finished yet.

## Read first (in order)

1. [../00-overview.md](../00-overview.md) — shared vocabulary: routes, statuses, categories, SSE contract, file layout
2. [../07-design-system.md](../07-design-system.md) — tokens, typography, all `components/ui/*` primitives, motion, a11y
3. [../08-frontend-pages.md](../08-frontend-pages.md) — landing, models catalog + ModelPicker, bundles, settings (+ the two settings API routes you own)
4. [../09-run-workbench.md](../09-run-workbench.md) — run wizard, arena grid, cell drawer, SSE client + reconnect protocol
5. [../10-leaderboard-analytics.md](../10-leaderboard-analytics.md) — leaderboard, compare, judges, report tab, chart primitives
6. [../03-backend-api.md](../03-backend-api.md) — reference only: the exact route/SSE contracts you consume
7. [../README.md](../README.md) — collision rules and the shared-contract "do not break" list

## You own (create/edit)

Design system (plan 07): `app/globals.css`, `app/layout.tsx`, `lib/cn.ts`, `lib/format.ts`, and all of `components/ui/`: `ScoreBadge, VerdictBadge, FeedbackChip, StreamPanel, ProgressRail, StatCard, DataTable, Button, Input, Badge, Tooltip, Drawer, Modal, Tabs, EmptyState, Skeleton, StatusDot, DisagreementFlag, StatusAnnouncer, AppShell` (.tsx each)

Static pages (plan 08): `app/page.tsx`; `app/models/{page,loading}.tsx`; `app/bundles/{page,loading,error}.tsx`; `app/settings/{page,loading}.tsx`; `app/api/settings/route.ts` + `app/api/settings/test-key/route.ts` (yes — these two API routes are yours); `components/landing/{VerdictPlane,StepCard,RankingPreview}.tsx`; `components/models/{ModelPicker,VirtualList,ModelRow,ModelDetailDrawer,CatalogHeader}.tsx`; `components/bundles/{BundleHeaderCard,TaskCard,TaskCardGrid,ChangelogList}.tsx`; `components/settings/{ApiKeyCard,SettingsForm,DataCard}.tsx`; `lib/fuzzy.ts`

Workbench (plan 09): `app/run/page.tsx`; `app/runs/[id]/{page,loading}.tsx`; `components/run/{WizardStepper,StepBundle,StepCandidates,StepJudgePool,StepReview,OverlapWarning}.tsx`; `components/arena/{Workbench,RunHeader,ArenaGrid,ArenaCell,CellDrawer,JudgeVerdictCard,ValidatorPanel,TrialTabs}.tsx`; `lib/client/{useRunStream,runStore,runDraft}.ts`

Analytics (plan 10): `app/leaderboard/{page,loading,error}.tsx`; `app/compare/{page,loading}.tsx`; `app/judges/{page,loading}.tsx`; `components/charts/{CategoryRadar,Sparkline,ScoreDistributionStrip,MiniBar}.tsx`; `components/leaderboard/{LeaderboardTable,LeaderboardControls,RowExpansion}.tsx`; `components/compare/{CompareChips,CompareOverview,ScoreMatrix,SameTaskAnswers,ReliabilityEconomics}.tsx`; `components/judges/{JudgeTable,JudgeRowExpansion,CalibrationTable}.tsx`; `components/report/{RunReport,FinalScoreMatrix,CostBreakdown,RunMetadata}.tsx`

## You must NOT touch

- `lib/db.ts`, migrations, `lib/bundles/mini-v1.ts`, `lib/env.ts`, `scripts/**`, `package.json` dependency set, `tsconfig.json` (Database)
- `app/api/**` other than the two settings routes, `lib/schemas.ts` (import types only — never edit), `lib/api-helpers.ts`, `lib/openrouter.ts`, `lib/run-engine.ts`, `lib/prng.ts`, `lib/scoring.ts`, `lib/validators/**` (Backend). Server components may CALL Backend/Database read helpers (`lib/scoring.ts` queries, `lib/openrouter.ts` `getModelCatalog`, `lib/db.ts` reads) but never modify them
- `vitest.config.ts`, `playwright.config.ts`, `tests/**` (Quality). Do ship the `data-testid` hooks plan 11 expects (arena cells `cell-<candidate>-<category>`, drawer, step headings, live region, export buttons)

## Dependencies

- **Before you start:** the Database scaffold (repo, Tailwind, folder layout) must exist. That is enough for the design system, landing, bundles, and settings shells.
- **Backend contracts you consume** (frozen in plans 03/09 — build against them with mocks/fixtures until real routes exist): `GET /api/models`, `POST /api/runs/preflight`, `POST /api/runs`, `GET /api/runs/[id]` (canonical snapshot + `last_event_id`), `GET /api/runs/[id]/events` (SSE with `Last-Event-ID`/`?lastEventId=` replay), pause/resume/cancel, task retry, `GET /api/leaderboard`, `GET /api/runs/[id]/export`. Server components additionally call `lib/scoring.ts` query helpers directly (leaderboard/compare/judges/landing preview).
- **You consume from Database:** seeded bundle rows via `lib/db.ts` for `/bundles`, and settings storage in `app_settings`.
- **Others consume from you:** Quality's Playwright/a11y suites drive every page you build and depend on your ARIA roles, keyboard behaviors, live region, and test ids.

## Shared contracts (do not break)

- **8 categories (exact, lowercase in data/APIs):** `roleplay, coding, math, research, marketing, poster, story, judging` — capitalize only at render time
- **Task cell statuses:** `pending, streaming, validating, judging, scored, error` — the arena cell state machine maps 1:1 to these; import status/verdict types from `lib/schemas.ts`, never redeclare
- **Run statuses:** `queued, running, paused` + terminals `completed / cancelled / incomplete`; only `completed` runs are leaderboard-eligible; infra failures render as error/incomplete, never zero scores
- **SSE protocol:** monotonic integer event ids, ephemeral token events carry no `id:`, 15s heartbeats, rehydrate-from-snapshot-then-subscribe, 45s watchdog, `?lastEventId=` reconnect, `resync` → refetch snapshot. Plan 09 §3.2's event-name table is your client contract and matches the canonical catalog in 00-overview §4.5 (also restated in plans 03/05) — client and engine share one `SseEventSchema` vocabulary
- **Math ground truth 552/432:** display-only for you (ValidatorPanel expected-vs-actual, bundle task card) — never recompute it
- **Blind seeded panels:** UI surfaces the consequences — reserve-substitution captions on judge cards ("reserve judge (self-judging swap)"), overlap warnings in wizard steps 3/4, panel + reserve order in the report metadata
- **Scoring display rules:** cells show the median of 3 server-computed overalls; `DisagreementFlag` only when spread > 3; TOTAL = equal-weight macro-average; provisional badge < 3 complete runs; judge's claimed overall shown only as a calibration footnote
- **Env vars:** never touch `OPENROUTER_API_KEY` in client code; `/settings` shows only configured-status + masked tail from a server-side check
- **Security:** model output renders as escaped text while streaming and sanitized markdown when done (marked + DOMPurify allowlist); never `dangerouslySetInnerHTML` unsanitized model text, never render candidate HTML live, never raw judge JSON in the UI
- **Design law:** dark-only, teal the sole accent, score-ramp band colors exclude teal, borders over shadows, mono for all measured values, `prefers-reduced-motion` disables every animation

## Definition of done

- [ ] All plan-07 tokens exist as CSS vars mapped into Tailwind; the 20+ `components/ui/*` primitives match their prop specs; focus outlines, StatusAnnouncer, and reduced-motion block work globally
- [ ] `/` renders the hero (exact tagline), methodology row, live ranking preview with empty state, VerdictPlane (hidden <640px)
- [ ] `/models`: virtualized 400+ model list grouped by provider, dependency-free fuzzy search (<5ms/450 models), free-only filter, `?model=` drawer; ModelPicker palette variant reusable by the wizard
- [ ] `/bundles`: 8 task cards with Prompt/Schema/Validators tabs, wrapper + rubric collapsibles, content hash, immutability caption
- [ ] `/settings`: masked key status + test-connection, Zod-validated defaults persisted via your `GET/PUT /api/settings`, data card with cache refresh
- [ ] Wizard: 4 steps with per-step validation, sessionStorage draft, `?step=`/`?candidates=` deep links, preflight-driven Review with hard cap + confirm dialog, double-submit-safe launch
- [ ] Arena: grid walks all six cell states with plan-07 motions; URL-addressable cell drawer with StreamPanel, ValidatorPanel (expected vs actual), three structured JudgeVerdictCards; keyboard grid navigation and aria-labels
- [ ] SSE client: rehydrate → subscribe → idempotent delta appliers; watchdog + capped jittered backoff; token buffers outside React state (only the open drawer subscribes, ≤80ms flush); replay mode for terminal runs with Arena|Report tabs
- [ ] `/leaderboard` (9 columns, provisional handling, expandable radar + table alt, CSV/JSON export links), `/compare` (1–4 models, radar with legend toggles, score matrix, same-task answers, score-per-dollar), `/judges` (harshness/variance/parse-fail/meta-ratings, calibration table), Report tab (score matrix, cost breakdown, metadata, export links)
- [ ] All four chart components are dependency-free SVG with `role="img"` labels and table alternatives; every page has loading skeletons, empty states, and error boundaries; responsive specs hold at 375/768/1280+

## Kickoff prompt

> You are the Frontend agent for AI Judge. The Database workload has scaffolded the repo (Next.js 15, Tailwind, folder layout). Read plans/agents/README-FRONTEND.md fully, then plans/00-overview.md, plans/07-design-system.md, plans/08-frontend-pages.md, plans/09-run-workbench.md, plans/10-leaderboard-analytics.md, and (as consumed contracts only) plans/03-backend-api.md. Build in this order: (1) design system — globals.css tokens, layout.tsx, lib/cn.ts, lib/format.ts, every components/ui primitive; (2) static pages — landing, models catalog with ModelPicker + lib/fuzzy.ts, bundles, settings including the two app/api/settings routes you own; (3) run wizard and the live arena workbench with the SSE client in lib/client (build against the frozen SSE/API contracts in plans 03 and 09, using mocks where Backend isn't ready); (4) leaderboard, compare, judges, charts, and the Report tab. Import types from lib/schemas.ts and primitives from components/ui without modifying anything owned by Database or Backend; never restate hex values outside globals.css; sanitize all rendered model output; include the data-testid hooks plan 11 expects. If an API/SSE contract seems inconsistent between plan files, fix the plan file first, then code.
