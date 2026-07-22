import { expect, test } from "@playwright/test";

/**
 * Chat playground smoke: create → message → judge (plans/16).
 *
 * The setup panel drives model selection through a command-palette Modal, which
 * is brittle to script, so we seed the session through the same API the UI
 * calls (POST /api/chat/sessions) and then deep-link into /playground?session=…
 * to exercise the live chat + judging flow against the mock OpenRouter stack.
 */
test.describe.configure({ mode: "serial" });

test("create → message → judge flow", async ({ page, request }) => {
  // Seed a session (candidate + 3 structured-output judges from models fixture).
  const res = await request.post("/api/chat/sessions", {
    data: {
      candidate_model_id: "mock/cand-a",
      judge_pool_model_ids: ["mock/judge-1", "mock/judge-2", "mock/judge-3"],
    },
  });
  expect(res.status()).toBe(201);
  const { session_id: sessionId } = (await res.json()) as {
    session_id: string;
  };
  expect(sessionId).toBeTruthy();

  await page.goto(`/playground?session=${encodeURIComponent(sessionId)}`);

  // Session header renders with the candidate model.
  await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();
  await expect(page.getByText("mock/cand-a").first()).toBeVisible();

  // Send a message to the candidate.
  const composer = page.getByPlaceholder(/Message the candidate/i);
  await composer.fill("Write a TypeScript function to reverse a string.");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // User turn + streamed assistant reply appear in the thread.
  await expect(
    page.getByText("Write a TypeScript function to reverse a string."),
  ).toBeVisible();

  // Judge becomes enabled once the assistant reply completes; run a round.
  const judgeBtn = page.getByRole("button", { name: /Judge conversation/i });
  await expect(judgeBtn).toBeEnabled({ timeout: 30_000 });
  await judgeBtn.click();

  // Classification + per-judge results land in the Judging panel.
  await expect(
    page.getByRole("heading", { name: "Judging" }),
  ).toBeVisible();
  await expect(page.getByText("Classification votes")).toBeVisible({
    timeout: 30_000,
  });
  // Coding category comes from the chat-classify fixture (rendered as a badge
  // like "coding · 92%" and again in the session header).
  await expect(page.getByText(/coding/i).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("chat leaderboard surface renders", async ({ page }) => {
  await page.goto("/playground/leaderboard");
  await expect(
    page.getByRole("heading", { name: /leaderboard/i }),
  ).toBeVisible();
});
