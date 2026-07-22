import { expect, test } from "@playwright/test";

/**
 * Chat playground smoke: create → message → judge (plans/16).
 *
 * Setup panel uses a command-palette Modal, so we seed via API then deep-link
 * with ?session= (same path used to reopen chats from Recent / leaderboard).
 */
test.describe.configure({ mode: "serial" });

test("create → message → judge flow", async ({ page, request }) => {
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

  await expect(page.getByRole("heading", { name: "Session" })).toBeVisible();
  await expect(page.getByText("mock/cand-a").first()).toBeVisible();

  const composer = page.getByPlaceholder(/Message the candidate/i);
  await composer.fill("Write a TypeScript function to reverse a string.");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByText("Write a TypeScript function to reverse a string."),
  ).toBeVisible();

  const judgeBtn = page.getByRole("button", { name: /Judge conversation/i });
  await expect(judgeBtn).toBeEnabled({ timeout: 30_000 });
  await judgeBtn.click();

  await expect(page.getByRole("heading", { name: "Judging" })).toBeVisible();
  await expect(page.getByText("Classification votes")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/coding/i).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("chat leaderboard surface renders", async ({ page }) => {
  await page.goto("/playground/leaderboard");
  await expect(
    page.getByRole("heading", { name: /leaderboard/i }),
  ).toBeVisible();
  await expect(page.getByText(/Recent judged chats/i)).toBeVisible();
});
