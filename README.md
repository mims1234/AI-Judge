# AI Judge

A public benchmark lab: Next.js 15 + TypeScript + Tailwind + SQLite (`better-sqlite3`). People sign in with Discord, write prompt bundles, and run them against candidate models through OpenRouter using their own API key. Answers stream over SSE, pass deterministic validators, are scored by a seeded blind panel of three LLM judges, and feed bundle-scoped leaderboards. A chat playground judges free multi-turn conversations the same way.

## Requirements

- **Node.js LTS** (even major: 22 or 24 recommended) — required for `better-sqlite3` prebuilt binaries
- npm (ships with Node)
- An [OpenRouter](https://openrouter.ai/) API key (each user pastes their own in production)

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
# Optional for local dev: set OPENROUTER_API_KEY=sk-or-... and AI_JUDGE_MODE=dev

npm run db:migrate
npx playwright install chromium   # one-time, for E2E tests
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). First boot creates `data/ai-judge.sqlite` in WAL mode and applies migrations automatically.

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `AI_JUDGE_MODE` | no | follows `NODE_ENV` | `dev` allows the server key below as a fallback and adds a passwordless Dev sign-in. `prod` requires every user to bring a key. Never run production with `dev`. |
| `OPENROUTER_API_KEY` | no | — | Server-side fallback key, used only in `dev` mode. Ignored in `prod`. Never `NEXT_PUBLIC_`. |
| `OPENROUTER_BASE_URL` | no | `https://openrouter.ai/api/v1` | Override for tests / mock server. |
| `DATABASE_PATH` | no | `./data/ai-judge.sqlite` | Relative to process cwd. |
| `AUTH_SECRET` | production | — | Auth.js session signing secret. Use a long random value. |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | production | — | Discord OAuth application credentials. |
| `AUTH_URL` | production | — | Public origin, e.g. `https://your-domain`. Also sent to OpenRouter as the referer. |

See `.env.example` for the Discord application setup steps.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Long-running Next.js dev server |
| `npm run build` / `npm start` | Production build + single-process server |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest unit + integration |
| `npm run test:e2e` | Playwright E2E against a mock OpenRouter |
| `npm run db:migrate` | Idempotent schema migrations |
| `npm run db:backup` | Online SQLite backup to `data/backups/` |

## API keys and runs

- In production each user's OpenRouter key lives in their browser and is sent with each request. The server holds it **in memory only** for the life of a run or chat; it is never written to SQLite or logs.
- Because keys are not stored, a server restart loses them. A run that was in progress is **parked as paused** with a "needs key" notice, and the person who launched it presses **Resume** to continue from the last checkpoint. Completed tasks are not repeated.
- Pausing a run releases the worker, so other queued runs proceed while it waits.
- Only the launcher (or staff) can pause, resume, cancel or retry a run. Only the person who started a playground chat (or staff) can add turns or re-judge it.

## Database backups

```powershell
npm run db:backup
```

Writes `data/backups/ai-judge-YYYYMMDD-HHmmss.sqlite` using SQLite’s online backup API (safe while the app is running). Take one before deploying a change that adds a migration.

**Restore:** stop the app, copy a backup over `DATABASE_PATH`, start again.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`: lint, typecheck and tests run on a clean checkout first (`ci.yml`), and only then does the self-hosted runner pull, build and restart the PM2 process defined in `ecosystem.config.js`. Other branches run the checks without deploying.

The deploy only manages five keys in the server's `.env.local` (`AI_JUDGE_MODE`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `DATABASE_PATH`, `PORT`). Everything else in that file, including the `AUTH_*` values, is left untouched.

### Hard constraint: one process, no serverless

Do **not** deploy to Vercel / Netlify / Cloudflare / edge. The run engine is an in-process state machine, SQLite is a local file with one writer, and SSE streams are long-lived. The compatible hosting shape is a single VM/VPS or one Docker container with a mounted `data/` volume.

Do not run `next dev` and `next start` against the same `DATABASE_PATH` at once.

## Security

- The app listens on loopback (`127.0.0.1`) and is meant to sit behind a reverse proxy that terminates TLS.
- Runs, chats, published bundles and scores are public records by design; see the in-app Terms and Privacy pages.
- Model output is untrusted: it is sanitized before render, and candidate code is never executed on the host.
- Judges never see which model wrote an answer. Model names that appear in an answer are masked before judging.

## Plans

Original implementation specs live in [`plans/`](./plans/README.md). They describe the first single-operator version and are kept for reference; where they disagree with this README or the code, the code is current.
