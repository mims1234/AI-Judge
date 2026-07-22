# 07 — Design System: Visual Language & Component Primitives

## Purpose and Scope

This document defines the complete visual language for **AI Judge** — a benchmark lab, not a SaaS dashboard. It specifies design tokens (colors, typography, spacing, radii, elevation), the shared component primitives used across every page (score badges, verdict badges, feedback chips, stream panels, progress rails, stat cards, tables), motion rules, and accessibility requirements.

**In scope:** Tailwind theme configuration, global CSS (fonts, textures, keyframes), and every shared/reusable component under `components/ui/`. Every other frontend plan (08, 09, 10) builds exclusively on the primitives defined here.

**Out of scope:** page layouts (08–10), API contracts (owned by backend plans), charts beyond the primitive level (radar/sparkline internals are specified in plan 10 but consume tokens defined here).

---

## 1. Brand & Atmosphere

AI Judge is a **lab instrument**: precise, dark, quiet, evidence-driven. The mood is "terminal meets courtroom" — deep ink surfaces, a single cool teal accent that reads as "signal," monospace numerals for anything measured, and a distinctive display face for the brand mark. Explicitly **not**: purple gradients, glassmorphism blobs, rounded-2xl cards floating on lavender, or emoji-heavy chrome.

Principles:

1. **Dark-first, dark-only in v1.** One theme. No light-mode toggle. All tokens are authored for dark backgrounds.
2. **One accent.** Teal is the only brand hue. Semantic colors (pass green, fail red, warn amber) are reserved strictly for verdicts/feedback and never used decoratively.
3. **Measured things are monospace.** Scores, costs, token counts, latencies, model IDs, hashes, code — always mono. Prose and labels are sans.
4. **Texture is felt, not seen.** A faint grid + noise layer gives the "lab bench" feel at ~2–4% opacity. If a screenshot makes the texture obvious, it's too strong.
5. **Borders over shadows.** Elevation is communicated by border luminance and surface step, not drop shadows (shadows read poorly on ink backgrounds).

---

## 2. Design Tokens

All tokens are defined as CSS custom properties in `app/globals.css` and mapped into Tailwind via `@theme` (Tailwind v4) so classes like `bg-ink-900`, `text-teal-400`, `font-display` work everywhere.

### 2.1 Color palette

#### Ink (background scale — blue-black, not neutral gray)

| Token | Hex | Usage |
|---|---|---|
| `ink-950` | `#070B0F` | Page background (body) |
| `ink-900` | `#0B1117` | Primary surface (cards, panels) |
| `ink-850` | `#0F1720` | Raised surface (drawers, popovers, modals) |
| `ink-800` | `#141E29` | Hover state on surfaces; table row hover |
| `ink-700` | `#1C2936` | Active/pressed surface; selected rows |
| `ink-600` | `#2A3B4D` | Strong borders, dividers on raised surfaces |

#### Line (border scale)

| Token | Hex | Usage |
|---|---|---|
| `line-subtle` | `#182430` | Default 1px borders on `ink-900` surfaces |
| `line-strong` | `#24384A` | Borders on raised surfaces, table header rules |
| `line-focus` | `#2DD4BF` | Focus rings (same as `teal-400`) |

#### Text

| Token | Hex | Usage |
|---|---|---|
| `text-bright` | `#E8F1F5` | Headings, primary values, scores |
| `text-body` | `#A9BCC9` | Body copy, table cells |
| `text-dim` | `#66798A` | Captions, metadata, placeholders |
| `text-faint` | `#42525F` | Disabled text, decorative labels |

#### Teal (accent scale)

| Token | Hex | Usage |
|---|---|---|
| `teal-300` | `#5EEAD4` | Hover state of accent text/links |
| `teal-400` | `#2DD4BF` | Primary accent: active states, focus, brand highlights, stream cursor |
| `teal-500` | `#14B8A6` | Primary buttons, active tabs, progress fill |
| `teal-600` | `#0D9488` | Pressed buttons |
| `teal-900` | `#0A2E2A` | Accent-tinted surface (selected cells, active nav pill bg) |
| `teal-glow` | `rgba(45,212,191,0.15)` | Subtle glow ring around streaming cells (box-shadow color only) |

#### Semantic (verdicts, feedback, status)

| Token | Hex | Usage |
|---|---|---|
| `pass-400` | `#4ADE80` | Pass verdicts, "good" chips text |
| `pass-900` | `#0C2A18` | Pass badge/chip background |
| `fail-400` | `#F87171` | Fail verdicts, "terrible" chips, errors |
| `fail-900` | `#2D1214` | Fail badge/chip background |
| `warn-400` | `#FBBF24` | Partial verdicts, "missing" chips, disagreement flags, provisional badges |
| `warn-900` | `#2B2109` | Warn badge/chip background |
| `info-400` | `#60A5FA` | Informational notices only (rare) |

#### Score ramp (0–10, used by ScoreBadge and arena cells)

Continuous mapping, banded into 5 stops. Never interpolate between hues at runtime — pick the band:

| Band | Range | Text hex | Background hex |
|---|---|---|---|
| `score-terrible` | 0.0–2.9 | `#F87171` | `#2D1214` |
| `score-poor` | 3.0–4.9 | `#FB923C` | `#2A1A0E` |
| `score-mixed` | 5.0–6.4 | `#FBBF24` | `#2B2109` |
| `score-good` | 6.5–7.9 | `#A3E635` | `#1A2410` |
| `score-excellent` | 8.0–10.0 | `#4ADE80` | `#0C2A18` |

Rationale: the ramp goes red → orange → amber → lime → green so a glance across the arena grid reads like a heat map. Teal is deliberately **excluded** from the ramp so accent ≠ score.

### 2.2 Typography

Three Google Fonts, loaded via `next/font/google` (self-hosted at build, `display: swap`):

| Role | Font | Tailwind class | Usage |
|---|---|---|---|
| Display | **Unica One** (fallback: `Impact, sans-serif`) | `font-display` | Brand wordmark "AI JUDGE", hero headline, page titles. Always uppercase, `tracking-[0.08em]`. |
| Sans | **Inter** (variable) | `font-sans` | All UI text, body copy, labels, buttons |
| Mono | **JetBrains Mono** (variable) | `font-mono` | Scores, costs, tokens, latencies, model IDs, hashes, code, JSON schemas, stream output |

Type scale (rem, Tailwind names):

| Token | Size / line-height | Usage |
|---|---|---|
| `text-xs` | 0.75 / 1rem | Chip labels, table meta, badge text |
| `text-sm` | 0.875 / 1.25rem | Table cells, secondary copy, form labels |
| `text-base` | 1 / 1.5rem | Body copy |
| `text-lg` | 1.125 / 1.75rem | Card titles, drawer section headings |
| `text-xl` | 1.25 / 1.75rem | Page section headings |
| `text-2xl` | 1.5 / 2rem | Page titles (with `font-display`) |
| `text-4xl` | 2.25 / 2.5rem | Hero sub-headline |
| `text-6xl` | 3.75 / 1.05 | Hero brand line (display font, uppercase) |

Numeric rules: all mono numerals use `font-variant-numeric: tabular-nums` (`.tabular` utility) so scores align in tables. Scores always render with one decimal (`7.5`, `10.0`). Costs render as `$0.0342` (4 decimals under $1, 2 decimals above).

### 2.3 Spacing, radii, elevation

- **Spacing:** default Tailwind 4px scale. Page gutter `px-6` mobile / `px-10` desktop; max content width `max-w-7xl` centered. Card padding `p-5`; dense table cells `px-3 py-2`.
- **Radii:** `--radius-sm: 4px` (chips, badges), `--radius-md: 8px` (buttons, inputs, cards), `--radius-lg: 12px` (drawers, modals). Nothing rounder — no pills except chips (`rounded-full` allowed for chips and status dots only).
- **Elevation (border-driven, 3 levels):**
  - Level 0 (page): `bg-ink-950`, no border.
  - Level 1 (card/panel): `bg-ink-900 border border-line-subtle`.
  - Level 2 (drawer/popover/modal): `bg-ink-850 border border-line-strong` plus a single ambient shadow `shadow-[0_8px_32px_rgba(0,0,0,0.5)]` — the only drop shadow in the system.

### 2.4 Texture (grid + noise)

Applied once on `<body>` via two stacked pseudo-element layers (defined in `globals.css`):

1. **Grid:** `repeating-linear-gradient` in both axes, 1px lines of `rgba(45,212,191,0.03)` every 48px. Fades out below 640px viewports (mobile: too busy).
2. **Noise:** inline SVG `feTurbulence` data-URI, `opacity: 0.025`, `mix-blend-mode: overlay`, `pointer-events: none`, `position: fixed`.

Both layers must be `aria-hidden` equivalents (pure CSS, no DOM nodes preferred) and add zero layout cost.

---

## 3. Shared Component Specs

All primitives live in `components/ui/`. Each is a client-safe React component (no server-only APIs) with typed props. Class merging via a tiny local `cn()` helper (`clsx` + `tailwind-merge`) in `lib/cn.ts` — no component library dependency (no shadcn install; hand-rolled primitives keep the visual language exact).

### 3.1 `ScoreBadge`

```tsx
type ScoreBadgeProps = {
  score: number | null;       // 0–10, one decimal; null = not yet scored
  size?: "sm" | "md" | "lg";  // sm=table cells, md=cards, lg=arena cells/hero
  showOutOf?: boolean;        // renders "/10" suffix in text-dim
};
```

- Renders `font-mono tabular` value on the score-ramp band colors (text + bg from §2.1).
- `null` renders an em-dash `—` in `text-faint` on `ink-800`.
- Shape: `rounded-[4px]`, `sm: px-1.5 py-0.5 text-xs`, `md: px-2 py-1 text-sm`, `lg: px-3 py-1.5 text-lg`.
- Always includes `aria-label={\`score ${score} out of 10\`}` (color is never the only signal).

### 3.2 `VerdictBadge`

```tsx
type VerdictBadgeProps = { verdict: "pass" | "partial_pass" | "fail"; size?: "sm" | "md" };
```

- `pass`: `pass-400` text on `pass-900`, label "PASS", icon `✓` (SVG check).
- `partial_pass`: `warn-400` on `warn-900`, label "PARTIAL", icon half-circle SVG.
- `fail`: `fail-400` on `fail-900`, label "FAIL", icon `✕` (SVG cross).
- Uppercase `text-xs font-mono tracking-wider`, `rounded-[4px] px-2 py-0.5`, icon + text (never icon-only).

### 3.3 `FeedbackChip` + `FeedbackChipList`

```tsx
type FeedbackChipProps = {
  kind: "good" | "terrible" | "missing" | "violation" | "critical";
  children: React.ReactNode;   // one feedback bullet, plain text
};
type FeedbackChipListProps = { kind: FeedbackChipProps["kind"]; items: string[]; maxVisible?: number }; // default 3, "+N more" expands inline
```

- `good` → `pass-400`/`pass-900`, prefix glyph `+`. `terrible` → `fail-400`/`fail-900`, prefix `−`. `missing` → `warn-400`/`warn-900`, prefix `∅`. `violation` → `fail-400` with dashed border, prefix `⚠` (constraint violations). `critical` → solid `fail-400` bg with `ink-950` text (highest severity), prefix `!!`.
- Chips are `rounded-full px-2.5 py-1 text-xs`, wrap in a flex row `gap-1.5`. Long text truncates at ~120 chars with title attribute holding full text; clicking a truncated chip expands it to full-width block.
- `FeedbackChipList` renders a `<ul>` with `role="list"`; each chip is an `<li>`.

### 3.4 `StreamPanel`

The live token display used in the cell drawer (candidate stream) and collapsed judge streams.

```tsx
type StreamPanelProps = {
  text: string;                 // accumulated tokens so far
  status: "idle" | "streaming" | "done" | "error";
  label: string;                // e.g. "Candidate — anthropic/claude-sonnet-4.5"
  maxHeight?: number;           // px, default 420; scrolls internally
  markdown?: boolean;           // render sanitized markdown when done; raw mono while streaming
  defaultCollapsed?: boolean;   // judge streams pass true
};
```

- Container: `bg-ink-950 border border-line-subtle rounded-md font-mono text-sm text-body p-4 whitespace-pre-wrap`.
- Header row: label (`text-dim text-xs uppercase tracking-wide`), status dot, copy button, collapse toggle.
- **Blinking cursor:** while `status === "streaming"`, append `<span class="stream-cursor" aria-hidden="true" />` — a `2px × 1.1em` `teal-400` block animated by keyframes `cursor-blink` (`steps(1)`, 1s, opacity 1→0→1). Removed on `done`/`error`.
- Auto-scroll: pin to bottom while streaming **only if** the user hasn't scrolled up (track a `stickToBottom` ref; a "Jump to latest ↓" pill appears when unpinned).
- While streaming render plain escaped text (fast). When `done && markdown`, re-render through the sanitized Markdown pipeline (see §5 security note). Never `dangerouslySetInnerHTML` of unsanitized model output; never render candidate HTML live.
- `aria-live` is **not** placed on the token region (would spam screen readers). Status changes announce via the global `StatusAnnouncer` (§3.10).

### 3.5 `ProgressRail`

Thin determinate progress bar used in the run header and step wizard.

```tsx
type ProgressRailProps = {
  value: number; max: number;          // e.g. completed cells / total cells
  segments?: { value: number; tone: "teal" | "pass" | "fail" | "warn" }[]; // optional stacked segments
  label: string;                        // for aria
};
```

- Track: `h-1.5 rounded-full bg-ink-700`. Fill: `bg-teal-500`, width transition `300ms ease-out`.
- Segmented mode stacks tones left-to-right (scored teal / failed red / warned amber) for the run header.
- Semantics: `role="progressbar"` with `aria-valuenow/min/max` and `aria-label`.

### 3.6 `StatCard`

```tsx
type StatCardProps = {
  label: string;                // "Total cost", "Elapsed", "Median score"
  value: string;                // preformatted, mono
  sub?: string;                 // secondary line e.g. "of $2.00 cap"
  tone?: "default" | "accent" | "warn" | "fail";
  icon?: React.ReactNode;
};
```

- Level-1 surface, `p-4`, label in `text-dim text-xs uppercase tracking-wide`, value in `font-mono text-2xl text-bright tabular`, optional sub in `text-dim text-sm`.
- `tone="warn"` adds a left border `border-l-2 border-warn-400` (e.g., spend approaching cap); `fail` for cap exceeded/errors; `accent` for a highlighted metric.

### 3.7 `DataTable`

Generic table shell (not a data-grid library):

```tsx
type Column<T> = {
  key: string; header: string; align?: "left" | "right";
  mono?: boolean;                       // right-aligned mono numerics
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
};
type DataTableProps<T> = {
  columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string;
  onRowClick?: (r: T) => void;
  expandable?: { render: (r: T) => React.ReactNode; isExpanded: (r: T) => boolean; onToggle: (r: T) => void };
  stickyHeader?: boolean; emptyState?: React.ReactNode;
};
```

- `<table>` semantics (never div-grids): `<thead>` sticky (`top-0 bg-ink-900/95 backdrop-blur-sm`), header cells `text-xs uppercase tracking-wide text-dim`, sortable headers are `<button>`s with `aria-sort`.
- Rows: `border-b border-line-subtle`, hover `bg-ink-800`, clickable rows get `cursor-pointer` and full keyboard support (row is focusable, Enter/Space activates).
- Expandable rows render a second `<tr>` with `colSpan` full width; the toggle is a real `<button aria-expanded>` in the first cell.
- Numeric columns: `text-right font-mono tabular`.
- Mobile (<768px): the table wrapper scrolls horizontally (`overflow-x-auto`) with first column sticky-left; page plans may specify card-list alternates.

### 3.8 Buttons, inputs, and small primitives

- **`Button`** — variants: `primary` (`bg-teal-500 hover:bg-teal-400 text-ink-950 font-medium`), `secondary` (`bg-ink-800 border border-line-strong text-bright hover:bg-ink-700`), `ghost` (`text-body hover:text-bright hover:bg-ink-800`), `danger` (`bg-fail-900 text-fail-400 border border-fail-400/30`). Sizes `sm | md | lg`. Loading state swaps label for spinner + keeps width.
- **`Input` / `Select` / `Checkbox` / `RadioCard`** — `bg-ink-950 border border-line-strong rounded-md px-3 py-2 text-body placeholder:text-faint focus:border-teal-400 focus:ring-1 focus:ring-teal-400`. `RadioCard` is a large selectable card (used by wizard bundle/step choices): selected state `border-teal-400 bg-teal-900`.
- **`Badge`** — neutral pill for metadata (`context: 128K`, `$0.25/M`): `bg-ink-800 text-dim border border-line-subtle rounded-[4px] px-1.5 py-0.5 text-xs font-mono`.
- **`Tooltip`** — CSS/`title`-free custom tooltip on hover+focus, `ink-850` surface, 150ms delay; content duplicated for screen readers via `aria-describedby`.
- **`Drawer`** — right-side sheet (arena cell drawer), width `min(720px, 100vw)`, Level-2 surface, backdrop `bg-black/60`. Focus-trapped, `Esc` closes, restores focus to opener. Implemented on `<dialog>` element.
- **`Modal`** — centered variant of the same primitives (confirm cancel-run, spend-cap edit).
- **`Tabs`** — underline style: active tab `text-bright border-b-2 border-teal-400`, inactive `text-dim`. Roving tabindex, `role="tablist"`.
- **`EmptyState`** — centered block with a small SVG glyph (gavel/grid motif), one-line explanation in `text-dim`, and a primary action button.
- **`Skeleton`** — `bg-ink-800 rounded animate-pulse` blocks; respect reduced motion (static block, no pulse).
- **`StatusDot`** — 8px dot + label; colors: idle `text-faint`, streaming `teal-400` (pulses), validating `info-400`, judging `warn-400`, done `pass-400`, error `fail-400`.

### 3.9 `DisagreementFlag`

```tsx
type DisagreementFlagProps = { spread: number; compact?: boolean }; // spread = max − min judge overall
```

- Rendered only when `spread > 3`. Compact (arena cell corner): amber triangle SVG icon, `aria-label="Judges disagreed — spread 4.5"`. Full (drawer/leaderboard): amber chip "JUDGES DISAGREED · spread 4.5 — read this one yourself".

### 3.10 `StatusAnnouncer`

A single visually-hidden `aria-live="polite"` region mounted once in the root layout. Exposes `announce(message: string)` via a small context/store. All async status changes route through it: "Cell coding × gpt-5 finished scoring: 7.5", "Run paused", "Reconnected to run stream". Debounce identical messages within 2s.

---

## 4. Motion Rules

Few, purposeful, all defined as CSS keyframes in `globals.css` and consumed by class — **no animation library**.

| Name | Where | Spec |
|---|---|---|
| `cursor-blink` | StreamPanel cursor | `opacity 1→0` at 50%, `steps(1)`, 1s infinite |
| `cell-state` | Arena cell state change | background/border-color transition `250ms ease-out`; on entering `streaming`, a one-time `box-shadow: 0 0 0 3px teal-glow` fade-in/out over 600ms |
| `score-pop` | Median score fills a cell | scale `0.85→1` + opacity `0→1`, `220ms cubic-bezier(0.2, 0.9, 0.3, 1.2)`, once |
| `rank-enter` | Leaderboard rows on first paint / rank change | `translateY(6px)→0` + fade, `240ms ease-out`, staggered `40ms` per row, max 10 rows staggered |
| `pulse-dot` | StatusDot streaming state | opacity `1→0.4→1`, 1.6s ease-in-out infinite |
| `drawer-in` | Drawer/Modal open | `translateX(16px)→0` + fade `200ms ease-out` (drawer); scale `0.98→1` (modal) |

Rules:

- Nothing animates continuously except `cursor-blink` and `pulse-dot`, and both only while an operation is genuinely live.
- No animation on hover except color transitions (`150ms`).
- **`prefers-reduced-motion: reduce`:** a single global media query sets `animation: none` and `transition-duration: 0.01ms` for all of the above; the stream cursor becomes a static `▌` glyph; `score-pop` and `rank-enter` render final state immediately; progress fills snap. This must be in `globals.css`, not per-component.

---

## 5. Accessibility & Security Baseline

- **Keyboard:** every interactive element reachable in DOM order; arena grid is a `role="grid"` with arrow-key navigation (detailed in plan 09); Drawer/Modal focus-trap with `Esc`; command palette (plan 08) with full arrow/enter/esc support; skip-to-content link first in tab order.
- **Focus:** global visible focus style `outline: 2px solid var(--teal-400); outline-offset: 2px` — never `outline: none` without replacement.
- **Announcements:** all run lifecycle transitions go through `StatusAnnouncer` (§3.10). Progress uses real `role="progressbar"`.
- **Color independence:** every color-coded state pairs with text or glyph (verdict labels, chip prefixes `+ − ∅`, score numerals, disagreement text). Charts (plan 10) always ship a table alternative.
- **Contrast:** all text tokens above meet ≥ 4.5:1 on their specified surfaces (spot-check `text-dim #66798A` on `ink-900 #0B1117` ≈ 4.6:1 — do not use `text-dim` on `ink-700` or lighter; use `text-body` there).
- **Security note for renderers:** model output is rendered as escaped text while streaming and, when complete, optionally through a Markdown pipeline (`marked` or `micromark` + `DOMPurify`-equivalent sanitize with an allowlist: headings, lists, code, tables, links with `rel="noopener nofollow"`). Never execute or iframe candidate HTML/JS.

---

## 6. Files to implement

```
app/globals.css                      # tokens as CSS vars + @theme mapping, texture layers, keyframes, reduced-motion block, focus style
app/layout.tsx                       # next/font setup (Unica One, Inter, JetBrains Mono), body classes, StatusAnnouncer mount, skip link
lib/cn.ts                            # clsx + tailwind-merge helper
lib/format.ts                        # formatScore(1dp), formatUsd, formatTokens, formatLatency, formatRelativeTime
components/ui/ScoreBadge.tsx
components/ui/VerdictBadge.tsx
components/ui/FeedbackChip.tsx       # FeedbackChip + FeedbackChipList
components/ui/StreamPanel.tsx
components/ui/ProgressRail.tsx
components/ui/StatCard.tsx
components/ui/DataTable.tsx
components/ui/Button.tsx
components/ui/Input.tsx              # Input, Select, Checkbox, RadioCard
components/ui/Badge.tsx
components/ui/Tooltip.tsx
components/ui/Drawer.tsx
components/ui/Modal.tsx
components/ui/Tabs.tsx
components/ui/EmptyState.tsx
components/ui/Skeleton.tsx
components/ui/StatusDot.tsx
components/ui/DisagreementFlag.tsx
components/ui/StatusAnnouncer.tsx    # provider + useAnnounce() hook + visually-hidden live region
components/ui/AppShell.tsx           # top nav bar: wordmark, route links, run-in-progress indicator
```

Note: `ScoreBadge.tsx` and `StreamPanel.tsx` appear in the master plan's flat `components/` listing; they live in `components/ui/` as the shared primitive versions — plans 08–10 import from `components/ui/*`.

## 7. Contracts with other modules

- **Consumes no API endpoints and no SSE events.** This module is pure presentation.
- **Provides to plans 08/09/10:** every component in §3, the token vocabulary in §2, `cn()`, `format*` helpers, and the `useAnnounce()` hook.
- **Type contracts:** `verdict` values must match the Zod judge schema in `lib/schemas.ts` (`"pass" | "partial_pass" | "fail"`); cell status values used by `StatusDot`/arena must match the canonical `task_results` statuses (`pending | streaming | validating | judging | scored | error`, `plans/00-overview.md` §4.2). Cells of a cancelled/incomplete run may render distinct *visual* treatments derived from the **run** status (`queued | running | paused | completed | cancelled | incomplete`), but those are presentation states, not task statuses. Import these types from `lib/schemas.ts` — do not redeclare.

## 8. Acceptance criteria

- [ ] `globals.css` defines every color, radius, and font token from §2 as CSS variables mapped into Tailwind; `bg-ink-900`, `text-teal-400`, `font-display`, `font-mono` all resolve.
- [ ] Unica One, Inter, and JetBrains Mono load via `next/font/google` with no layout shift (fallback metrics configured); brand wordmark renders uppercase in Unica One.
- [ ] Grid + noise texture visible at ≤4% opacity on desktop, absent below 640px, zero pointer interception.
- [ ] `ScoreBadge` renders the correct band color for scores 1.0, 4.0, 6.0, 7.0, 9.0 and an em-dash for `null`; all with `aria-label`.
- [ ] `VerdictBadge` renders pass/partial/fail with icon + uppercase label; distinguishable with color vision deficiency (label text present).
- [ ] `FeedbackChipList` renders good/terrible/missing/violation/critical with distinct prefix glyphs; `maxVisible` collapse/expand works via keyboard.
- [ ] `StreamPanel` shows the blinking teal cursor only while streaming, auto-sticks to bottom, unpins when user scrolls up and shows "Jump to latest", and never renders unsanitized HTML.
- [ ] `DataTable` uses semantic `<table>`, sticky header, `aria-sort` on sortable headers, keyboard-activatable rows, and expandable rows with `aria-expanded`.
- [ ] `Drawer` and `Modal` trap focus, close on `Esc`, restore focus to the trigger.
- [ ] All motions from §4 exist as named keyframes; enabling `prefers-reduced-motion` disables every animation and replaces the stream cursor with a static glyph.
- [ ] Global focus outline (2px teal, 2px offset) appears on every interactive element via keyboard tab; no element has focus suppressed.
- [ ] `StatusAnnouncer` live region exists once in the layout and `useAnnounce()` posts polite messages, deduped within 2s.
- [ ] Zero purple anywhere; teal is the only accent; semantic colors appear only on verdicts/feedback/status.
- [ ] Screenshot review: `/` and `/runs/[id]` read as a dark lab instrument — ink surfaces, hairline borders, mono numerals — not a generic dashboard.
