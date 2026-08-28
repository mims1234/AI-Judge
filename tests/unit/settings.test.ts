import { afterEach, describe, expect, it } from "vitest";
import {
  AppSettingsSchema,
  DEFAULT_APP_SETTINGS,
  LEGACY_UNUSED_TIMEOUT_SEC,
  TIMEOUT_SEC_DEFAULT,
  TIMEOUT_SEC_MAX,
  TIMEOUT_SEC_MIN,
  callDeadlineMs,
  coerceAppSettings,
} from "@/lib/settings";
import { getAppSettings, getCallDeadlineMs, saveAppSettings } from "@/lib/server/appSettings";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("call deadline budget", () => {
  it("clamps to the comfortable OpenRouter wait window", () => {
    expect(callDeadlineMs(TIMEOUT_SEC_DEFAULT)).toBe(600_000);
    expect(callDeadlineMs(30)).toBe(TIMEOUT_SEC_MIN * 1000);
    expect(callDeadlineMs(2_000)).toBe(TIMEOUT_SEC_MAX * 1000);
    expect(callDeadlineMs(Number.NaN)).toBe(600_000);
  });

  it("keeps an explicit 120s timeout instead of rewriting it", () => {
    expect(
      coerceAppSettings({
        ...DEFAULT_APP_SETTINGS,
        timeoutSec: LEGACY_UNUSED_TIMEOUT_SEC,
      }).timeoutSec,
    ).toBe(LEGACY_UNUSED_TIMEOUT_SEC);
    expect(
      coerceAppSettings({ ...DEFAULT_APP_SETTINGS, timeoutSec: 480 }).timeoutSec,
    ).toBe(480);
  });

  it("accepts the new timeout range", () => {
    expect(AppSettingsSchema.parse({ timeoutSec: 60 }).timeoutSec).toBe(60);
    expect(AppSettingsSchema.parse({ timeoutSec: 900 }).timeoutSec).toBe(900);
    expect(AppSettingsSchema.safeParse({ timeoutSec: 30 }).success).toBe(false);
  });
});

describe("persisted settings timeout", () => {
  let tdb: TestDb;
  afterEach(() => {
    tdb?.cleanup();
  });

  it("reads a stored 120s timeout as 120s", () => {
    tdb = createTestDb();
    saveAppSettings({
      ...DEFAULT_APP_SETTINGS,
      timeoutSec: LEGACY_UNUSED_TIMEOUT_SEC,
    });
    expect(getAppSettings().timeoutSec).toBe(LEGACY_UNUSED_TIMEOUT_SEC);
    expect(getCallDeadlineMs()).toBe(LEGACY_UNUSED_TIMEOUT_SEC * 1000);
  });
});
