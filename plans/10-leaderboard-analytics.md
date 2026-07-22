# 10 — Leaderboard & Analytics: Rankings, Compare, Judges, Run Report

## Purpose and Scope

This document specifies the results-facing surfaces of AI Judge: `/leaderboard` (bundle-scoped rankings), `/compare` (up to four models side-by-side), `/judges` (judge calibration and reliability analytics), and the **Report** tab of `/runs/[id]` for completed runs (final scores, cost breakdown, exports). It also specifies the dependency-light SVG chart primitives (radar, sparkline, distribution strip) with exact props and data shapes.

**In scope:** the three pages, the report tab content, chart components, and export UX.

**Out of scope:** the arena/replay half of `/runs/[id]` (plan 09), UI primitives and tokens (plan 07), scoring math and SQL (backend `lib/scoring.ts` — this plan consumes its outputs via API routes and server helpers).

Shared eligibility language used throughout (from the master plan): only **complete** bundle runs enter rankings; the leaderboard score is the **median of complete bundle-run scores**; a model is **provisional** until it has 3 complete runs; infrastructure failures are `incomplete`, never zero.

---

## 1. Chart Primitives (dependency-light SVG)

All charts are hand-rolled SVG React components in `components/charts/` — **no chart library**. They are pure functions of props (no internal fetching), sized via `viewBox` + CSS width, use only plan-07 tokens, and every chart has a text/table alternative for accessibility (§ per-page specs). Server-component-safe unless noted.

### 1.1 `CategoryRadar`

8-axis radar (one axis per bundle category).

```tsx
type RadarSeries = {
  label: string;                       // model name
  color: "teal" | "warn" | "info" | "pass";  // token name, resolved internally
  values: { category: string; score: number | null }[]; // 0–10; null = not run (axis point drawn at 0 with hollow marker)
};
type CategoryRadarProps = {
  categories: string[];                // axis order, length 8, from the bundle
  series: RadarSeries[];               // 1 (leaderboard row) to 4 (compare)
  size?: number;                       // px, default 260
  showLegend?: boolean;                // default true when series.length > 1
};
```

- Render: `viewBox="0 0 100 100"`, center 50/50, radius 38. Grid rings at 2.5/5/7.5/10 (`line-subtle`, 0.5px), axis spokes + end labels (`text-dim`, 7px, mono for nothing — labels are sans). Polygon per series: `fill` at 12% opacity, `stroke` 1.5px full opacity, vertex dots r=1.5. Multiple series stack with the first series on top.
- Scores map linearly 0→center, 10→ring edge. `null` renders a hollow vertex at center and a dashed polygon segment through it.
- A11y: `role="img"` + `aria-label` summarizing ("Radar: gpt-5 — Coding 7.5, Math 9.0, …"); consumers must also render the adjacent table alternative (see usage sites).

### 1.2 `Sparkline`

Tiny inline trend/spread line used for disagreement history and score-over-runs.

```tsx
type SparklineProps = {
  points: number[];                    // ordered values
  min?: number; max?: number;          // domain, default data min/max padded 10%
  width?: number; height?: number;     // default 84 × 24
  tone?: "teal" | "warn" | "dim";
  band?: { lo: number; hi: number };   // optional shaded band (e.g. min–max judge spread)
  ariaLabel: string;                   // required
};
```

- Polyline 1.5px, optional band as a low-opacity path behind it, last point emphasized with a 2px dot. No axes, no ticks. Empty/1-point input renders a flat dim dash.

### 1.3 `ScoreDistributionStrip`

Compact strip showing per-judge or per-trial score positions on a 0–10 rail (used in compare and judges pages).

```tsx
type ScoreDistributionStripProps = {
  marks: { value: number; label: string; tone?: "teal" | "warn" | "fail" | "pass" }[];
  median?: number;                     // drawn as a taller tick
  width?: number;                      // default 160, height fixed 20
  ariaLabel: string;
};
```

- Horizontal rail (`ink-700`), tick per mark (2×10px), median tick 2×16px in `text-bright`. Tooltip on hover/focus shows `label: value`.

### 1.4 `MiniBar`

Simple horizontal bar for cost/latency comparisons: `{ value, max, tone, label, format }` → track + fill + right-aligned mono value. Used in compare economics and report cost breakdown.

---

## 2. `/leaderboard`

### 2.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ LEADERBOARD                                                    │
│ Bundle [mini-benchmark-v1 ▾]  Category [Overall ▾]             │
│ 6 ranked · 2 provisional · updated 3 min ago  [Export CSV|JSON]│
├────────────────────────────────────────────────────────────────┤
│ #  MODEL          MEDIAN  DISAGREE  RUNS  SUCCESS  COST   LAT  LAST │
│ 1  claude-s45      9.0    ~~▁▂▁~~     4    98%   $0.31  6.2s  2h   │
│ 2  gpt-5           8.5    ~~▂▅▂~~     3    96%   $0.42  4.8s  2h   │
│ 3  deepseek-v4     7.5    ~~▁▁▂~~     3    91%   $0.02  9.1s  1d   │
│ ─  gemini-3-pro    8.8ᴾ   ~~▂▂~~      1   100%   $0.28  5.0s  3h   │
│    ᴾ provisional — fewer than 3 complete runs                  │
│ ▸ expanding a row:                                             │
│   ┌ [CategoryRadar]  │ per-category table: category, median,  │
│   │                  │ spread, validator pass %, best/worst   │
│   │                  │ links → /compare, → latest /runs/[id]  │
└────────────────────────────────────────────────────────────────┘
```

### 2.2 Spec

- **Selectors:** Bundle `Select` (published bundles; rankings are always scoped to exactly one bundle version — switching bundles is switching leaderboards). Category `Select`: `Overall` (default, macro-average ranking) or one of the 8 categories (re-ranks by that category's median). Both selectors write to searchParams (`?bundle=&category=`) — server-rendered, linkable.
- **Columns** (`DataTable`, sortable where noted):
  1. **Rank** — position under current sort; provisional models sort below ranked models and show `—` for rank plus a `Badge` `PROVISIONAL` (warn tone) with tooltip "fewer than 3 complete runs — median of N runs shown".
  2. **Model** — name + dim provider; links to expanded row.
  3. **Median score** — `ScoreBadge` md; the leaderboard score (median of complete bundle-run scores, or category median when a category is selected). Sortable (default desc).
  4. **Disagreement** — `Sparkline` of mean judge spread per completed run (ordered by run date), `tone="warn"` when latest > 3; aria-label includes latest value. Text alt: latest spread value shown in mono beside the spark.
  5. **Complete runs** — mono count. Sortable.
  6. **Success rate** — % of attempted tasks reaching `scored` across that model's runs (infrastructure failures lower this, not the score). Sortable.
  7. **Cost** — average cost per complete bundle run (`avg_cost_usd_per_run`, plan 03 §8), mono USD. Sortable.
  8. **Latency** — average per-task candidate latency (`avg_latency_ms`). Sortable.
  9. **Last evaluated** — relative time of the newest complete run.
- **Expandable rows:** `DataTable` expandable slot renders a two-column detail: left `CategoryRadar` (single series, teal) with its table alternative directly beside it (right column): per-category median, spread, validator pass rate, and best/worst category highlights. Footer links: "Compare this model →" (prefills `/compare?models=<id>`), "Latest run →" (`/runs/[id]`).
- **Rank motion:** on first paint and on selector change, rows animate with plan-07 `rank-enter` (staggered, reduced-motion-safe).
- **Export:** two buttons calling `GET /api/leaderboard?bundle=…&category=…&format=csv|json` — downloads the **current filtered view** (same columns plus per-category medians in JSON). Buttons are plain `<a download>` links so exports work without JS.

### 2.3 Data fetching & states

- `app/leaderboard/page.tsx` is a **server component**: reads searchParams, queries via `lib/scoring.ts` helpers directly (the HTTP `GET /api/leaderboard` exists for export and external use; the page itself avoids the extra hop). Client wrapper only for row expansion state and rank animations.
- **Loading:** `loading.tsx` — selectors + 8 skeleton rows. **Empty:** `EmptyState` "No complete runs for this bundle yet" + "Start a benchmark" CTA. **Partial-data:** provisional-only lists show a persistent explainer banner. **Error:** `error.tsx` boundary with retry.

### 2.4 Responsive

≥1024px full table; 768–1023px hides Latency and Last evaluated (available in expansion); <768px card list per model: rank + name + ScoreBadge + runs + provisional badge, tap → expansion content as a full-width sheet.

---

## 3. `/compare`

### 3.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ COMPARE   [ + Add model (⌘K) ]  bundle [mini-benchmark-v1 ▾]   │
│ [gpt-5 ×] [claude-s45 ×] [deepseek-v4 ×]        (max 4 chips)  │
├────────────────────────────────────────────────────────────────┤
│ OVERVIEW: shared CategoryRadar (all series) + StatCard row per │
│ model: median, runs, success %, cost/run, score-per-dollar     │
├────────────────────────────────────────────────────────────────┤
│ SCORE MATRIX: rows = 8 categories, one column per model,       │
│ each cell ScoreBadge + spread; best-in-row cell gets a teal    │
│ ring; ScoreDistributionStrip under each cell (3 judge marks)   │
├────────────────────────────────────────────────────────────────┤
│ SAME-TASK ANSWERS: category Select → side-by-side columns:     │
│ archived answer (collapsed StreamPanel, expandable), validator │
│ summary chip, and judge evidence (good/terrible/missing chips  │
│ + one-best-improvement) per model, all from the same bundle    │
│ version and latest complete run                                │
├────────────────────────────────────────────────────────────────┤
│ RELIABILITY & ECONOMICS: table — runs, success rate, incomplete│
│ count, median/IQR across runs, mean judge spread; MiniBars for │
│ cost per run, latency, and score-per-dollar                    │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Spec

- **Selection:** `?models=a,b,c&bundle=…` drives everything (linkable). "Add model" opens the plan-08 `ModelPicker` palette filtered to models that have ≥1 complete run in the selected bundle; max 4; removing a chip updates the URL via `router.replace`.
- **Score-per-dollar:** `median overall ÷ median cost per complete run` — displayed with 1 decimal per dollar (e.g. `21.4 pts/$`) and a `MiniBar` normalized to the best model in view.
- **Same-task answers:** pulls each model's most recent complete run in the bundle; answers render through the sanitized markdown pipeline collapsed to 12 lines with "Expand"; judge evidence rendered as `FeedbackChipList`s (never raw JSON); a caption notes run id + date per column, since answers may come from different runs (same bundle version guarantees identical prompts).
- **Judge evidence quality note:** if any model's shown answer had spread > 3, surface the plan-07 `DisagreementFlag` full variant above its column.
- Radar with up to 4 series uses tone order `teal, warn, info, pass`; legend chips double as series toggles (click to dim a series). Table alternative: the score matrix section itself is the accessible equivalent — reference it via `aria-describedby`.

### 3.3 Data fetching & states

- Server component reads searchParams → `lib/scoring.ts` compare helpers (per-model aggregates + same-task artifacts). The Add-model palette needs the model list client-side (`GET /api/models` filtered by a lightweight `GET /api/leaderboard?bundle=&format=json` id set, fetched once).
- **Empty (no models selected):** `EmptyState` explaining "Pick up to 4 models with at least one complete run" + Add button. **1 model:** allowed — renders single-column (still useful as a model detail view). **Model without runs in bundle:** chip renders with a warn note and its columns show em-dashes.
- **Loading:** skeleton radar + matrix.

### 3.4 Responsive

≥1024px up to 4 columns; 768–1023px 2 columns with horizontal scroll for the matrix; <768px model sections stack vertically with a sticky model-chip switcher for the same-task section.

---

## 4. `/judges`

### 4.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ JUDGES   bundle [mini-benchmark-v1 ▾]                          │
│ "How reliable are the judges themselves?" + method note        │
├────────────────────────────────────────────────────────────────┤
│ JUDGE TABLE (one row per judge model that has judged ≥1 run):  │
│ MODEL · JUDGMENTS · HARSHNESS · VARIANCE · PARSE FAILS ·       │
│ EVIDENCE QUALITY · CONSISTENCY · CALIBRATION                   │
│  harshness: signed offset vs panel median, e.g. −0.8 (lenient  │
│  +) rendered mono with ± and a centered MiniBar diverging from │
│  0; variance: σ of its overalls; parse fails: % needing repair │
│  or replacement (first-try/repaired/invalid breakdown on hover)│
│  evidence quality & consistency: 0–10 ScoreBadges (meta-rating)│
│ ▸ row expansion: ScoreDistributionStrip of its last 20 overalls│
│   vs panel medians, plus recent flagged judgments list         │
├────────────────────────────────────────────────────────────────┤
│ CALIBRATION RESULTS TABLE: fixture set × judge — fixture name, │
│ expected verdict, judge verdict, correctness ✓/✕, evidence     │
│ quality 0–10, parse status; footer: per-judge calibration mean │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Spec

- **Harshness/leniency offset:** mean of (judge's server-computed overall − panel median overall) across all its judgments in the bundle. Negative = harsh, positive = lenient. Display signed 1-decimal mono + diverging `MiniBar` (center 0, harsh fills left in `warn`, lenient right in `info`); |offset| > 1.5 gets a warn Badge "outlier".
- **Variance:** standard deviation of its overalls (context chip shows panel-wide σ for comparison).
- **Parse failure rate:** % of judgments not valid on first attempt; hover/expansion breaks down first-try valid / repaired (attempt 2) / invalid-replaced. Replaced judgments also list which reserve stepped in.
- **Evidence quality / consistency:** the stored judge-calibration meta-ratings (0–10) — evidence tied to the candidate + validator findings, and claimed-vs-computed overall consistency. Rendered as `ScoreBadge` sm.
- **Calibration results table:** straight rendering of `judge_calibration_results` — fixture id/name, expected vs actual verdict (`VerdictBadge` pair), correctness icon, evidence quality score, parse status. Groupable by judge (default) via `Tabs`.
- Method note under the title (dim, one paragraph): agreement is a diagnostic, not a target — a well-supported minority judgment is not penalized; scores here affect judge meta-rating only, never candidate rankings.

### 4.3 Data fetching & states

- Server component; direct `lib/scoring.ts` judge-analytics helpers scoped by `?bundle=`.
- **Empty:** no judgments yet → `EmptyState` "Judge analytics appear after the first run". Calibration table empty → inline note "No calibration fixtures run yet" (fixtures are optional in v1).
- **Loading:** `loading.tsx` skeleton table.

### 4.4 Responsive

<768px: judge table becomes stacked cards (model, judgments, harshness bar, parse-fail %, meta ScoreBadges); calibration table horizontally scrolls.

---

## 5. `/runs/[id]` — Report View (completed runs)

Mounted as the **Report** tab beside plan 09's Arena tab (plan 09 owns the tab shell). Server-rendered from the same run snapshot.

### 5.1 Layout

```
┌ REPORT ────────────────────────────────────────────────────────┐
│ StatCard row: Total score (macro-avg) · Total cost · Duration ·│
│ Tasks scored/errored · Leaderboard-eligible? (✓/✕ + reason)    │
├────────────────────────────────────────────────────────────────┤
│ FINAL SCORES — candidates × categories score matrix (static):  │
│ rows = candidates, cols = categories + TOTAL; each cell        │
│ ScoreBadge + tiny spread value; disagreement flags preserved;  │
│ cell click deep-links to Arena tab drawer (?tab=arena&cell=…)  │
│ Per-candidate CategoryRadar row beneath (one small radar each) │
├────────────────────────────────────────────────────────────────┤
│ COST BREAKDOWN — table: model (candidates AND judges), role,   │
│ requests, tokens in/out, cost, MiniBar share-of-total; footer  │
│ total vs preflight estimate vs cap; per-category subtotal Tabs │
├────────────────────────────────────────────────────────────────┤
│ RUN METADATA — seed, bundle hash, panels per category (judge   │
│ ids + reserve order + any recorded substitutions), parameters, │
│ provider routes; all mono, copyable                            │
├────────────────────────────────────────────────────────────────┤
│ [Export JSON] [Export CSV]                                     │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Spec

- **Eligibility card:** complete → `✓ Counted in leaderboard`; cancelled/incomplete/partial-categories → `✕ Not eligible` with the reason string from scoring rules.
- **Score matrix:** median across trials per cell, TOTAL column = equal-weight macro-average of category medians (the bundle-run score). Cells reuse `ScoreBadge` + `DisagreementFlag` compact; not a `role="grid"` (static table semantics).
- **Cost breakdown:** every model that billed in the run — candidates and each judge — with role Badge (`CANDIDATE`/`JUDGE`), request count, prompt/completion tokens, USD cost, and `MiniBar` of share-of-total. Footer compares actual total vs preflight estimate range vs cap.
- **Exports:** `GET /api/runs/[id]/export?format=json|csv` as `<a download>` links. JSON = full reproducibility bundle (config, seed, hashes, panels, per-task scores, judgments metadata). CSV = flat task-scores table (run_id, candidate, category, trial, median, spread, verdicts, validator pass count, cost, latency). Exact columns owned by the backend export route; this page only links.

### 5.3 States

Report tab renders only for terminal runs (plan 09 controls tab visibility). Cancelled/incomplete runs render the same report over whatever completed, with the ineligibility banner. No client fetching; everything from the server snapshot.

---

## 6. Files to implement

```
app/leaderboard/page.tsx
app/leaderboard/loading.tsx
app/leaderboard/error.tsx
app/compare/page.tsx
app/compare/loading.tsx
app/judges/page.tsx
app/judges/loading.tsx
components/charts/CategoryRadar.tsx
components/charts/Sparkline.tsx
components/charts/ScoreDistributionStrip.tsx
components/charts/MiniBar.tsx
components/leaderboard/LeaderboardTable.tsx     # DataTable composition + expansion + rank-enter
components/leaderboard/LeaderboardControls.tsx  # bundle/category selects + export links
components/leaderboard/RowExpansion.tsx         # radar + per-category table + links
components/compare/CompareChips.tsx             # model chips + add palette wiring
components/compare/CompareOverview.tsx          # shared radar + stat rows
components/compare/ScoreMatrix.tsx
components/compare/SameTaskAnswers.tsx
components/compare/ReliabilityEconomics.tsx
components/judges/JudgeTable.tsx
components/judges/JudgeRowExpansion.tsx
components/judges/CalibrationTable.tsx
components/report/RunReport.tsx                 # report tab root (imported by plan 09's tab shell)
components/report/FinalScoreMatrix.tsx
components/report/CostBreakdown.tsx
components/report/RunMetadata.tsx
```

(`LeaderboardTable.tsx` and `CategoryRadar.tsx` correspond to the master plan's component list.)

## 7. Contracts with other modules

**API endpoints consumed:**

- `GET /api/leaderboard?bundle=&category=&format=json|csv` — ranked rows for export/external use; page rendering uses the same underlying `lib/scoring.ts` helpers server-side. Row shape per `LeaderboardResponseSchema` (plan 03 §8): `{ rank, model_id, score, provisional, complete_runs, disagreement_mean, success_rate, avg_cost_usd_per_run, avg_latency_ms, last_evaluated_at, spread_history: number[], category_medians, category_detail: { [category]: { median, spread, validator_pass_rate } } }`.
- `GET /api/runs/[id]` — terminal-run snapshot (shared with plan 09) — must include per-cell medians/spreads/trials, per-model token+cost rollups, seed, bundle hash, panels with reserve order and substitutions, and preflight estimate for the cost-vs-estimate comparison.
- `GET /api/runs/[id]/export?format=json|csv` — download links only.
- `GET /api/models` — compare's Add-model palette (via plan-08 `ModelPicker`).

**Server helpers consumed (backend contract, `lib/scoring.ts`):** `getLeaderboard(bundle, category?)`, `getModelComparison(bundle, modelIds[])` (aggregates + latest-complete-run same-task artifacts), `getJudgeAnalytics(bundle)` (offsets, variance, parse-fail breakdown, meta-ratings), `getCalibrationResults()`.

**SSE events consumed:** none — every surface in this plan is terminal-data only.

**Provided to plan 09:** `components/report/RunReport.tsx` mounted in its Arena|Report tab shell. **Depends on plan 07** for all primitives/tokens and **plan 08** for `ModelPicker`.

## 8. Acceptance criteria

- [ ] Leaderboard scopes strictly to one bundle version; bundle and category selectors are URL-driven and linkable; category selection re-ranks by category median.
- [ ] All nine specified columns render with correct formats (mono numerics, ScoreBadge medians, disagreement sparkline with text value, relative last-evaluated); sortable columns sort server-consistently.
- [ ] Models with < 3 complete runs show the PROVISIONAL badge, rank `—`, sort below ranked models, and explain themselves via tooltip.
- [ ] Expanding a leaderboard row shows the 8-category radar **and** its adjacent per-category table (accessible alternative), plus working links to compare and the latest run.
- [ ] CSV and JSON export download the current filtered leaderboard view without JS (plain anchor downloads) and match the on-screen data.
- [ ] Compare supports 1–4 models via `?models=`, shows the multi-series radar with legend toggles, score matrix with best-in-row highlight and per-cell judge distribution strips, same-task archived answers with sanitized markdown and structured judge evidence chips, and reliability/economics including score-per-dollar MiniBars.
- [ ] Compare handles a model with zero complete runs in the bundle gracefully (warn chip + em-dash columns, no crash).
- [ ] Judges page computes and renders harshness offset (signed, diverging bar, outlier badge at |offset| > 1.5), variance vs panel σ, parse-failure breakdown (first-try/repaired/replaced), evidence-quality and consistency meta-ratings, and the fixture calibration table with expected-vs-actual verdicts.
- [ ] Judges page carries the method note that agreement is diagnostic-only and judge metrics never alter candidate rankings.
- [ ] Run report shows the final score matrix with TOTAL macro-average, preserved disagreement flags, and cell deep links into the Arena drawer; radars per candidate render with table equivalents.
- [ ] Cost breakdown lists every billed model with role, requests, tokens, cost, and share-of-total bars; footer reconciles actual vs preflight estimate vs cap; eligibility card states counted/not-counted with reason.
- [ ] All four chart components are dependency-free SVG matching the exact props in §1, render server-side where used in server components, respect reduced motion (no chart animations exist), and carry `role="img"` labels.
- [ ] Every page has loading skeletons, the specified empty states, and error boundaries; all tables pass keyboard and `aria-sort`/`aria-expanded` checks; <768px layouts match the responsive specs.
