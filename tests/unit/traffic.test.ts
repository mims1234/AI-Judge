import { afterEach, describe, expect, it } from "vitest";
import {
  getTrafficStats,
  recordHit,
  resetTrafficLimiterForTests,
} from "@/lib/server/traffic";
import {
  addUtcDays,
  eachUtcMonth,
  isBotUserAgent,
  isFirstPartyRequest,
  monthIsPartial,
  normalizePath,
  privacyDeniedFromHeaders,
  readCookie,
  seriesGrainForDays,
  shouldTrackRequest,
  utcDay,
} from "@/lib/traffic";
import { createTestDb, type TestDb } from "@/tests/integration/helpers/test-db";

describe("traffic path collapse", () => {
  it("drops API and asset paths", () => {
    expect(normalizePath("/api/runs")).toBeNull();
    expect(normalizePath("/_next/static/chunk.js")).toBeNull();
    expect(normalizePath("/favicon.ico")).toBeNull();
  });

  it("strips query and hash, collapses ids", () => {
    expect(normalizePath("/runs/2f1a8c3e-1111-4222-8333-abcdef012345?x=1")).toBe(
      "/runs/:id",
    );
    expect(normalizePath("/runs/2f1a8c3e-1111-4222-8333-abcdef012345/cell/math#top")).toBe(
      "/runs/:id/cell/math",
    );
    expect(normalizePath("/")).toBe("/");
    expect(normalizePath("/bundles/new")).toBe("/bundles/new");
  });

  it("rejects unknown and high-cardinality paths", () => {
    expect(normalizePath("/wp-admin")).toBeNull();
    expect(normalizePath("/bundles/secret-dump")).toBeNull();
    expect(normalizePath("/runs/not-an-id/extra")).toBeNull();
    expect(normalizePath("/admin")).toBeNull();
    expect(normalizePath("/admin/users")).toBeNull();
  });

  it("honors DNT/GPC and first-party host checks", () => {
    expect(privacyDeniedFromHeaders(new Headers({ dnt: "1" }))).toBe(true);
    expect(privacyDeniedFromHeaders(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(privacyDeniedFromHeaders(new Headers())).toBe(false);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("  ")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0")).toBe(false);
    expect(isBotUserAgent("GPTBot/1.0")).toBe(true);
    expect(
      isFirstPartyRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: {
            host: "localhost:3000",
            origin: "https://evil.example",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isFirstPartyRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: { host: "localhost:3000" },
        }),
      ),
    ).toBe(false);
    expect(
      isFirstPartyRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: {
            host: "localhost:3000",
            referer: "http://localhost:3000/models",
          },
        }),
      ),
    ).toBe(true);
    expect(
      isFirstPartyRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
          },
        }),
      ),
    ).toBe(true);
    expect(
      shouldTrackRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
          },
        }),
      ),
    ).toBe(false);
    expect(
      shouldTrackRequest(
        new Request("http://localhost:3000/api/traffic/hit", {
          headers: {
            host: "localhost:3000",
            origin: "http://localhost:3000",
            "user-agent": "Mozilla/5.0",
          },
        }),
      ),
    ).toBe(true);
  });

  it("reads a named cookie", () => {
    expect(readCookie("aij_vid=abc; other=1", "aij_vid")).toBe("abc");
    expect(readCookie(null, "aij_vid")).toBeNull();
  });
});

describe("traffic rollups", () => {
  let tdb: TestDb;
  afterEach(() => {
    resetTrafficLimiterForTests();
    tdb?.cleanup();
  });

  it("increments views and counts a visitor once per UTC day", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests();
    const day = "2026-08-01T12:00:00.000Z";
    const at = Date.parse(day);

    recordHit({ path: "/bundles", visitorHash: "v1", at });
    resetTrafficLimiterForTests();
    recordHit({ path: "/bundles", visitorHash: "v1", at: at + 10_000 });
    resetTrafficLimiterForTests();
    recordHit({ path: "/leaderboard", visitorHash: "v1", at: at + 20_000 });
    resetTrafficLimiterForTests();
    recordHit({ path: "/bundles", visitorHash: "v2", at: at + 30_000 });

    const stats = getTrafficStats(7, at);
    expect(stats.today.views).toBe(4);
    expect(stats.today.uniques).toBe(2);
    expect(stats.totals.uniques).toBe(2);
    expect(stats.paths.map((p) => p.path).sort()).toEqual([
      "/bundles",
      "/leaderboard",
    ]);
    expect(stats.paths.find((p) => p.path === "/bundles")?.views).toBe(3);
  });

  it("fills missing days with zeros and keeps period uniques distinct", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests();
    const today = Date.parse("2026-08-10T08:00:00.000Z");
    const earlier = Date.parse("2026-08-08T08:00:00.000Z");

    recordHit({ path: "/", visitorHash: "same", at: earlier });
    resetTrafficLimiterForTests();
    recordHit({ path: "/", visitorHash: "same", at: today });

    const stats = getTrafficStats(7, today);
    expect(stats.grain).toBe("day");
    expect(stats.series).toHaveLength(7);
    expect(stats.series[0]?.day).toBe(addUtcDays(utcDay(today), -6));
    expect(stats.totals.views).toBe(2);
    expect(stats.totals.uniques).toBe(1);
    expect(stats.through_yesterday.views).toBe(1);
    expect(stats.through_yesterday.uniques).toBe(1);
    expect(stats.limited.window).toBe(0);
  });

  it("debounces the same visitor and path", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests();
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    const first = recordHit({ path: "/", visitorHash: "v", at });
    const second = recordHit({ path: "/", visitorHash: "v", at: at + 200 });
    expect(first.recorded).toBe(true);
    expect(second.recorded).toBe(false);
    expect(getTrafficStats(7, at).today.views).toBe(1);
  });

  it("does not record unknown paths and marks 90-day prior as complete", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests();
    const at = Date.parse("2026-08-01T12:00:00.000Z");
    expect(recordHit({ path: "/not-a-route", visitorHash: "v", at }).recorded).toBe(
      false,
    );
    const stats = getTrafficStats(90, at);
    expect(stats.grain).toBe("month");
    expect(stats.series.length).toBeLessThanOrEqual(4);
    expect(stats.previous.complete).toBe(true);
    expect(stats.totals.views).toBe(0);
  });

  it("compacts 90 days to months and keeps monthly uniques distinct", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests();
    const now = Date.parse("2026-08-28T12:00:00.000Z");
    const early = Date.parse("2026-08-02T12:00:00.000Z");
    const late = Date.parse("2026-08-20T12:00:00.000Z");

    recordHit({ path: "/", visitorHash: "repeat", at: early });
    resetTrafficLimiterForTests();
    recordHit({ path: "/", visitorHash: "repeat", at: late });
    resetTrafficLimiterForTests();
    recordHit({ path: "/", visitorHash: "other", at: late });

    const stats = getTrafficStats(90, now);
    expect(stats.grain).toBe("month");
    expect(stats.series.length).toBeGreaterThanOrEqual(3);
    expect(stats.series.length).toBeLessThanOrEqual(4);
    expect(stats.series.map((p) => p.day.slice(0, 7))).toEqual(
      eachUtcMonth(stats.from, stats.to),
    );

    const august = stats.series.find((p) => p.day.startsWith("2026-08"));
    expect(august?.views).toBe(3);
    expect(august?.uniques).toBe(2);
    expect(august?.partial).toBe(true);
    const june = stats.series.find((p) => p.day.startsWith("2026-06"));
    expect(june?.partial).toBe(false);
    const may = stats.series.find((p) => p.day.startsWith("2026-05"));
    expect(may?.partial).toBe(true);
    expect(stats.totals.uniques).toBe(2);
  });

  it("compares complete days and does not let one visitor starve others", () => {
    tdb = createTestDb();
    resetTrafficLimiterForTests({ visitorMaxHits: 2 });
    const at = Date.parse("2026-08-10T12:00:00.000Z");
    const earlier = Date.parse("2026-08-08T12:00:00.000Z");

    expect(recordHit({ path: "/", visitorHash: "old", at: earlier }).recorded).toBe(
      true,
    );
    resetTrafficLimiterForTests({ visitorMaxHits: 2 });
    expect(recordHit({ path: "/", visitorHash: "v", at }).recorded).toBe(true);
    expect(recordHit({ path: "/models", visitorHash: "v", at: at + 10 }).recorded).toBe(
      true,
    );
    expect(recordHit({ path: "/bundles", visitorHash: "v", at: at + 20 }).recorded).toBe(
      false,
    );
    expect(recordHit({ path: "/", visitorHash: "other", at: at + 30 }).recorded).toBe(
      true,
    );

    const stats = getTrafficStats(7, at);
    expect(stats.today.views).toBe(3);
    expect(stats.today.uniques).toBe(2);
    expect(stats.totals.views).toBe(4);
    expect(stats.through_yesterday.views).toBe(1);
    expect(stats.limited.today).toBe(1);
    expect(stats.limited.window).toBe(1);
    expect(stats.previous.complete).toBe(true);
  });
});

describe("traffic grain helpers", () => {
  it("uses months only for the 90-day window", () => {
    expect(seriesGrainForDays(7)).toBe("day");
    expect(seriesGrainForDays(30)).toBe("day");
    expect(seriesGrainForDays(90)).toBe("month");
  });

  it("lists inclusive UTC months without daily noise", () => {
    expect(eachUtcMonth("2026-05-31", "2026-08-28")).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
    expect(eachUtcMonth("2025-12-15", "2026-02-01")).toEqual([
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(eachUtcMonth("2026-08-01", "2026-08-28")).toEqual(["2026-08"]);
  });

  it("marks calendar months that the window does not fully cover", () => {
    expect(monthIsPartial("2026-05", "2026-05-31", "2026-08-28")).toBe(true);
    expect(monthIsPartial("2026-06", "2026-05-31", "2026-08-28")).toBe(false);
    expect(monthIsPartial("2026-08", "2026-05-31", "2026-08-28")).toBe(true);
    expect(monthIsPartial("2026-08", "2026-08-01", "2026-08-31")).toBe(false);
  });
});
