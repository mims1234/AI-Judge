# 15 — Cell Detail Page Revamp

## Purpose and Scope

Replace the arena **cell drawer** with a dedicated cell detail route. OpenRouter model ids contain `/` and `:`, so the candidate cannot live in a single path segment; category stays in the path and candidate (plus optional trial) live in the query string.

**In scope:** cell URL helpers, enriched run snapshot for the cell page, `/runs/[id]/cell/[category]` UI, arena grid links, legacy `?cell=` redirect, deletion of `CellDrawer.tsx` only (keep `Drawer.tsx`).

**Out of scope:** chat playground (plan 16), report-tab analytics (plan 10), run-engine changes beyond snapshot fields already needed by the cell page.

---

## A1. URL contract

| Piece | Location | Notes |
|---|---|---|
| `runId` | `/runs/[id]/…` | Existing |
| `category` | `/cell/[category]` | One of the 8 `CATEGORY_ORDER` values |
| `candidate` | `?candidate=` | Full OpenRouter id (`provider/model`, may include `:free`) |
| `trial` | `?trial=` | Optional non-negative integer |

Helpers in `lib/cellRef.ts` (also re-exported / mirrored via `lib/client/cellRef.ts` if needed by client bundles):

- `parseCellParam(raw)` — legacy `candidate:category[:trial]` parser (category is the rightmost known enum token)
- `parseTrialParam(raw)`
- `isCategory(raw)`
- `buildCellHref(runId, candidate, category, trial?)` → `/runs/{id}/cell/{category}?candidate=…[&trial=…]`

Legacy deep link ` /runs/[id]?cell=…` must redirect to the new href.

---

## A2. Snapshot additions

`RunSnapshotSchema` / `getRunSnapshot` gain:

- `tasks[]` — id, category, title (for cell header copy)
- `request_hash` on task results / judgments when available (audit / replay)

`GET /api/runs/[id]` delegates to `getRunSnapshot` so the cell page and workbench share one read model.

---

## A3. Cell page UI

Route: `app/runs/[id]/cell/[category]/page.tsx`  
Client view: `components/arena/CellPage.tsx`

First viewport / composition:

- Back link to `/runs/[id]`
- Candidate id, category, trial tabs when `trials > 1`
- Live theatre: candidate stream (reuse `StreamPanel` patterns), validators, three judge verdict cards
- Score hero with animejs `CountUp` when median arrives
- `StatusTimeline` for task lifecycle

Arena cells (`ArenaCell` / `ArenaGrid` / `Workbench`) become `<Link>`s to `buildCellHref` — no drawer.

**Delete:** `components/arena/CellDrawer.tsx` only. Keep `components/ui/Drawer.tsx` (Modal shares `useDialogElement`).

---

## A4. Files

| Path | Role |
|---|---|
| `lib/cellRef.ts` / `lib/client/cellRef.ts` | Parse/build cell URLs |
| `lib/schemas.ts` | Snapshot `tasks` (+ related fields) |
| `lib/server/runSnapshot.ts` | `getRunSnapshot` enrichment |
| `app/api/runs/[id]/route.ts` | Delegate to snapshot |
| `app/runs/[id]/cell/[category]/page.tsx` | Server page + redirect handling |
| `components/arena/CellPage.tsx` | Client theatre |
| `components/arena/CountUp.tsx` | animejs count-up |
| `components/arena/ArenaCell.tsx` / `ArenaGrid.tsx` / `Workbench.tsx` | Links; remove drawer |
| `tests/unit/cell-ref.test.ts` | URL helpers |
| `tests/unit/run-snapshot.test.ts` | Snapshot shape |

---

## A5. Acceptance

- [x] OpenRouter ids with `/` and `:free` round-trip through `buildCellHref` + query parsing
- [x] Arena cell click navigates to cell page (no drawer)
- [x] Legacy `?cell=` redirects
- [x] `CellDrawer.tsx` removed; `Drawer.tsx` retained
- [x] Unit tests for `cell-ref` + `run-snapshot`; `next build` includes cell route
