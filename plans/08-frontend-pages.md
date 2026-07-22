# 08 — Frontend Pages: Landing, Models, Bundles, Settings

## Purpose and Scope

This document specifies four pages of the AI Judge app: `/` (landing), `/models` (OpenRouter catalog), `/bundles` (immutable bundle versions), and `/settings` (operator defaults). For each page it defines the layout wireframe, component tree, data fetching strategy (server vs client components), loading/empty/error states, and responsive behavior.

**In scope:** the four pages above plus their page-specific components (notably the reusable `ModelPicker` command palette, which the run wizard in plan 09 also imports).

**Out of scope:** `/run` and `/runs/[id]` (plan 09), `/leaderboard`, `/compare`, `/judges`, and the run report (plan 10). All visual tokens and UI primitives come from plan 07 — this document never restates hex values or component internals.

Global shell: every page renders inside `AppShell` (plan 07) — top nav with the AI JUDGE wordmark (display font), links `Models · Bundles · Run · Leaderboard · Compare · Judges · Settings`, and a pulsing teal `StatusDot` + "Run in progress" link when any run is active (fetched client-side from `GET /api/runs?status=running`, polled every 30s; cheap and avoids a global SSE connection).

---

## 1. `/` — Landing

### 1.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ AppShell nav                                                   │
├────────────────────────────────────────────────────────────────┤
│  HERO (full-width, grid texture slightly stronger here)        │
│                                                                │
│   AI JUDGE                       ┌──────────────────────────┐  │
│   One bundle. Three independent  │  VerdictPlane (SVG)      │  │
│   judges. Reproducible rankings. │  restrained signal art:  │  │
│                                  │  3 judge nodes emitting  │  │
│   [ Start a benchmark ]          │  score pulses into a     │  │
│   [ View leaderboard ]           │  median bar              │  │
│                                  └──────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│  METHODOLOGY — 4 step cards in a row                           │
│  [1 Bundle]  [2 Stream]  [3 Judge ×3]  [4 Rank]                │
├────────────────────────────────────────────────────────────────┤
│  LIVE RANKING PREVIEW                                          │
│  "Current standings — mini-benchmark-v1"     [Full leaderboard →]
│  ┌ rank ┬ model ┬ median ┬ runs ┬ trend ┐   (top 5 rows)      │
├────────────────────────────────────────────────────────────────┤
│  HONESTY STRIP — 3 small cards: Blind judging · Seeded panels  │
│  · Deterministic validators (one sentence each)                │
├────────────────────────────────────────────────────────────────┤
│  Footer: bundle version, GitHub-style meta, no marketing fluff │
└────────────────────────────────────────────────────────────────┘
```

### 1.2 Component tree

```
app/page.tsx                          (server component)
├─ Hero                               (server)
│  ├─ h1.font-display "AI JUDGE"
│  ├─ tagline "One bundle. Three independent judges. Reproducible rankings."
│  ├─ Button primary → /run           ("Start a benchmark")
│  ├─ Button secondary → /leaderboard ("View leaderboard")
│  └─ VerdictPlane                    (client, components/landing/VerdictPlane.tsx)
├─ MethodologyRow                     (server, static content)
│  └─ 4 × StepCard (number, title, one-sentence body, small SVG glyph)
├─ RankingPreview                     (server — direct DB query, no fetch)
│  ├─ DataTable (5 rows: rank, model, ScoreBadge median, complete runs, provisional Badge)
│  └─ link → /leaderboard
├─ HonestyStrip                       (server, 3 static cards)
└─ Footer
```

**`VerdictPlane`** — the "restrained signal/verdict visual": a single inline SVG (~420×320) showing three small judge nodes (circles labeled J1 J2 J3 in mono) connected by thin teal lines to a central horizontal median bar; every ~4s one faint pulse (a 4px teal dot) travels a line and the bar's fill nudges (CSS animation, not JS). Static image under `prefers-reduced-motion`. Colors limited to ink/line/teal — no semantic colors, no illustration clichés. Decorative: `aria-hidden="true"`.

### 1.3 Data fetching

- Server component reads the leaderboard **directly** via `lib/scoring.ts` query helpers (same process, no HTTP round-trip): top 5 rows for the default bundle `mini-benchmark-v1`. Wrap in `unstable_noStore()`/`dynamic = "force-dynamic"` so standings are always fresh (this is a long-running Node process; no ISR needed).
- No client fetching on this page except the AppShell run indicator.

### 1.4 States

- **Loading:** none needed for server content (streamed HTML). AppShell indicator has no skeleton — it simply appears when data arrives.
- **Empty (no completed runs yet):** RankingPreview renders `EmptyState` — glyph, "No completed runs yet. Rankings appear after the first complete bundle run.", primary button "Start a benchmark" → `/run`.
- **Error (DB read throws):** catch in the component, render the same `EmptyState` with "Standings unavailable" and log server-side. Never crash the landing.

### 1.5 Responsive

- ≥1024px: hero two-column (text 55% / VerdictPlane 45%); methodology 4-across.
- 640–1023px: hero stacks (VerdictPlane below text, max-width 420 centered); methodology 2×2.
- <640px: VerdictPlane hidden (texture also off per plan 07); methodology single column; ranking preview table shows only rank, model, median (other columns hidden via responsive classes).

---

## 2. `/models` — OpenRouter Catalog

### 2.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ Page title: MODELS      "412 models · cached 14 min ago" [↻]   │
├────────────────────────────────────────────────────────────────┤
│ [ 🔍 Search models…  (⌘K) ]  [☐ Free models only] [Provider ▾] │
├────────────────────────────────────────────────────────────────┤
│ ── anthropic (12) ─────────────────────────────────────────────│
│  claude-sonnet-4.5     [128K ctx] [$3.00/M in] [$15.00/M out]  │
│  claude-haiku-4        [200K ctx] [$0.80/M in] [$4.00/M out]   │
│ ── deepseek (8) ───────────────────────────────────────────────│
│  deepseek-v4           [164K ctx] [FREE]                       │
│  …                                    (virtualized list)      │
└────────────────────────────────────────────────────────────────┘
```

Row click opens a `Drawer` with model detail: full ID (mono, copy button), description, context length, pricing table (prompt/completion per M tokens), supported parameters, and two actions: "Use as candidate" / "Use as judge" (both link to `/run` with `?candidates=` / `?judges=` query params prefilling the wizard).

### 2.2 The `ModelPicker` core (shared with plan 09)

The catalog page is a full-page mount of the same engine the run wizard embeds as a command palette. Build it once:

```tsx
// components/models/ModelPicker.tsx (client)
type ModelPickerProps = {
  variant: "page" | "palette";          // full page list vs ⌘K modal
  models: OpenRouterModel[];            // passed in; picker does no fetching
  selectedIds?: string[];               // controlled multi-select (palette variant)
  onToggle?: (id: string) => void;
  maxSelection?: number;
  onOpenDetail?: (id: string) => void;  // page variant → Drawer
};
```

Behavior spec:

- **Fuzzy search:** client-side subsequence matcher in `lib/fuzzy.ts` (no dependency): case-insensitive, matches against `id`, `name`, and provider; scores by consecutive-run length + start-of-word bonuses; highlights matched characters with `text-teal-400`. Must filter 450 models in <5ms (pre-lowercase all haystacks once).
- **Grouping:** rows grouped by provider (the segment before `/` in the OpenRouter id), groups sorted alphabetically, sticky group headers with count. When a search query is active, groups with zero matches disappear and match-score orders rows within groups.
- **Badges per row:** context length (`Badge`, formatted `128K ctx`), prompt price (`$3.00/M`), completion price (`$15.00/M`), and a `FREE` badge (teal-tinted) when both prices are 0.
- **"Free models only" filter:** checkbox toggle; filters to prompt+completion price === 0.
- **Virtualization:** hand-rolled fixed-row-height windowing (row height 44px, header 36px) in `components/models/VirtualList.tsx` — measure scroll container, render visible slice + 10 overscan rows, absolute-position rows inside a spacer div of total height. No `react-virtual` dependency. Must remain smooth with 450+ rows including group headers (flatten groups+rows into a single indexable array of `{type: "header" | "row"}` items).
- **Keyboard (palette variant):** `↑/↓` move active row (skipping headers), `Enter` toggles selection, `Esc` closes, typing filters. Active row scrolls into view. `role="listbox"` / `role="option"` with `aria-selected`; multi-select announced via `useAnnounce`.
- **Palette variant chrome:** opens in `Modal`, search input auto-focused, selected models shown as removable chips above the list, footer shows "N selected · max M".

### 2.3 Component tree & data fetching

```
app/models/page.tsx                    (server)
├─ fetch models: call lib/openrouter.ts getModelCatalog() directly (SQLite cache, ~1h TTL; plan 04)
├─ CatalogHeader                       (client) — count, "cached X ago", refresh button
│     refresh → POST-like: fetch('/api/models?refresh=1') then router.refresh()
├─ ModelPicker variant="page"          (client, receives models as serialized props)
└─ ModelDetailDrawer                   (client) — Drawer + detail layout, driven by ?model= searchParam so detail views are linkable
```

- Server component loads the cached list (450 models ≈ 200KB serialized — acceptable as props; strip unused fields server-side to `{id, name, context_length, pricing, description}` before passing down).
- Stale cache (>1h): server triggers a background refresh but serves stale data immediately; header shows age.
- Detail drawer state lives in the URL (`/models?model=anthropic/claude-sonnet-4.5`) so back button closes it.

### 2.4 States

- **Loading:** `loading.tsx` — page title + search bar skeleton + 12 row skeletons.
- **Empty (search no-match):** inline `EmptyState` in the list area: "No models match ‘xyz’ — clear search / disable free-only filter" with those two actions.
- **Error (OpenRouter unreachable and cache empty):** full-page `EmptyState`: "Could not load the model catalog. Check `OPENROUTER_API_KEY` in Settings." with Retry button (`router.refresh()`) and link to `/settings`. If cache exists but refresh failed, show the stale list plus a dismissible warn banner "Showing cached list — refresh failed".

### 2.5 Responsive

- ≥768px: full row layout with all badges inline.
- <768px: badges wrap to a second line inside the row (row height becomes 64px — the virtualizer reads row height from a breakpoint-aware constant); provider filter dropdown collapses into the search row.

---

## 3. `/bundles` — Immutable Bundle Versions

### 3.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ BUNDLES                                                        │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ mini-benchmark-v1        [PUBLISHED] hash: a3f2…9c (copy)│   │
│ │ 8 categories · seeded panels · created 2026-07-01        │   │
│ │ [Run this bundle →]                                      │   │
│ └──────────────────────────────────────────────────────────┘   │
│ (future versions listed below, newest first)                   │
├────────────────────────────────────────────────────────────────┤
│ COMMON WRAPPER  (collapsible mono block, sanitized)            │
├────────────────────────────────────────────────────────────────┤
│ TASK CARDS — 2×4 grid                                          │
│ ┌ Roleplay ┐ ┌ Coding ┐ ┌ Math ┐ ┌ Research ┐                  │
│ ┌ Marketing┐ ┌ Poster ┐ ┌ Story┐ ┌ Judging  ┐                  │
│  each: category name, one-line summary, token limit Badge,     │
│  validator Badges (e.g. "word count", "exact answer"),         │
│  [View task ▸] → expands card in place                         │
├────────────────────────────────────────────────────────────────┤
│ JUDGE RUBRIC (collapsible) · CHANGELOG (list)                  │
└────────────────────────────────────────────────────────────────┘
```

Expanded task card reveals `Tabs`: **Prompt** (full task body, mono, copy button) · **Output schema** (pretty-printed JSON schema from the bundle's Zod-derived schema, mono) · **Validators** (list of deterministic checks with plain-language descriptions, e.g. "Math: free-plan answer must equal 552 exactly").

### 3.2 Component tree & data fetching

```
app/bundles/page.tsx                   (server)
├─ read bundles + tasks directly from SQLite via lib/db.ts helpers
├─ BundleHeaderCard                    (server) — version, status Badge, content hash (client CopyButton), created, changelog count
├─ WrapperSection                      (client for collapse state) — <details>-based, mono block
├─ TaskCardGrid                        (client — holds which card is expanded)
│  └─ 8 × TaskCard
│     ├─ collapsed: name, summary, Badge(token limit), Badge×n(validators)
│     └─ expanded: Tabs(Prompt | Output schema | Validators)
├─ RubricSection                       (client collapse) — the shared judge prompt
└─ ChangelogList                       (server) — version, date, entry text
```

- Pure server data (bundle content is immutable and local); no client fetching, no loading spinners needed beyond `loading.tsx` skeleton.
- Multiple bundle versions: page lists all bundles; a `?bundle=` searchParam selects which one's tasks are shown (default: newest published). Selecting is a link, so it's server-rendered.
- Immutability messaging: header includes a dim caption "Published bundles are immutable — changes create a new version and a new leaderboard."

### 3.3 States

- **Loading:** `loading.tsx` with header + 8 card skeletons.
- **Empty:** if DB has no bundles (pre-seed dev state): `EmptyState` "No bundles seeded. Run `npm run db:migrate` (or restart the dev server) to install mini-benchmark-v1." (seeding is DB migration 002, `plans/01-database.md`; it runs automatically at boot).
- **Error:** DB errors bubble to `error.tsx` (generic error boundary with retry).

### 3.4 Responsive

- ≥1024px: task grid 4 columns; 640–1023px: 2 columns; <640px: 1 column. Expanded card always spans full row width. Prompt/schema blocks scroll horizontally rather than wrapping mid-token.

---

## 4. `/settings` — Operator Defaults

### 4.1 Layout wireframe

```
┌────────────────────────────────────────────────────────────────┐
│ SETTINGS                                                       │
│ ┌ API KEY ─────────────────────────────────────────────────┐   │
│ │ OpenRouter key   ● Configured (sk-or-…whe4 — last 4 only)│   │
│ │ Read from OPENROUTER_API_KEY in .env.local. Never stored │   │
│ │ or displayed by this app.        [Test connection]       │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌ RUN DEFAULTS ────────────────────────────────────────────┐   │
│ │ Candidate concurrency  [1 ▾]   Judge concurrency [3 ▾]   │   │
│ │ Trials per task        [1 ▾]  (recommended: 3)           │   │
│ │ Default budget cap     [$ 2.00 ]                         │   │
│ │ Request timeout        [120 s]   Max retries [3]         │   │
│ └──────────────────────────────────────────────────────────┘   │
│ ┌ DATA ────────────────────────────────────────────────────┐   │
│ │ Database  ./data/ai-judge.sqlite · 14.2 MB · WAL         │   │
│ │ Models cache  412 models · refreshed 14 min ago  [↻]     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                    [ Save defaults ]           │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 Behavior spec

- **API key card:** the server reports only `{ configured: boolean, maskedTail: string | null }` (`maskedTail` = last 4 characters, per `plans/12-env-deployment.md` §2) — the key itself never leaves the server; there is no input to set it (single-operator, `.env.local` is the source of truth per the master plan). "Test connection" calls `POST /api/settings/test-key` which performs a 1-model list request server-side and returns `{ ok, latencyMs, error? }`; result shown inline (`StatusDot` pass/fail + message). If unconfigured: fail-toned card with copy-paste snippet `OPENROUTER_API_KEY=…` and instructions to restart the dev server.
- **Run defaults:** these seed the run wizard's initial values (plan 09 reads them in its Review step). Fields + validation (Zod, both client and server): candidate concurrency 1–4 (default 1), judge concurrency 1–3 (default 3), trials 1–5 (default 1, helper text recommends 3), default budget cap $0.10–$100 (default $2.00), request timeout 30–600s (default 120), max retries 0–5 (default 3).
- **Persistence:** an `app_settings` single-row JSON table (key/value) via `GET /api/settings` and `PUT /api/settings`. Form is a client component with local state; Save button disabled until dirty; on success announce "Settings saved" via `useAnnounce` + inline confirmation; on validation error, per-field messages in `fail-400`.
- **Data card:** read-only server-rendered facts (db path, file size, WAL mode confirmed, models-cache age) + the same cache refresh button as `/models`.

### 4.3 Component tree & data fetching

```
app/settings/page.tsx                  (server)
├─ reads key status, settings row, db stats server-side (direct lib calls)
├─ ApiKeyCard                          (client — for Test connection interaction)
├─ SettingsForm                        (client — controlled inputs, PUT /api/settings)
└─ DataCard                            (client — cache refresh button)
```

### 4.4 States

- **Loading:** `loading.tsx` — 3 card skeletons.
- **Error:** if settings row missing, server creates defaults on first read (no empty state needed). PUT failure → inline fail banner "Could not save — retry", form stays dirty.
- **Unsaved changes:** navigating away with dirty form is allowed (no blocking dialog) but the Save button pulses once — keep it low-friction.

### 4.5 Responsive

Single column at all widths; cards `max-w-2xl`. Number inputs get `inputMode="decimal"` for mobile keyboards.

---

## 5. Files to implement

```
app/page.tsx
app/models/page.tsx
app/models/loading.tsx
app/bundles/page.tsx
app/bundles/loading.tsx
app/bundles/error.tsx
app/settings/page.tsx
app/settings/loading.tsx
app/api/settings/route.ts              # GET + PUT app settings (Zod-validated)
app/api/settings/test-key/route.ts     # POST — server-side OpenRouter ping
components/landing/VerdictPlane.tsx
components/landing/StepCard.tsx
components/landing/RankingPreview.tsx
components/models/ModelPicker.tsx      # page + palette variants (plan 09 imports this)
components/models/VirtualList.tsx
components/models/ModelRow.tsx
components/models/ModelDetailDrawer.tsx
components/models/CatalogHeader.tsx
components/bundles/BundleHeaderCard.tsx
components/bundles/TaskCard.tsx
components/bundles/TaskCardGrid.tsx
components/bundles/ChangelogList.tsx
components/settings/ApiKeyCard.tsx
components/settings/SettingsForm.tsx
components/settings/DataCard.tsx
lib/fuzzy.ts                           # dependency-free fuzzy matcher + highlight ranges
```

## 6. Contracts with other modules

**API endpoints consumed:**

- `GET /api/models` — cached OpenRouter catalog; `?refresh=1` forces refetch. Row shape per `ModelsResponseSchema` (plan 03 §1): `{ id, name, context_length, pricing: { prompt_usd_per_m: number, completion_usd_per_m: number } | null, supports_structured_outputs, is_free }` (description available from the detail read of `raw_json`).
- `GET /api/runs?status=running` — AppShell run indicator (plan 03 §3b; response `{ runs: [{ id, bundle_id, status, created_at, total_cost_usd }] }`).
- `GET /api/settings` / `PUT /api/settings` — settings JSON `{ candidateConcurrency, judgeConcurrency, trials, defaultBudgetUsd, timeoutSec, maxRetries }` (this plan **owns** these two routes).
- `POST /api/settings/test-key` — `{ ok: boolean, latencyMs?: number, error?: string }` (owned here).
- Landing standings + bundle content are direct server-side `lib/` reads, not HTTP.

**SSE events consumed:** none — these pages never open an EventSource.

**Provided to plan 09:** `ModelPicker` (palette variant), `lib/fuzzy.ts`, and settings defaults consumed by the wizard (via `GET /api/settings`).

**Depends on plan 07:** all `components/ui/*` primitives, tokens, `useAnnounce`, formatters. **Depends on backend plans:** `lib/openrouter.ts` `getModelCatalog()`, `lib/db.ts`, leaderboard query helpers in `lib/scoring.ts`.

## 7. Acceptance criteria

- [ ] `/` renders hero with exact tagline "One bundle. Three independent judges. Reproducible rankings.", both CTAs routing to `/run` and `/leaderboard`, and the VerdictPlane SVG (hidden <640px, static under reduced motion).
- [ ] Landing ranking preview shows top 5 for the default bundle from live DB data; shows the specified EmptyState when no complete runs exist; never 500s if the DB read fails.
- [ ] `/models` lists 400+ models grouped by provider with sticky headers, virtualized so scroll stays at 60fps (no more than ~40 row DOM nodes at any time).
- [ ] Fuzzy search matches subsequences (e.g. "cls45" finds "claude-sonnet-4.5"), highlights matched characters, and filters in <5ms for 450 models.
- [ ] Each model row shows context-length and per-M-token price badges; free models show FREE; the "Free models only" checkbox filters correctly (both prices zero).
- [ ] Model detail opens in a Drawer driven by `?model=` (linkable, back-button closes) with copyable ID and prefill links into `/run`.
- [ ] Stale-cache and refresh-failure states behave as specified (stale list + warn banner rather than a blank page).
- [ ] `/bundles` renders 8 task cards with token-limit and validator badges; expanding shows Prompt / Output schema / Validators tabs with copy buttons; wrapper and rubric are collapsible; changelog lists entries; immutability caption present.
- [ ] `/settings` never renders the API key — only configured-status + last-4 mask; Test connection reports ok/latency or a useful error inline.
- [ ] Settings form validates ranges client and server side, persists via PUT, announces "Settings saved", and its values prefill the run wizard.
- [ ] Every page has a `loading.tsx` skeleton, defined empty states, and an error path that keeps the shell navigable.
- [ ] All four pages pass keyboard-only navigation: search focusable via shortcut, palette arrows/enter/esc work, drawers trap focus, tables/cards reachable in DOM order.
- [ ] Responsive checks at 375px, 768px, 1280px match §1.5, §2.5, §3.4, §4.5.
