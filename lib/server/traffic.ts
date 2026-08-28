import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getDb, prepare } from "@/lib/db";
import {
  addUtcDays,
  eachUtcDay,
  eachUtcMonth,
  isBotUserAgent,
  isFirstPartyRequest,
  normalizePath,
  privacyDeniedFromHeaders,
  seriesGrainForDays,
  TRAFFIC_RETENTION_DAYS,
  utcDay,
  type TrafficPathRow,
  type TrafficRangeDays,
  type TrafficSeriesPoint,
  type TrafficStats,
} from "@/lib/traffic";

const HIT_DEBOUNCE_MS = 2_500;
const LIMITER_MAX = 1_500;
const GLOBAL_WINDOW_MS = 10_000;
const GLOBAL_MAX_HITS = 80;

const recentHits = new Map<string, number>();
let pruneTick = 0;
let globalWindowStart = 0;
let globalWindowCount = 0;

export function resetTrafficLimiterForTests(): void {
  recentHits.clear();
  pruneTick = 0;
  globalWindowStart = 0;
  globalWindowCount = 0;
}

export function hashVisitorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newVisitorToken(): string {
  return randomBytes(16).toString("hex");
}

function acceptGlobal(now: number): boolean {
  if (now - globalWindowStart > GLOBAL_WINDOW_MS) {
    globalWindowStart = now;
    globalWindowCount = 0;
  }
  if (globalWindowCount >= GLOBAL_MAX_HITS) return false;
  globalWindowCount += 1;
  return true;
}

function pruneLimiter(now: number): void {
  while (recentHits.size > LIMITER_MAX) {
    const first = recentHits.keys().next().value;
    if (first == null) break;
    recentHits.delete(first);
  }
  pruneTick += 1;
  if (pruneTick % 64 !== 0) return;
  const ttl = HIT_DEBOUNCE_MS * 4;
  for (const [key, at] of recentHits) {
    if (now - at > ttl) recentHits.delete(key);
  }
}

function acceptHit(visitorHash: string, path: string, now: number): boolean {
  const key = `${visitorHash}:${path}`;
  const last = recentHits.get(key);
  if (last != null && now - last < HIT_DEBOUNCE_MS) return false;
  if (!acceptGlobal(now)) return false;
  if (recentHits.size >= LIMITER_MAX && !recentHits.has(key)) {
    const first = recentHits.keys().next().value;
    if (first != null) recentHits.delete(first);
  }
  recentHits.set(key, now);
  pruneLimiter(now);
  return true;
}

function maybePruneOldRows(now: number): void {
  // Occasional cleanup so unique-hash table cannot grow without bound.
  if (Math.random() > 0.02) return;
  const cutoff = addUtcDays(utcDay(now), -TRAFFIC_RETENTION_DAYS);
  prepare(`DELETE FROM site_daily WHERE day < ?`).run(cutoff);
  prepare(`DELETE FROM site_visitors WHERE day < ?`).run(cutoff);
}

export function recordHit(input: {
  path: string;
  visitorHash: string;
  at?: number;
}): { recorded: boolean; path: string | null } {
  const path = normalizePath(input.path);
  if (!path) return { recorded: false, path: null };

  const now = input.at ?? Date.now();
  if (!acceptHit(input.visitorHash, path, now)) {
    return { recorded: false, path };
  }

  const day = utcDay(now);
  const db = getDb();
  const write = db.transaction(() => {
    prepare(
      `INSERT INTO site_daily (day, path, views)
       VALUES (?, ?, 1)
       ON CONFLICT(day, path) DO UPDATE SET views = views + 1`,
    ).run(day, path);
    prepare(
      `INSERT OR IGNORE INTO site_visitors (day, visitor_hash) VALUES (?, ?)`,
    ).run(day, input.visitorHash);
  });
  write();
  maybePruneOldRows(now);
  return { recorded: true, path };
}

export type { TrafficPathRow, TrafficStats };

function sumViews(from: string, to: string): number {
  const row = prepare(
    `SELECT COALESCE(SUM(views), 0) AS views
     FROM site_daily
     WHERE day >= ? AND day <= ?`,
  ).get(from, to) as { views: number };
  return Number(row.views) || 0;
}

function countUniques(from: string, to: string): number {
  const row = prepare(
    `SELECT COUNT(DISTINCT visitor_hash) AS n
     FROM site_visitors
     WHERE day >= ? AND day <= ?`,
  ).get(from, to) as { n: number };
  return Number(row.n) || 0;
}

function monthlySeries(from: string, to: string): TrafficSeriesPoint[] {
  const viewRows = prepare(
    `SELECT substr(day, 1, 7) AS month, SUM(views) AS views
     FROM site_daily
     WHERE day >= ? AND day <= ?
     GROUP BY month`,
  ).all(from, to) as Array<{ month: string; views: number }>;
  const uniqueRows = prepare(
    `SELECT substr(day, 1, 7) AS month, COUNT(DISTINCT visitor_hash) AS uniques
     FROM site_visitors
     WHERE day >= ? AND day <= ?
     GROUP BY month`,
  ).all(from, to) as Array<{ month: string; uniques: number }>;
  const viewsByMonth = new Map(viewRows.map((r) => [r.month, Number(r.views) || 0]));
  const uniquesByMonth = new Map(
    uniqueRows.map((r) => [r.month, Number(r.uniques) || 0]),
  );
  return eachUtcMonth(from, to).map((month) => ({
    day: `${month}-01`,
    views: viewsByMonth.get(month) ?? 0,
    uniques: uniquesByMonth.get(month) ?? 0,
  }));
}

export function getTrafficStats(
  days: TrafficRangeDays,
  now = Date.now(),
): TrafficStats {
  const to = utcDay(now);
  const from = addUtcDays(to, -(days - 1));
  const prevTo = addUtcDays(from, -1);
  const prevFrom = addUtcDays(prevTo, -(days - 1));

  const viewRows = prepare(
    `SELECT day, SUM(views) AS views
     FROM site_daily
     WHERE day >= ? AND day <= ?
     GROUP BY day`,
  ).all(from, to) as Array<{ day: string; views: number }>;

  const uniqueRows = prepare(
    `SELECT day, COUNT(*) AS uniques
     FROM site_visitors
     WHERE day >= ? AND day <= ?
     GROUP BY day`,
  ).all(from, to) as Array<{ day: string; uniques: number }>;

  const viewsByDay = new Map(viewRows.map((r) => [r.day, Number(r.views) || 0]));
  const uniquesByDay = new Map(
    uniqueRows.map((r) => [r.day, Number(r.uniques) || 0]),
  );

  const grain = seriesGrainForDays(days);
  const series: TrafficSeriesPoint[] =
    grain === "month"
      ? monthlySeries(from, to)
      : eachUtcDay(from, to).map((day) => ({
          day,
          views: viewsByDay.get(day) ?? 0,
          uniques: uniquesByDay.get(day) ?? 0,
        }));

  const paths = prepare(
    `SELECT path, SUM(views) AS views
     FROM site_daily
     WHERE day >= ? AND day <= ?
     GROUP BY path
     ORDER BY views DESC
     LIMIT 12`,
  ).all(from, to) as TrafficPathRow[];

  const views = sumViews(from, to);
  const uniques = countUniques(from, to);

  return {
    days,
    grain,
    from,
    to,
    totals: {
      views,
      uniques,
      avg_views_per_day: days > 0 ? views / days : 0,
    },
    today: {
      views: viewsByDay.get(to) ?? 0,
      uniques: uniquesByDay.get(to) ?? 0,
    },
    previous: {
      views: sumViews(prevFrom, prevTo),
      uniques: countUniques(prevFrom, prevTo),
      complete: prevFrom >= addUtcDays(to, -(TRAFFIC_RETENTION_DAYS - 1)),
    },
    series,
    paths: paths.map((p) => ({ path: p.path, views: Number(p.views) || 0 })),
  };
}

export function recordHitFromRequest(
  request: Request,
  rawPath: string,
  visitorHash: string,
): { recorded: boolean; path: string | null } {
  if (privacyDeniedFromHeaders(request.headers)) {
    return { recorded: false, path: null };
  }
  if (!isFirstPartyRequest(request)) {
    return { recorded: false, path: null };
  }
  if (isBotUserAgent(request.headers.get("user-agent"))) {
    return { recorded: false, path: null };
  }
  return recordHit({ path: rawPath, visitorHash });
}
