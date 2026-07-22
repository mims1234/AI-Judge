# 12 — Environment, Tooling & Deployment Plan

## Purpose

Define how the AI Judge repository is scaffolded, configured, run, and operated: the exact create-next-app invocation, the dependency list with rationale, the `.env.local` contract, Windows/PowerShell development notes, the single-long-running-process run model (and why serverless is explicitly unsupported), SQLite operational practices (WAL, boot-time folder creation, backups, size expectations), the security baseline, and the canonical npm scripts. Every other plan file assumes the environment described here.

## Scope

**In scope:**

- Repo scaffold: create-next-app flags, TypeScript strict mode, Tailwind setup.
- Runtime + dev dependency list, kept deliberately minimal, with rationale for each.
- Environment variable contract and `.gitignore` policy.
- Windows (win32 + PowerShell) developer-experience notes, especially better-sqlite3 native builds and cross-platform npm scripts.
- Process/run model and the serverless prohibition.
- SQLite operations: WAL, `data/` bootstrap, backup script, size expectations.
- Security baseline for the API key, rendered model output, and payload validation.
- npm scripts: `dev`, `build`, `start`, `test`, `test:e2e`, `db:migrate`, `db:backup`.

**Out of scope:**

- Application logic, schema DDL contents, API route behavior (owned by plans 00–10).
- Test specs and fixtures (owned by `plans/11-testing-verification.md`; this file only provides the scripts and dependencies they run on).
- Cloud hosting, containers, CI pipelines, multi-user auth — all out of scope for v1 per the master plan.

---

## 1. Repo scaffold plan

### 1.1 create-next-app

Run from the workspace root `d:\Coding\2026\Tempest-Dev-2026\AI-Judge` (scaffold into the current directory):

```powershell
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir false --import-alias "@/*" --use-npm --turbopack
```

Flag rationale:

- `--typescript` — required by the whole plan; all code is TS.
- `--tailwind` — Tailwind CSS preconfigured (the version create-next-app ships for Next 15; do not hand-pin a different major).
- `--eslint` — default Next lint config; no extra lint stack in v1.
- `--app` — App Router, matching the `app/` layout in the master plan.
- `--src-dir false` — top-level `app/`, `lib/`, `components/` exactly as the master plan's project layout specifies.
- `--import-alias "@/*"` — imports like `@/lib/db` everywhere.
- `--use-npm` — one package manager; all scripts below assume npm.
- `--turbopack` — default dev bundler for Next 15; harmless for `next build`.

If the interactive prompt asks anything not covered by flags, answer to match the above (no `src/`, App Router yes, alias `@/*`).

### 1.2 TypeScript strict

`tsconfig.json` must have (create-next-app sets most; verify and add the rest):

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`noUncheckedIndexedAccess` matters here: scoring and panel code index into arrays constantly, and this flag forces the undefined-checks that the test plan's edge cases (short pools, missing trials) rely on.

### 1.3 Tailwind

Use whatever Tailwind major create-next-app installs (v4 with the CSS-first `@theme` config as of 2026). Design tokens (ink/teal palette, mono + display fonts per the UI plan) are declared in `app/globals.css`; no `tailwind.config.js` unless the installed major requires it. No Tailwind plugins in v1 — typography for rendered markdown is handled by the sanitizing renderer's own classes (see §6.2), not `@tailwindcss/typography`, to keep the dependency list minimal.

### 1.4 Post-scaffold folder additions

Create empty-but-committed structure (folders git can't track get a `.gitkeep`):

```
lib/                     # created by first code plan; listed for completeness
lib/validators/
components/
tests/unit/  tests/integration/  tests/e2e/  tests/fixtures/
scripts/                 # migrate.ts, backup.ts, record-fixture.ts
data/                    # NOT committed — created at boot (see §5.2); .gitignore'd
```

(No separate `migrations/` folder: migrations are an ordered in-code array inside `lib/db.ts`, tracked in a `migrations` table — see `plans/01-database.md` § Migration strategy.)

### 1.5 Dependencies (minimal, with rationale)

Runtime dependencies (beyond what create-next-app installs — `next`, `react`, `react-dom`):

| Package | Why |
|---|---|
| `better-sqlite3` | Synchronous, in-process SQLite — the master plan's zero-ops local DB. Synchronous API is ideal for one-transaction-per-task atomicity and is safe in a single long-running Node process. |
| `zod` | Master plan's chosen validation layer: bundle definitions, all API payloads, SSE event shapes, judge JSON. |
| `dompurify` + `isomorphic-dompurify` (or `sanitize-html` — pick ONE, prefer `isomorphic-dompurify`) | Sanitizing model-generated markdown-rendered HTML before display (§6.2). This is a security requirement from the master plan ("sanitize rendered Markdown"), not a convenience. |
| `marked` (or `micromark` — pick ONE, prefer `marked` for size/simplicity) | Markdown → HTML for candidate answers and judge feedback, always piped through the sanitizer. |
| `clsx` + `tailwind-merge` | The design system's `cn()` class-merging helper (`lib/cn.ts`, plan 07) — two tiny utilities in lieu of any component library. |

Dev dependencies:

| Package | Why |
|---|---|
| `typescript`, `@types/node`, `@types/react`, `@types/better-sqlite3` | Types. |
| `vitest`, `@vitest/coverage-v8` | Unit + integration test runner per master plan stack. |
| `@playwright/test` | E2E browser flows per master plan stack. |
| `@axe-core/playwright` | Accessibility scans required by `plans/11-testing-verification.md` §3.3. |
| `tsx` | Runs TypeScript scripts (`scripts/migrate.ts`, `scripts/backup.ts`) directly on Windows and elsewhere without a build step. |
| `cross-env` | Sets env vars in npm scripts identically under PowerShell and POSIX shells (§3.2). |

Deliberately **excluded** (do not add without a new plan revision): ORMs (Drizzle/Prisma — raw prepared statements are simpler for this schema), state-management libraries, component libraries, `dotenv` (Next.js loads `.env.local` natively; scripts get env via `cross-env`/Next's loader or read `.env.local` with a 10-line parser in `scripts/env.ts`), CSS-in-JS, tRPC, Redis or any queue — the in-process run queue is a design commitment.

Version policy: install latest stable at scaffold time, commit `package-lock.json`, and never float versions in `package.json` beyond caret defaults. `better-sqlite3` must be a version with prebuilt binaries for the installed Node major (§3.1).

---

## 2. `.env.local` contract

Exactly three variables in v1:

```
OPENROUTER_API_KEY=sk-or-...        # REQUIRED. Server-only secret.
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1   # Optional override; this default is baked in code.
DATABASE_PATH=./data/ai-judge.sqlite               # Optional override; this default is baked in code.
```

Rules (enforced in code, verified in review):

- **`OPENROUTER_API_KEY` is server-only.** It is read exclusively in server code (`lib/openrouter.ts`). It must never be prefixed `NEXT_PUBLIC_`, never appear in any client component, client bundle, SSE event, API response body, log line, or export file. `/settings` shows only presence + last 4 characters, computed server-side.
- **Never committed.** `.env.local` is git-ignored (below). Ship a committed `.env.example` containing the three keys with empty/default values and a comment that the key is a secret.
- `OPENROUTER_BASE_URL` exists so tests and Playwright can point the client at the mock server (contract with `plans/11-testing-verification.md`); the client must read it at call time, not module-load time.
- `DATABASE_PATH` is resolved relative to the process working directory; tests override it to temp files. All DB access goes through `lib/db.ts`, the only reader of this variable.
- Boot validation: on server start, `lib/env.ts` Zod-parses `process.env` for these three (key required non-empty, URL well-formed, path non-empty) and fails fast with a readable message listing what is missing — no half-configured server.

`.gitignore` additions on top of create-next-app defaults (which already include `.env*`; verify and make explicit):

```gitignore
# secrets
.env.local
.env*.local

# local database + WAL/SHM sidecars + backups
data/

# test artifacts
playwright-report/
test-results/
coverage/
```

`data/` covers `ai-judge.sqlite`, `ai-judge.sqlite-wal`, `ai-judge.sqlite-shm`, and `data/backups/`.

---

## 3. Windows development notes (win32 + PowerShell)

This project's primary dev machine is Windows 10/11 with PowerShell; everything below must work there without WSL.

### 3.1 better-sqlite3 native module

- `better-sqlite3` ships **prebuilt binaries** for common Node LTS versions on win32-x64; on `npm install` it downloads a prebuild and no compiler is needed. Use an even-numbered Node LTS (22 or 24) installed via the official installer or nvm-windows.
- If no prebuild matches (odd Node version, or Electron-style ABI mismatch), it falls back to compiling with node-gyp, which on Windows requires **Python 3** and the **Visual Studio Build Tools "Desktop development with C++" workload**. Document in the README: `winget install Microsoft.VisualStudio.2022.BuildTools` plus the C++ workload, or simply switch to a Node LTS with prebuilds. Do not chase node-gyp issues before checking Node version alignment.
- After any Node major upgrade, run `npm rebuild better-sqlite3`.
- Antivirus/Defender note: the `.sqlite-wal` file sees frequent writes; if runs stall on I/O, add the repo's `data/` folder to Defender exclusions (optional, documented, never required for correctness).

### 3.2 Cross-platform npm scripts

- Never use POSIX-only syntax in `package.json` scripts: no `VAR=x cmd` prefixes (breaks PowerShell/cmd), no `rm -rf`, no `cp`, no `&&`-chained env exports. Use `cross-env` for env vars and `tsx` scripts for anything involving file operations (backup/migrate are Node scripts, not shell one-liners).
- Paths in scripts and code use forward slashes or `path.join`; Node normalizes forward slashes on Windows. Never hard-code `\` in committed code.
- `DATABASE_PATH=./data/ai-judge.sqlite` with forward slashes works as-is on Windows via Node's path handling.
- Line endings: add `.gitattributes` with `* text=auto eol=lf` so fixture files (byte-exact SSE recordings from the test plan!) don't get CRLF-mangled. Mark `tests/fixtures/sse/*.sse` explicitly `-text` (binary) so recorded chunk boundaries survive.
- Port cleanup in PowerShell (README snippet): `Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | Stop-Process` when a dev server is orphaned.

---

## 4. Run model: one long-running Node process

The application runs as a **single long-running Node.js process** — `next dev` in development, `next build && next start` for real benchmarking sessions. This is a hard architectural constraint from the master plan, not a preference:

1. **In-process run queue.** The run engine (`lib/run-engine.ts`) is an in-memory state machine living inside the Next.js server process. It holds active `AbortController`s (for cancel), pause/resume flags, the judge-concurrency limiter, and in-flight SSE fan-out. Serverless functions are born and killed per request — a run started in one invocation would have no process alive to continue streaming candidates, run judges, or accept a cancel signal. Background work simply does not survive.
2. **Local SQLite file.** `better-sqlite3` opens a file on local disk with WAL sidecars. Serverless/edge filesystems are ephemeral and per-instance: two concurrent lambda instances would each see different (and soon-to-be-deleted) database files. Edge runtimes additionally cannot load native Node addons at all.
3. **Reconnectable SSE.** `GET /api/runs/[id]/events` holds a response open for minutes and replays from the durable event log. Serverless platforms cap response duration and buffer/kill long streams; the reconnect contract in the test plan (§2.4) assumes the same process can serve live events while the engine appends to the log.

Consequences, stated explicitly for implementers:

- **Do not deploy to Vercel/Netlify/Cloudflare or any serverless/edge target.** It will type-check, build, and then silently lose runs mid-flight and/or reset the database. If remote hosting is ever wanted, the correct v1-compatible shape is a plain VM/VPS or a single Docker container running `next start` with a mounted volume for `data/` — but that is out of scope; v1 targets the local dev machine.
- All API routes that touch the DB or engine must declare `export const runtime = "nodejs"` (never `edge`) and routes serving SSE or engine state must set `export const dynamic = "force-dynamic"` so nothing is statically cached.
- The engine must be resilient to **dev-mode module reloads**: hold the engine and DB singletons on `globalThis` (the standard Next.js dev singleton pattern) so hot reloads don't spawn duplicate queues or reopen the DB. Durable checkpoints in SQLite (per the master plan) remain the true recovery mechanism — if the process dies, `npm run dev`/`start` boots and the engine's recovery re-enqueues orphaned `running`/`queued` runs automatically (`paused` runs wait for the operator), per `plans/05-run-engine.md` § Architecture.
- Exactly one process may own the SQLite file at a time. Do not run `next dev` and `next start` simultaneously against the same `DATABASE_PATH`.

---

## 5. SQLite operations

### 5.1 Connection pragmas (in `lib/db.ts`, applied on every open)

```ts
db.pragma("journal_mode = WAL");     // readers don't block the writer; survives crashes cleanly
db.pragma("synchronous = NORMAL");   // safe with WAL; big write-latency win
db.pragma("foreign_keys = ON");      // schema integrity
db.pragma("busy_timeout = 5000");    // rare contention (backup/read scripts) waits instead of throwing
```

WAL rationale: the engine writes one transaction per completed task while SSE/report/leaderboard requests read concurrently; WAL makes that concurrency safe and fast, and it is crash-durable (the crash-recovery tests in the testing plan run against WAL mode).

### 5.2 `data/` folder creation on boot

`lib/db.ts` is the singleton entry point. Before opening the database it must:

1. Resolve `DATABASE_PATH` (default `./data/ai-judge.sqlite`).
2. `fs.mkdirSync(path.dirname(resolved), { recursive: true })` — first boot on a fresh clone creates `data/` with no manual step.
3. Open the DB, apply pragmas, and run pending migrations from the in-code migration array (tracked in the `migrations` table, per `plans/01-database.md` § Migration strategy), so `npm run dev` on a fresh clone is fully self-initializing. `npm run db:migrate` exists for running the same migration step explicitly/CI-style.

### 5.3 Backup strategy

Simple, correct file-copy backups via `scripts/backup.ts` (`npm run db:backup`):

1. Open the DB read-only via `better-sqlite3`.
2. Use the built-in `db.backup(destPath)` API (better-sqlite3 wraps SQLite's online backup — this is the "file copy while checkpointed" done safely; never raw-copy the `.sqlite` file while the app is writing, because WAL sidecar state would be torn).
3. Destination: `data/backups/ai-judge-YYYYMMDD-HHmmss.sqlite`; create the folder if missing; print the path and final size.
4. Optionally `PRAGMA wal_checkpoint(TRUNCATE)` first when the app is idle so the backup and main file are compact.
5. Guidance in README: back up before upgrading the app or deleting runs; backups are plain SQLite files — restoring = stop the process, copy a backup over `DATABASE_PATH`, start again.

The script works while the app is running (online backup) but the recommended habit is running it between benchmark runs.

### 5.4 Size expectations

Persisted per task: full final candidate text (not token-by-token), 3+ judge raw outputs and parsed JSON, validator rows, and metadata. Rough budget per full bundle run (1 candidate × 8 categories × 1 trial): 8 tasks × (~4 KB answer + 3 × ~2 KB judgments + overhead) ≈ **100–150 KB per candidate per run**. A heavy month of experimentation (say 100 candidate-runs) stays **well under 50 MB**. Practical guidance:

- No size management features needed in v1; SQLite handles multi-GB files fine.
- The events log (SSE replay) is the growth outlier if per-token deltas were persisted — they must not be; events store coarse state transitions and final texts per the master plan ("persist full final text, not every token").
- If `data/` exceeds ~1 GB something is wrong (likely someone started persisting deltas) — treat as a bug, not an ops task.

---

## 6. Security notes

Single-operator local app, but the model outputs are untrusted remote content, so:

1. **API key server-only** — full rules in §2. Additionally: never forward the key in exports, error messages, or the run snapshot API; OpenRouter request headers are constructed only inside `lib/openrouter.ts`.
2. **Sanitize all rendered model output.** Candidate answers and judge feedback may contain arbitrary markdown/HTML/script. Rendering pipeline: markdown → HTML via `marked` → sanitize via DOMPurify (allowlist basic formatting; strip all HTML that arrived pre-formed in the model output, all `<script>`, `<style>`, `<iframe>`, event handlers, `javascript:` URLs) → inject. **Never** pass model text to `dangerouslySetInnerHTML` unsanitized, never render candidate-produced HTML "live" (the Poster/Marketing tasks display output as escaped text or sanitized markdown, never as an HTML preview), and never execute candidate code (Coding category is displayed in a `<pre>` code block, validated statically only — reinforced by the master plan's `node:vm`-is-not-a-boundary warning).
3. **Zod-validate every boundary**: all API route request bodies and query params (`/api/runs`, `/api/runs/preflight`, control endpoints, leaderboard/export params), the OpenRouter model-list response before caching, judge JSON before scoring (with the one schema-focused retry then reserve replacement from the master plan), and bundle definitions at seed time. Reject with 400 + a safe error message; never echo raw invalid input back into HTML.
4. SSE events are server-generated JSON only; no model text goes into event `id`/`event` fields (data payload only, sanitized at render time like everything else).
5. Exports (CSV/JSON) contain raw model text by design; CSV fields must be properly quoted/escaped so spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes) is neutralized by prefixing a `'` on formula-leading cells.
6. The server binds to localhost by default (`next start` default) — do not add `-H 0.0.0.0` to scripts; exposing the app exposes spend-money endpoints with no auth.

---

## 7. npm scripts

`package.json` scripts block (canonical; test plan and README reference these names):

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:backup": "tsx scripts/backup.ts"
  }
}
```

Notes:

- `test` runs unit + integration (both live under Vitest); Playwright is separate because it boots the app.
- `test:e2e` relies on `playwright.config.ts`'s `webServer` to build/start the app with mock-server env (`cross-env` used inside that config or via Playwright's `env` option, not in the script string — keeps the script Windows-safe).
- `db:migrate` is idempotent (re-runs apply nothing new) and is also invoked automatically on boot by `lib/db.ts` (§5.2); the explicit script exists for pre-flighting schema changes and for CI.
- `db:backup` works against a live app (§5.3).
- No `postinstall` hooks; `playwright install chromium` is a documented one-time README step, not automated (keeps `npm install` fast and predictable).

## Files to implement

Exact paths owned by this plan:

- `package.json` (scripts block + dependency set per §1.5/§7)
- `tsconfig.json` (strict flags per §1.2)
- `.env.example`
- `.gitignore` (additions per §2)
- `.gitattributes` (LF policy + SSE fixture binary marking per §3.2)
- `lib/env.ts` (Zod-validated env access, fail-fast boot check)
- `scripts/migrate.ts` (explicit migration runner wrapping `lib/db.ts`'s migrator)
- `scripts/backup.ts` (online backup via `db.backup()`, timestamped output in `data/backups/`)
- `README.md` (setup: Node LTS requirement, `npm install`, `playwright install chromium`, `.env.local` from `.env.example`, Windows build-tools fallback note, backup/restore how-to, localhost-only warning)

Referenced but owned elsewhere: `lib/db.ts` and its in-code migrations (data-model plan) — this plan constrains their pragmas, boot behavior, and `DATABASE_PATH` handling; `vitest.config.ts` / `playwright.config.ts` (testing plan) — this plan supplies the scripts and dependencies they need.

## Contracts with other modules

- **`lib/db.ts` (data-model plan)**: must read `DATABASE_PATH` via `lib/env.ts`, mkdir the parent folder, apply the §5.1 pragmas, run migrations on open, expose `db.backup`-compatible handle to `scripts/backup.ts`, and use the `globalThis` singleton pattern for dev-reload safety.
- **`lib/openrouter.ts` (OpenRouter client plan)**: sole reader of `OPENROUTER_API_KEY`; reads `OPENROUTER_BASE_URL` at call time so the testing plan's mock server substitution works; no other module touches these env vars.
- **`lib/run-engine.ts` (run-engine plan)**: lives in-process per §4; must tolerate dev hot-reload via the shared singleton; its boot recovery re-enqueues orphaned `running`/`queued` runs (plan 05).
- **API route files (streaming/API plan)**: every route declares `runtime = "nodejs"`; SSE + engine routes declare `dynamic = "force-dynamic"`; all payloads Zod-validated per §6.3.
- **UI plans**: any component rendering model-derived text must use the shared sanitized-markdown renderer (a `components/SafeMarkdown.tsx` or equivalent owned by the UI plan, built on the `marked` + DOMPurify pipeline specified here); no direct `dangerouslySetInnerHTML` of model text anywhere else.
- **Testing plan (`plans/11-testing-verification.md`)**: depends on the `test`/`test:e2e` scripts, the `OPENROUTER_BASE_URL`/`DATABASE_PATH` override contract, dev dependencies (`vitest`, `@playwright/test`, `@axe-core/playwright`, `tsx`, `cross-env`), and the `.gitattributes` binary marking of SSE fixtures.
- **Master plan**: env variable names and defaults match its Env section verbatim; the stack stays within its declared choices (no additional infrastructure).

## Acceptance criteria

- [ ] Fresh clone on this Windows machine: `npm install` succeeds with no compiler toolchain (prebuilt better-sqlite3 binary), `npm run dev` boots, creates `data/ai-judge.sqlite` in WAL mode automatically, and fails fast with a clear message if `OPENROUTER_API_KEY` is missing from `.env.local`.
- [ ] `git status` after a full run shows no untracked `data/` or `.env.local` — `.gitignore` verified; `.env.example` committed with empty key.
- [ ] Grep of the client bundle output (`.next/static`) finds no occurrence of the API key or `OPENROUTER_API_KEY` usage in client code; the key appears only in `lib/openrouter.ts` / `lib/env.ts` in source.
- [ ] All npm scripts (`dev`, `build`, `start`, `test`, `test:e2e`, `db:migrate`, `db:backup`) run successfully in PowerShell with no POSIX-only syntax anywhere in `package.json`.
- [ ] `tsconfig.json` has `strict` and `noUncheckedIndexedAccess` enabled and `npm run build` passes under them.
- [ ] `npm run db:backup` while the dev server is running produces a valid timestamped copy in `data/backups/` that opens in a SQLite client and contains all committed rows.
- [ ] `npm run db:migrate` is idempotent: second consecutive invocation applies zero migrations and exits 0.
- [ ] All API routes declare `runtime = "nodejs"`; a repo grep finds no `runtime = "edge"` and no route relying on static caching for run/engine data.
- [ ] README documents: Node LTS requirement, one-time `playwright install chromium`, Windows Build Tools fallback for better-sqlite3, backup/restore procedure, the serverless prohibition (with the §4 reasoning summarized), and the localhost-only security note.
- [ ] Model-output rendering paths all go through the sanitizer: repo grep for `dangerouslySetInnerHTML` shows only the single shared sanitized-markdown component; no candidate HTML preview or code execution exists anywhere.
- [ ] CSV export escapes formula-leading cells; verified by exporting a fixture answer starting with `=SUM(` and opening the CSV safely.
- [ ] Dependency list matches §1.5 exactly — no ORM, no state library, no queue/Redis, no `dotenv`; `package-lock.json` committed.
