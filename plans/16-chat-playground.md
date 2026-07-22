# 16 — Chat Playground

## Purpose and Scope

Free-form chat with one candidate model, then a multi-judge panel that **classifies** the transcript into a category (8 benchmark categories + `general`) and **scores** it with a category rubric. Results feed a dedicated chat leaderboard (separate from bundle runs).

**In scope:** migration `004_chat_playground`, chat engine + rubrics + analytics, chat API + SSE, `/playground` + `/playground/leaderboard` UI, unit/integration tests.

**Out of scope:** bundle run engine changes, main `/leaderboard` (plan 10), cell page (plan 15).

---

## B1. Data model (migration 004)

Tables (SQLite):

- `chat_sessions` — candidate, judge pool JSON, status, locked `category`, median/disagreement, rounds, cost, events cursor, timestamps
- `chat_messages` — user/assistant turns, tokens/cost/latency
- `chat_judgments` — per round × judge: classification fields + `JudgeOutput`-shaped scores/verdict/feedback
- `chat_events` — durable SSE log (`id` monotonic per session)

Statuses: `active | streaming | judging | judged | error`.

---

## B2. Engine (`lib/chat-engine.ts`)

Mirrors `run-engine` patterns: `globalThis` singleton, per-session `EventEmitter` on `"event"`, persisted vs ephemeral events, BYOK key held in memory only (`bindApiKey` / never written to SQLite).

### B2.1 Message flow

1. `postUserMessage` — guardrails, persist, emit `chat.message.user`
2. `sendMessage` — stream candidate via `streamChat`, coalesce deltas (~66ms), emit `chat.message.delta` / `complete` / `cost`

### B2.2 Judging flow (per round)

1. If `category` is null: each judge runs structured **classification** (`ChatClassificationSchema`)
2. `decideCategory(votes)` — plurality → highest confidence among ties → `CHAT_CATEGORY_ORDER` → fallback `general`
3. Persist category with `UPDATE … SET category = ? WHERE category IS NULL` (lock)
4. Same judges score with `chatRubricFor(category)` → existing `JudgeOutputSchema`
5. Aggregate with `median` / disagreement (`max − min`); flag if disagreement > 3
6. Re-judge: append new round; **skip** classification when category already locked

### B2.3 Guardrails (`CHAT_LIMITS`)

| Limit | Value |
|---|---|
| Max user turns | 20 |
| Max message chars | 8_000 |
| Max transcript chars (judge prompt) | 32_000 (head+tail elision) |
| Judges | 3–5 unique |
| Assistant / classify / judge max tokens | 2048 / 512 / 1536 |

### B2.4 Rubrics (`lib/bundles/chat-rubrics.ts`)

Nine prompts (8 categories + `general`) sharing the benchmark judge JSON contract. `CHAT_CLASSIFY_PROMPT` for step 1.

---

## B3. API + SSE

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/chat/sessions` | Create; requires key; judges must support structured outputs |
| `GET` | `/api/chat/sessions/[id]` | Snapshot (`ChatSessionSnapshotSchema`) |
| `POST` | `/api/chat/sessions/[id]/messages` | User message + kick `sendMessage` |
| `POST` | `/api/chat/sessions/[id]/judge` | Kick judging round (`202`) |
| `GET` | `/api/chat/sessions/[id]/events` | SSE + `Last-Event-ID` / `?lastEventId=` replay |
| `GET` | `/api/chat/leaderboard` | Optional `?category=` |

**Ephemeral (not persisted):** `chat.message.delta`, `chat.judge.delta`, `heartbeat`.

Key events: `chat.session.status`, `chat.message.*`, `chat.judge.started|classified|complete`, `chat.category.decided`, `chat.scored`, `chat.cost`, `chat.error`.

BYOK: `x-openrouter-key` via `getKeyFromRequest` / `resolveApiKey` (same as runs).

---

## B4. Read models (`lib/server/chatAnalytics.ts`)

- `getChatSessionSnapshot` — session + messages + **latest-round** judgments
- `queryChatLeaderboard` — median of session medians, provisional if `< 3` sessions, verdict mix, cost/latency, per-category medians

---

## B5. UI

| Route | Role |
|---|---|
| `/playground` | Setup (candidate + 3–5 judges) → chat thread + composer → judging side panel |
| `/playground/leaderboard` | Category filter chips + ranked table |

Client SSE: `lib/client/useChatStream.ts` (EventSource; key bound on POST, not on SSE).  
Nav: AppShell link **Playground**.

Components under `components/playground/`: `PlaygroundSetup`, `PlaygroundApp`, `ChatThread`, `ChatComposer`, `JudgingPanel`.

---

## B6. Tests

| Suite | Covers |
|---|---|
| `tests/unit/chat-engine.test.ts` | `decideCategory`, `renderTranscript` |
| `tests/unit/chat-rubrics.test.ts` | All 9 rubrics + classify prompt |
| `tests/unit/chat-analytics.test.ts` | Snapshot + leaderboard aggregation |
| `tests/integration/chat-playground.test.ts` | Mock OpenRouter: reply → classify → score → durable SSE; re-judge locks category; message caps |
| Fixtures | `tests/fixtures/sse/chat-classify-coding.sse`, `chat-assistant-reply.sse` |

`createTestDb` calls `resetChatEngineForTests()` on setup and cleanup.

---

## B7. Files

| Path | Role |
|---|---|
| `lib/db.ts` | `migration004` / `004_chat_playground` |
| `lib/schemas.ts` | Chat schemas + `ChatSseEventSchema` + `CHAT_LIMITS` |
| `lib/chat-engine.ts` | Engine singleton |
| `lib/bundles/chat-rubrics.ts` | Classify + score prompts |
| `lib/server/chatAnalytics.ts` | Snapshot + leaderboard |
| `app/api/chat/**` | Sessions, messages, judge, events, leaderboard |
| `app/playground/**` | Pages |
| `components/playground/**` | UI |
| `lib/client/useChatStream.ts` | SSE client |
| `components/ui/AppShell.tsx` | Nav entry |

---

## B8. Acceptance

- [x] Migration creates chat tables
- [x] Classify → decide → score → median path works against mock OpenRouter
- [x] Category locks after first judging; re-judge adds a round without re-classify
- [x] Guardrails: 20 turns, message/transcript caps, 3–5 judges
- [x] Ephemeral deltas not written to `chat_events`
- [x] `/playground` + leaderboard usable; AppShell link present
- [x] Unit + integration suites green
- [ ] Playwright e2e smoke (optional follow-up)
