# 09 — Run Workbench: Setup Wizard & Live Arena

## Purpose and Scope

This document specifies the core experience of AI Judge: `/run` (the four-step benchmark setup wizard) and `/runs/[id]` in its **live** state (the reconnectable arena workbench) and **replay** state (completed runs, archived text, same layout). It defines the wizard steps and validation, the arena grid state machine and animations, the cell drawer (candidate stream + validator checklist + three judge verdict cards), the live header with run controls, the full SSE client protocol (EventSource, `Last-Event-ID` reconnect, canonical rehydration), and client-side state management.

**In scope:** everything under `/run` and the live/replay behavior of `/runs/[id]`, plus the client SSE/state layer.

**Out of scope:** the completed-run **report view** tab content (scores summary, cost breakdown, exports — plan 10, rendered under the same route), the run engine itself and event emission (backend plans), UI primitives (plan 07), `ModelPicker` internals (plan 08).

---

## 1. `/run` — Four-Step Setup Wizard

### 1.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ CONFIGURE RUN                                                  │
│ ①─Bundle───②─Candidates───③─Judge pool───④─Review   (stepper)  │
│ ═══════════╪──────────────────────────────────────  (rail)     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│                 [ step content area ]                          │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ [← Back]                          step summary    [Continue →] │
└────────────────────────────────────────────────────────────────┘
```

- Single-page client component; steps are panels, not routes. Current step in `?step=` searchParam so refresh/back work. Draft config persisted to `sessionStorage` (`ai-judge:run-draft`) on every change; restored on mount.
- The stepper is clickable for visited steps only; future steps disabled until the current one validates. `ProgressRail` under the stepper shows completion.
- Footer summary line updates live, e.g. step 2: "3 candidates selected"; step 4: "48 tasks · est. $0.84–$1.32".

### 1.2 Step 1 — Bundle

- `RadioCard` list of published bundles (default and usually only: `mini-benchmark-v1`), each showing version, hash prefix, category count, "View details →" link to `/bundles`.
- Category include/exclude: 8 checkboxes (all on by default) rendered as toggleable chips under the selected bundle. Deselecting any category shows a persistent dim note: "Partial runs never enter the main leaderboard — only complete bundle runs are ranked."
- Validation: exactly one bundle; ≥1 category.

### 1.3 Step 2 — Candidates

- Big "Add candidates" button opens `ModelPicker` (palette variant, plan 08) with `maxSelection: 8` (matches `PreflightRequestSchema`: candidates min 1 / max 8, plan 03 §2).
- Selected candidates render as a card list: model name, provider, context Badge, price badges, remove ×. Reorder not needed (order has no semantic meaning).
- Prefill: honor `?candidates=a,b` query param from `/models` deep links.
- Validation: 1–8 candidates. Warn (non-blocking, amber inline note) if any candidate's context length < the bundle's largest task token requirement.

### 1.4 Step 3 — Judge pool

- Same `ModelPicker` palette, separate selection, `maxSelection: 12` (matches `PreflightRequestSchema`: judge pool min 3 / max 12, plan 03 §2).
- Rule surfaced above the list: "Each category gets one seeded 3-judge panel drawn from this pool; the same panel judges every candidate in that category."
- Validation: pool size ≥ 3. If pool < 4 and any overlap with candidates exists, escalate the warning (see below) since reserve swaps need spare judges: recommend pool ≥ candidates-overlap + 3.
- **Self-judging overlap warnings:** any model in both candidates and judge pool gets an amber `DisagreementFlag`-styled banner listing the overlapping models: "gpt-5 is both candidate and judge. If it lands on a panel, a seeded reserve judge will replace it for its own answers only — the substitution is recorded." Non-blocking (the engine handles the swap), but always visible again in Review.

### 1.5 Step 4 — Review & launch

On entering step 4, the client calls `POST /api/runs/preflight` with the draft config and renders the response:

```
┌ REVIEW ────────────────────────────────────────────────────────┐
│ mini-benchmark-v1 · 8 categories · 3 candidates · 5 judges    │
│ Trials per task: [1 ▾]   Candidate concurrency: [1 ▾]         │
│ ┌ StatCard ─┐ ┌ StatCard ─┐ ┌ StatCard ──┐ ┌ StatCard ──────┐ │
│ │ Requests  │ │ Est tokens│ │ Cost range │ │ Est duration   │ │
│ │ 96        │ │ ~410K     │ │ $0.84–1.32 │ │ ~18–24 min     │ │
│ └───────────┘ └───────────┘ └────────────┘ └────────────────┘ │
│ Hard spending cap  [$ 2.00 ]  "run stops at cap (incomplete)" │
│ ⚠ overlap warnings repeated here (if any)                     │
│ ⚠ unavailable/insufficient-context findings from preflight    │
│                                        [ Launch benchmark → ] │
└────────────────────────────────────────────────────────────────┘
```

- Request count = candidates × categories × trials × (1 candidate + 3 judges). Token estimate and cost range come from preflight (pricing cache × task token limits, low/high bounds). Duration estimate from configured concurrency and per-request latency heuristics — all computed server-side; the client only formats.
- Trials selector (1–5, default from settings, "recommended: 3" helper) and concurrency default from `GET /api/settings`.
- Hard cap: required, prefilled from settings default, must be ≥ preflight high estimate × 0.5 (else confirm dialog "cap is below the estimated cost — the run will likely stop early and be marked incomplete. Launch anyway?").
- Preflight errors are blocking: model no longer available, context too small for a task, judge pool below minimum after exclusions — each rendered as a fail-toned list item pointing at the step to fix (clicking jumps to that step).
- **Launch:** `POST /api/runs` with the immutable config; on `201 { run_id, status, events_url }`, clear the sessionStorage draft and `router.push(/runs/${run_id})`. Button shows loading state; double-submit guarded by disabling + the optional `idempotency_key` (plan 03 §3) generated when step 4 mounts.

### 1.6 States

- Preflight loading: StatCards render skeletons; Launch disabled.
- Preflight failure (network/500): fail banner with Retry.
- Empty models cache: step 2/3 pickers show plan-08 error state with link to `/settings`.

### 1.7 Responsive

- ≥1024px: step content `max-w-3xl` centered; StatCards 4-across. <768px: stepper collapses to "Step 2 of 4 — Candidates" text + rail; StatCards 2×2; footer buttons full-width sticky bottom.

---

## 2. `/runs/[id]` — Live Workbench

### 2.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ RUN #a3f2 · mini-benchmark-v1 · RUNNING          [Pause][Cancel]│
│ ████████████░░░░░░░░ 34/96 tasks · 12:41 elapsed               │
│ Spend $0.41 of ~$1.10 est ($2.00 cap)     reconnect: ● live    │
├────────────────────────────────────────────────────────────────┤
│           Roleplay  Coding  Math  Research  Mktg  Poster …     │
│ gpt-5        8.5      ▓▓▓    7.0     ⏳       —      —         │
│ claude-s45   9.0      6.5⚑   ▓▓▓     —        —      —         │
│ deepseek-v4  7.5      ⏳      —      —        —      —         │
│                                                                │
│   ▓▓▓ = streaming shimmer   ⚑ = judges disagreed   ⏳ pending  │
├────────────────────────────────────────────────────────────────┤
│ (clicking a cell opens the right-side Drawer — see §3)         │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Live header

Left → right:

- Run identity: short id (mono), bundle version, status Badge (`QUEUED` dim / `RUNNING` teal / `PAUSED` amber / `CANCELLED` dim / `COMPLETED` green / `INCOMPLETE` red; when the run went `incomplete` because of the budget gate — `BUDGET_CAP_REACHED` notice — show `INCOMPLETE — CAP REACHED`).
- Segmented `ProgressRail`: scored (teal) / errored (red) / flagged (amber) over total tasks, with "34/96 tasks" mono caption.
- Elapsed timer (client-ticked from `started_at`, freezes on terminal status).
- Spend: `StatCard`-style inline "actual $0.41 · est $1.10 · cap $2.00"; actual ≥ 80% of cap turns the value `warn-400`; cap tripped shows the `INCOMPLETE — CAP REACHED` badge (the engine stops before overspending and marks the run `incomplete`, per plan 05's budget gate).
- Connection state: `StatusDot` — `● live` (teal) / `● reconnecting…` (amber, pulsing) / `● disconnected — retrying in 4s` (red). Announced via `useAnnounce`.
- Controls: **Pause** (`POST /api/runs/[id]/pause`; in-flight requests finish, no new ones start), **Resume**, **Cancel** (danger Modal confirm: "Cancel run? Completed cells keep their scores; the run is marked cancelled and won't enter the leaderboard."). Buttons optimistically disable and settle on the next `run.status` event.
- Judge streams are **collapsed by default** everywhere (drawer included) to reduce noise — a single toggle "Show judge streams" in the header sets a persisted preference (`localStorage`).

### 2.3 Arena grid — the centerpiece

`components/arena/ArenaGrid.tsx` (client). A candidates × categories matrix:

- Structure: `role="grid"` with row headers = candidate model names (mono, truncated with tooltip), column headers = 8 category names. Cells fixed `~96×64px` desktop.
- **Cell state machine** (must match run-engine statuses):

| State | Visual |
|---|---|
| `pending` | `ink-900`, faint dashed border, dim `·` |
| `streaming` | teal 1px border + `teal-glow` ring (one-time 600ms per plan 07), animated shimmer bar bottom edge, token count ticking in mono (`~412 tok`) |
| `validating` | info-blue thin top border, "checks…" caption |
| `judging` | amber thin top border, 3 mini `StatusDot`s (one per panel judge) filling as each verdict lands |
| `scored` | median score fills the cell via `score-pop`: large mono numeral on score-ramp band bg (`ScoreBadge` lg); trial count `×3` sub-caption when trials > 1 |
| `error` | `fail-900` bg, `✕` + "retry" affordance (opens drawer, retry button there) |
| unfinished cell in a `cancelled`/`incomplete` **run** | dim, strikethrough `—` (derived presentation of a `pending` task in a terminal run — not a task status) |

- **Disagreement flag:** when a scored cell's spread (max − min judge overall) > 3, render `DisagreementFlag` compact in the top-right corner; cell border becomes `warn-400`. Tooltip/aria: "Judges disagreed — spread 4.5. Read this one yourself."
- With trials > 1 the cell shows the median across trials; drawer exposes per-trial detail.
- Keyboard: arrow keys move cell focus (roving tabindex), `Enter`/`Space` opens the drawer, `Home/End` row bounds. Each cell's `aria-label`: "gpt-5, Coding: scored 7.5 out of 10, judges disagreed".
- Row tail: per-candidate running macro-average (mono, dim) updates as categories complete.
- Responsive: <900px the grid scrolls horizontally with sticky candidate column; <640px switch to an accordion list (candidate → category rows) — same statuses, no grid semantics.

### 2.4 Cell drawer

Opens as plan-07 `Drawer` (`min(720px, 100vw)`), URL-addressable via `?cell=<candidateId>:<category>[:trial]` so refresh/back reopen it.

```
┌ gpt-5 × Coding · trial 1/1 ── [VerdictBadge PASS] [7.5] ── ✕ ┐
│ [Tabs: Answer | Checks | Judges]  ← on wide screens all three │
│                                     stack vertically instead  │
│ ── ANSWER ────────────────────────────────────────────────────│
│ StreamPanel (live tokens, blinking cursor, sticky-bottom)     │
│ meta row: 1,204 tok · $0.0112 · 8.4s · finish: stop           │
│ ── CHECKS (ValidatorPanel) ───────────────────────────────────│
│ ✓ JSON parses          ✓ required keys present                │
│ ✓ exact array counts   ✕ word count 66 > limit 65 (poster)    │
│   (each row: pass/fail icon, name, expected vs actual, mono)  │
│ ── JUDGES ────────────────────────────────────────────────────│
│ [JudgeVerdictCard ×3 side-by-side, or stacked <1024px]        │
│ disagreement banner when spread > 3                           │
│ [Retry task] (only when task status = error)                  │
└───────────────────────────────────────────────────────────────┘
```

**`JudgeVerdictCard`** (`components/arena/JudgeVerdictCard.tsx`) — structured, **never raw JSON**:

- Header: judge model name (mono, small) + `VerdictBadge` + server-computed overall as `ScoreBadge` md. If this judge was a reserve substitution, a dim caption "reserve judge (self-judging swap)". If the judgment needed a schema-repair retry: dim caption "repaired JSON (attempt 2)".
- Score bars: four horizontal bars (correctness, compliance, quality, honesty), 0–10, `ProgressRail`-style track with score-ramp band fill color, mono value right-aligned.
- Feedback: `FeedbackChipList`s — good (green), terrible (red), missing (amber), plus violation/critical lists when non-empty.
- "One best improvement": single-sentence callout with a subtle teal left border.
- Collapsed judge stream: a `StreamPanel defaultCollapsed` under each card while that judge streams (respects the global "Show judge streams" preference). Cards render skeleton bars until the judgment parses.
- Footer meta: claimed vs computed overall when they differ by > 1 ("judge claimed 9.0, computed 7.8"), tokens, cost, latency.

**`ValidatorPanel`** (`components/arena/ValidatorPanel.tsx`): checklist of deterministic checks, each `{ name, passed, expected, actual, details }` — pass rows `pass-400 ✓`, fail rows `fail-400 ✕` with expected/actual in mono (e.g. Math: `expected free=552 · got 540`). A summary chip "5/6 checks passed" also appears in the drawer header.

Trials > 1: a trial switcher (`Tabs` 1|2|3) above the Answer section; verdicts/checks scoped to the selected trial; header shows the cross-trial median.

### 2.5 States (page level)

- **Loading:** `loading.tsx` — header skeleton + grid of pending-style skeleton cells.
- **Not found:** `notFound()` → friendly 404 with link to `/leaderboard`.
- **Terminal statuses:** `completed` switches to replay + report tabs (§4/§5); `cancelled`/`incomplete` show replay for whatever finished plus a status banner.

---

## 3. SSE Client & State Management

### 3.1 Canonical-state-plus-deltas model

SQLite is the source of truth; SSE is a delta feed. The client always follows this sequence:

1. **Rehydrate:** on mount (and after every reconnect gap it can't bridge), `GET /api/runs/[id]` returns the full canonical snapshot: run row (status, config, spend, timestamps), all task cells with statuses/scores/spread, validator results, parsed judgments, and — for live cells — text accumulated so far plus `lastEventId`.
2. **Subscribe:** open `EventSource('/api/runs/[id]/events')`. On manual reconnects append `?lastEventId=` (see §3.3). Apply deltas on top of the snapshot.
3. Any delta referencing an unknown cell/trial (client fell behind, e.g. laptop slept) triggers a re-rehydrate: refetch the snapshot, keep the same EventSource.

### 3.2 Event vocabulary consumed

Every persisted SSE message has a monotonically increasing `id:` and a JSON `data:` payload; delta/heartbeat/resync frames carry no `id:`. The named events (`event:` field) the client handles are exactly the canonical catalog in `plans/00-overview.md` §4.5 (emitted per plan 05, framed per plan 03). The client derives its internal `cellKey = candidateModelId:category` from the payload fields:

| Event | Payload (canonical shape, abridged) | Client action |
|---|---|---|
| `run.status` | `{ runId, status, totalCostUsd, progress: { scored, error, total }, elapsedMs }` | header status badge + controls, timer freeze on terminal, segmented ProgressRail |
| `task.status` | `{ runId, taskResultId, taskId, category, candidateModelId, trialIndex, status, error? }` | cell state machine transition; on `status: "error"`, error cell state + drawer retry button (`error.kind`, `error.message`) |
| `candidate.delta` | `{ runId, taskResultId, delta, tokens? }` | append to StreamPanel buffer (§3.4); `tokens` = cumulative counter for cell tickers + duplicate-drop |
| `candidate.complete` | `{ runId, taskResultId, finishReason, tokens, costUsd, latencyMs }` | finalize answer meta, allow markdown render |
| `validation.complete` | `{ runId, taskResultId, checks, allPassed }` | fill ValidatorPanel |
| `judge.started` | `{ runId, taskResultId, judgeModelId, attempt }` | light up that judge's mini StatusDot / stream skeleton |
| `judge.delta` | `{ runId, taskResultId, judgeModelId, delta }` | append to that judge's collapsed stream |
| `judge.complete` | `{ runId, taskResultId, judgeModelId, attempt, parseStatus, substituted, substitutedFor, verdict, scores, claimedOverall, serverOverall, feedback, costUsd, latencyMs }` | fill one JudgeVerdictCard (reserve/repaired captions from `substituted` / `parseStatus: "repaired"`) |
| `task.scored` | `{ runId, taskResultId, taskId, category, candidateModelId, trialIndex, median, disagreement, flagged, judgeOveralls }` | score-pop fill, disagreement flag, row macro-average |
| `run.cost` | `{ runId, totalCostUsd, budgetUsd }` | spend readout, warn tint ≥80% of cap |
| `notice` | `{ runId, scope, code, message, taskResultId?, details? }` | toasts/banners (`BUDGET_CAP_REACHED`, `RETRY_SCHEDULED`, `JUDGE_REPLACED`, `RUN_PAUSED`, `RUN_RESUMED`) |
| `run.complete` | `{ runId, status, bundleRunScore, totalCostUsd }` | flip to replay/report mode, close EventSource |
| `resync` | `{ runId, lastEventId }` | refetch the snapshot (§3.1), keep the EventSource |
| `heartbeat` | `{ runId, ts }` (every 15s) | liveness watchdog (§3.3) |

The client must ignore unknown event names (forward compatibility) and tolerate duplicate deliveries: all handlers are idempotent — `task.status`/`task.scored`/`judge.complete` are last-write-wins keyed by `(taskResultId, judgeModelId?)`; delta appends are guarded by the cumulative `tokens` counter when present (drop deltas whose counter ≤ current).

### 3.3 Reconnection protocol

Implemented in `lib/client/useRunStream.ts`:

- Native `EventSource` auto-reconnect sends `Last-Event-ID` automatically — rely on it for transient drops. The server replays persisted events after that id from the durable `run_events` log or, in the defensive case where the cursor cannot be served, sends a single `resync` event → client re-rehydrates (step 1) instead of receiving replay.
- **Watchdog:** if no message (including `heartbeat`) for 45s, assume a half-open connection: close the EventSource explicitly and reopen with `?lastEventId=<last seen>` (query param, because manually constructed EventSources can't set headers). Backoff: 1s, 2s, 4s, 8s, capped 15s, with jitter; surface countdown in the connection StatusDot.
- On `visibilitychange` → visible after >30s hidden: proactively rehydrate + reopen.
- Terminal `run.status`/`run.complete` (`completed|cancelled|incomplete`): close the EventSource deliberately (no reconnect loop) and flip to replay/report mode.
- Every reconnect announces via `useAnnounce` ("Connection lost — retrying", "Reconnected").

### 3.4 Streaming text performance

- Token deltas are **not** stored in React state per-token. `useRunStream` keeps buffers in a `Map<streamKey, { text, tokens, status }>` inside a ref, and notifies subscribers via `useSyncExternalStore`; only the mounted `StreamPanel` for the **open drawer** subscribes to its own key. Closed cells only receive coarse events (`task.status`, `task.scored`), so grid re-renders are cheap.
- Flush cadence: buffered deltas commit to the subscribed panel at most every 80ms (rAF-aligned), appending in batches.
- Grid cell token counters update from `candidate.delta.tokens` throttled to 500ms.
- Store shape (single `RunStore` per page):

```ts
type RunStore = {
  run: { id; status; startedAt; finishedAt?; spend: {actual; estimated; cap}; progress: {completed; total; errored; flagged} };
  cells: Map<CellKey, {
    trials: Map<number, {
      status: TaskStatus;
      answer: { text; tokens; finishReason?; costUsd?; latencyMs? };
      checks?: ValidatorCheck[];
      judges: Map<JudgeId, { stream: {text}; verdict?: ParsedJudgment }>;
      median?: number; spread?: number;
    }>;
    medianAcrossTrials?: number;
  }>;
  connection: "live" | "reconnecting" | "disconnected" | "closed";
  lastEventId: number | null;
};
```

### 3.5 Optimistic behavior

- Token appending is inherently optimistic (render immediately; canonical text replaces the buffer on any rehydrate).
- Pause/Resume/Cancel: optimistically set header state with a "pending" affordance (button spinner); reconcile on the next `run.status` event; on request failure, revert and toast the error.
- Retry task (`POST /api/runs/[id]/tasks/[taskId]/retry`): optimistically flip the cell to `pending`; server events drive it from there.

---

## 4. Replay Mode (completed / terminal runs)

Same layout, zero live machinery:

- Detection: snapshot `status ∈ {completed, cancelled, incomplete}` → never open an EventSource.
- Header: final stats (total cost actual vs estimate, duration, completed/errored counts), status Badge, no controls; a `Tabs` bar appears: **Arena** (this plan) | **Report** (plan 10, same route).
- Grid: all cells in terminal visual states; disagreement flags persist; everything clickable.
- Drawer: `StreamPanel` renders the **archived full final text** (from `task_results.raw_output`, sanitized-markdown rendered, no cursor); judge cards fully populated from `judgment_attempts`; validator checklist from `validator_results`; per-trial switcher intact.
- Cancelled/incomplete: unfinished cells render the dim strikethrough presentation (§2.3); banner explains eligibility ("This run is not leaderboard-eligible: cancelled before completion" / "…incomplete — infrastructure failures or budget cap").
- Replay is fully server-snapshot-driven (one `GET /api/runs/[id]`), so deep links like `/runs/abc?cell=gpt-5:coding` work forever.

---

## 5. Files to implement

```
app/run/page.tsx                        # wizard shell (client), step routing via ?step=
app/runs/[id]/page.tsx                  # server: fetch snapshot, render Workbench (live or replay)
app/runs/[id]/loading.tsx
components/run/WizardStepper.tsx
components/run/StepBundle.tsx
components/run/StepCandidates.tsx
components/run/StepJudgePool.tsx
components/run/StepReview.tsx           # preflight display, cap input, launch
components/run/OverlapWarning.tsx       # self-judging banner (steps 3 & 4)
components/arena/Workbench.tsx          # client root: RunStore provider, header+grid+drawer composition
components/arena/RunHeader.tsx          # status, rail, timer, spend, connection dot, controls
components/arena/ArenaGrid.tsx
components/arena/ArenaCell.tsx
components/arena/CellDrawer.tsx
components/arena/JudgeVerdictCard.tsx
components/arena/ValidatorPanel.tsx
components/arena/TrialTabs.tsx
lib/client/useRunStream.ts              # EventSource lifecycle, watchdog, backoff, RunStore, useSyncExternalStore adapters
lib/client/runStore.ts                  # store types, reducers/appliers for each event, idempotency guards
lib/client/runDraft.ts                  # sessionStorage draft persistence for the wizard
```

(`ArenaGrid.tsx`, `StreamPanel.tsx` usage, `JudgeVerdictCard.tsx`, `ValidatorPanel.tsx` correspond to the master plan's component list; StreamPanel itself is plan 07's primitive.)

## 6. Contracts with other modules

**API endpoints consumed** (shapes owned by plan 03; names below are plan 03's exact contracts):

- `GET /api/models` (via plan-08 `ModelPicker` data), `GET /api/settings` (wizard defaults).
- `POST /api/runs/preflight` — request `PreflightRequestSchema`: `{ bundle_id, candidate_model_ids, judge_pool_model_ids, categories, trials_per_pair, candidate_concurrency, budget_usd, seed? }`; response `PreflightResponseSchema`: `{ ok, seed, errors: [{code, message, details}], warnings: [...same shape], estimate: { request_count, candidate_requests, judge_requests, prompt_tokens_est, completion_tokens_est, cost_usd_min, cost_usd_expected, cost_usd_max, duration_est_seconds } }`.
- `POST /api/runs` — `CreateRunRequestSchema` (preflight shape + required `seed` + optional `idempotency_key`, generated when step 4 mounts) → `201 { run_id, status, events_url }`.
- `GET /api/runs/[id]` — canonical snapshot as described in §3.1, including `last_event_id`.
- `GET /api/runs/[id]/events` — SSE; supports `Last-Event-ID` header and `?lastEventId=` param; emits `resync` when replay is impossible.
- `POST /api/runs/[id]/pause` · `/resume` · `/cancel` — `200 { run_id, status }`.
- `POST /api/runs/[id]/tasks/[taskId]/retry` — `202 { run_id, task_result_id, status }` (`taskId` = the `task_results.id`).

**SSE events consumed:** the full table in §3.2, which mirrors the canonical catalog in `plans/00-overview.md` §4.5 — the backend must emit exactly that vocabulary, including monotonic ids, 15s `heartbeat` events, durable `run_events` replay, and the `resync` fallback.

**Provided to plan 10:** the replay `Tabs` slot on `/runs/[id]` where the Report view mounts; `RunStore` snapshot types. **Depends on plan 07** (all primitives, motions, announcer) and **plan 08** (`ModelPicker`).

## 7. Acceptance criteria

- [ ] Wizard enforces step order with validation per step; drafts survive refresh via sessionStorage; `?step=` and `?candidates=` deep links work.
- [ ] Self-judging overlap produces the specified warning in step 3 and again in Review; it never blocks launch.
- [ ] Review shows preflight request count, token estimate, cost range, duration estimate, and requires a hard cap; a cap below half the high estimate triggers the confirm dialog; preflight errors block launch and deep-link to the offending step.
- [ ] Launch is double-submit-safe (idempotency key) and lands on `/runs/[id]` with the draft cleared.
- [ ] Arena grid renders candidates × categories; every cell walks pending → streaming → validating → judging → scored with the plan-07 motions; median fills the cell with `score-pop`; error/cancelled states render as specified.
- [ ] Cells with judge spread > 3 show the compact disagreement flag with the "read this one yourself" message in tooltip/aria and drawer banner.
- [ ] Cell drawer is URL-addressable (`?cell=`), shows live candidate StreamPanel with blinking cursor and stick-to-bottom, the validator checklist with expected-vs-actual detail, and three structured JudgeVerdictCards (verdict badge, four score bars, good/terrible/missing chips, best-improvement) — raw judge JSON is never rendered.
- [ ] Judge streams are collapsed by default with a persisted global toggle; reserve-judge substitutions and repaired-JSON attempts are captioned on the cards.
- [ ] Live header shows segmented progress, ticking elapsed, actual vs estimated vs cap spend (warn at 80%), and working pause/resume/cancel with optimistic UI reconciled by `run.status` events; cancel requires modal confirm.
- [ ] SSE client: initial paint always rehydrates from `GET /api/runs/[id]`; automatic `Last-Event-ID` replay works; the 45s watchdog force-reopens with `?lastEventId=`; backoff is capped and jittered with visible connection state; a `resync` event or unknown-cell delta triggers snapshot refetch; refresh mid-run loses no state.
- [ ] Token rendering stays smooth: only the open drawer subscribes to token buffers, flushes ≤ every 80ms, and grid renders are unaffected by token volume (verify with a 10k-token answer).
- [ ] Pause takes effect without killing in-flight requests (UI reflects `pausing` then `paused`); cap breach stops the run and shows `INCOMPLETE — CAP REACHED`.
- [ ] Completed/cancelled/incomplete runs open in replay mode: no EventSource, archived full text in the same drawer layout, Arena|Report tabs present, deep links stable.
- [ ] Grid keyboard navigation (arrows/Enter/Home/End), cell aria-labels with status+score, drawer focus trap, and status announcements all work; reduced motion disables shimmer/pop/blink.
