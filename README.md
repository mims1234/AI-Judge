# AI Judge

Single-operator benchmark lab: Next.js 15 + TypeScript + Tailwind + SQLite (`better-sqlite3`). Sends an immutable 8-category prompt bundle to candidate models via OpenRouter, streams answers over SSE, runs deterministic validators, scores with a seeded blind 3-LLM-judge panel, and aggregates bundle-scoped leaderboards.

## Requirements

- **Node.js LTS** (even major: 22 or 24 recommended) — required for `better-sqlite3` prebuilt binaries
- npm (ships with Node)
- An [OpenRouter](https://openrouter.ai/) API key

### Windows note (`better-sqlite3`)

On Node LTS, `npm install` downloads a prebuild — no compiler needed. If install falls back to compiling (odd Node version / ABI mismatch), either switch to an LTS with prebuilds or install:

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

…with the **Desktop development with C++** workload, plus Python 3. After a Node major upgrade, run `npm rebuild better-sqlite3`.

## Setup

```powershell
npm install
Copy-Item .env.example .env.local
# Edit .env.local and set OPENROUTER_API_KEY=sk-or-...

npm run db:migrate
npx playwright install chromium   # one-time, for E2E tests later
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). First boot creates `data/ai-judge.sqlite` in WAL mode automatically.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | yes | — | Server-only. Read only in `lib/openrouter.ts`. Never `NEXT_PUBLIC_`. |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | Override for tests / mock server. |
| `DATABASE_PATH` | no | `./data/ai-judge.sqlite` | Relative to process cwd. |

Missing `OPENROUTER_API_KEY` fails fast at boot with a readable error.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Long-running Next.js dev server |
| `npm run build` / `npm start` | Production build + single-process server |
| `npm test` / `npm run test:watch` | Vitest unit + integration |
| `npm run test:e2e` | Playwright E2E |
| `npm run db:migrate` | Idempotent schema + seed migrations |
| `npm run db:backup` | Online SQLite backup to `data/backups/` |

## Database backups

```powershell
npm run db:backup
```

Writes `data/backups/ai-judge-YYYYMMDD-HHmmss.sqlite` using SQLite’s online backup API (safe while the app is running). Preferred habit: back up between benchmark runs.

**Restore:** stop the app, copy a backup over `DATABASE_PATH`, start again.

## Hard constraint: one process, no serverless

Do **not** deploy to Vercel / Netlify / Cloudflare / edge. The run engine is an in-process durable state machine, SQLite is a local file with one writer, and SSE streams are long-lived. Compatible hosting shape later would be a single VM/VPS or one Docker container with a mounted `data/` volume — not serverless.

Do not run `next dev` and `next start` against the same `DATABASE_PATH` at once.

## Security

- Binds to **localhost** by default — do not add `-H 0.0.0.0` (no auth; spend-money endpoints).
- Model output is untrusted: sanitize before render; never execute candidate code on the host.

## Plans

Implementation specs live in [`plans/`](./plans/README.md). Track A (this foundation) owns `lib/db.ts`, migrations, `lib/bundles/mini-v1.ts`, `lib/env.ts`, and the scripts/configs above.
