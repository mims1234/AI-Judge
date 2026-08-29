import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { getDb, prepare } from "@/lib/db";
import {
  addUtcDays,
  eachUtcDay,
  eachUtcMonth,
  monthIsPartial,
  normalizePath,
  shouldTrackRequest,
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
const VISITOR_WINDOW_MS = 10_000;
const DEFAULT_VISITOR_MAX_HITS = 24;
const GLOBAL_WINDOW_MS = 10_000;
const DEFAULT_GLOBAL_MAX_HITS = 2_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

type HitDecision = "ok" | "debounce" | "limited";

const recentHits = new Map<string, number>();
const visitorWindows = new Map<string, { start: number; count: number }>();
let pruneTick = 0;
let globalWindowStart = 0;
let globalWindowCount = 0;
let visitorMaxHits = DEFAULT_VISITOR_MAX_HITS;
let globalMaxHits = DEFAULT_GLOBAL_MAX_HITS;
let lastPruneAt = 0;

export function resetTrafficLimiterForTests(opts?: {
  visitorMaxHits?: number;
  globalMaxHits?: number;
}): void {
  recentHits.clear();
  visitorWindows.clear();
  pruneTick = 0;
  globalWindowStart = 0;
  globalWindowCount = 0;
  visitorMaxHits = opts?.visitorMaxHits ?? DEFAULT_VISITOR_MAX_HITS;
  globalMaxHits = opts?.globalMaxHits ?? DEFAULT_GLOBAL_MAX_HITS;
  lastPruneAt = 0;
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
  if (globalWindowCount >= globalMaxHits) return false;
  globalWindowCount += 1;
  return true;
}

function acceptVisitorBudget(visitorHash: string, now: number): boolean {
  let window = visitorWindows.get(visitorHash);
  if (!window || now - window.start > VISITOR_WINDOW_MS) {
    window = { start: now, count: 0 };
  }
  if (window.count >= visitorMaxHits) return false;
  window.count += 1;
  visitorWindows.set(visitorHash, window);
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
  const visitorTtl = VISITOR_WINDOW_MS * 2;
  for (const [key, window] of visitorWindows) {
    if (now - window.start > visitorTtl) visitorWindows.delete(key);
  }
}

function acceptHit(visitorHash: string, path: string, now: number): HitDecision {
  const key = `${visitorHash}:${path}`;
  const last = recentHits.get(key);
  if (last != null && now - last < HIT_DEBOUNCE_MS) return "debounce";
  if (!acceptVisitorBudget(visitorHash, now)) return "limited";
  if (!acceptGlobal(now)) return "limited";
  if (recentHits.size >= LIMITER_MAX && !recentHits.has(key)) {
    const first = recentHits.keys().next().value;
    if (first != null) recentHits.delete(first);
  }
  recentHits.set(key, now);
  pruneLimiter(now);
  return "ok";
}

function pruneOldTraffic(now: number): void {
  if (lastPruneAt !== 0 && now - lastPruneAt < PRUNE_INTERVAL_MS) return;
  lastPruneAt = now;
  const cutoff = addUtcDays(utcDay(now), -TRAFFIC_RETENTION_DAYS);
  prepare(`DELETE FROM site_daily WHERE day < ?`).run(cutoff);
  prepare(`DELETE FROM site_visitors WHERE day < ?`).run(cutoff);
  prepare(`DELETE FROM site_limited WHERE day < ?`).run(cutoff);
}

function recordLimited(day: string): void {
  prepare(
    `INSERT INTO site_limited (day, hits)
     VALUES (?, 1)
     ON CONFLICT(day) DO UPDATE SET hits = hits + 1`,
  ).run(day);
}

export function recordHit(input: {
  path: string;
  visitorHash: string;
  at?: number;
}): { recorded: boolean; path: string | null } {
  const path = normalizePath(input.path);
  if (!path) return { recorded: false, path: null };

  const now = input.at ?? Date.now();
  const decision = acceptHit(input.visitorHash, path, now);
  if (decision === "debounce") {
    return { recorded: false, path };
  }
  if (decision === "limited") {
    recordLimited(utcDay(now));
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
  return { recorded: true, path };
}

export type { TrafficPathRow, TrafficStats };

function countUniques(from: string, to: string): number {
  const row = prepare(
    `SELECT COUNT(DISTINCT visitor_hash) AS n
     FROM site_visitors
     WHERE day >= ? AND day <= ?`,
  ).get(from, to) as { n: number };
  return Number(row.n) || 0;
}

function uniqueBuckets(
  currentFrom: string,
  rangeFrom: string,
  rangeTo: string,
): { current: number; previous: number } {
  const rows = prepare(
    `SELECT
       CASE WHEN day >= ? THEN 'cur' ELSE 'prev' END AS bucket,
       COUNT(DISTINCT visitor_hash) AS n
     FROM site_visitors
     WHERE day >= ? AND day <= ?
     GROUP BY bucket`,
  ).all(currentFrom, rangeFrom, rangeTo) as Array<{ bucket: string; n: number }>;
  const byBucket = new Map(rows.map((r) => [r.bucket, Number(r.n) || 0]));
  return {
    current: byBucket.get("cur") ?? 0,
    previous: byBucket.get("prev") ?? 0,
  };
}

function monthlySeries(
  from: string,
  to: string,
  viewsByDay: Map<string, number>,
): TrafficSeriesPoint[] {
  const viewsByMonth = new Map<string, number>();
  for (const [day, views] of viewsByDay) {
    if (day < from || day > to) continue;
    const month = day.slice(0, 7);
    viewsByMonth.set(month, (viewsByMonth.get(month) ?? 0) + views);
  }
  const uniqueRows = prepare(
    `SELECT substr(day, 1, 7) AS month, COUNT(DISTINCT visitor_hash) AS uniques
     FROM site_visitors
     WHERE day >= ? AND day <= ?
     GROUP BY month`,
  ).all(from, to) as Array<{ month: string; uniques: number }>;
  const uniquesByMonth = new Map(
    uniqueRows.map((r) => [r.month, Number(r.uniques) || 0]),
  );
  return eachUtcMonth(from, to).map((month) => ({
    day: `${month}-01`,
    views: viewsByMonth.get(month) ?? 0,
    uniques: uniquesByMonth.get(month) ?? 0,
    partial: monthIsPartial(month, from, to),
  }));
}

export function getTrafficStats(
  days: TrafficRangeDays,
  now = Date.now(),
): TrafficStats {
  pruneOldTraffic(now);

  const to = utcDay(now);
  const from = addUtcDays(to, -(days - 1));
  const yesterday = addUtcDays(to, -1);
  const completeDays = Math.max(days - 1, 1);
  const prevTo = addUtcDays(from, -1);
  const prevFrom = addUtcDays(prevTo, -(completeDays - 1));

  const db = getDb();
  const read = db.transaction(() => {
    const viewRows = prepare(
      `SELECT day, SUM(views) AS views
       FROM site_daily
       WHERE day >= ? AND day <= ?
       GROUP BY day`,
    ).all(prevFrom, to) as Array<{ day: string; views: number }>;

    const uniqueRows = prepare(
      `SELECT day, COUNT(*) AS uniques
       FROM site_visitors
       WHERE day >= ? AND day <= ?
       GROUP BY day`,
    ).all(from, to) as Array<{ day: string; uniques: number }>;

    const paths = prepare(
      `SELECT path, SUM(views) AS views
       FROM site_daily
       WHERE day >= ? AND day <= ?
       GROUP BY path
       ORDER BY views DESC
       LIMIT 12`,
    ).all(from, to) as TrafficPathRow[];

    const limitedRows = prepare(
      `SELECT day, hits FROM site_limited WHERE day >= ? AND day <= ?`,
    ).all(from, to) as Array<{ day: string; hits: number }>;

    const viewsByDay = new Map<string, number>();
    let views = 0;
    let throughYesterdayViews = 0;
    let previousViews = 0;
    for (const row of viewRows) {
      const count = Number(row.views) || 0;
      viewsByDay.set(row.day, count);
      if (row.day >= from && row.day <= to) views += count;
      if (row.day >= from && row.day <= yesterday) throughYesterdayViews += count;
      if (row.day >= prevFrom && row.day <= prevTo) previousViews += count;
    }

    const uniquesByDay = new Map(
      uniqueRows.map((r) => [r.day, Number(r.uniques) || 0]),
    );

    const grain = seriesGrainForDays(days);
    const series: TrafficSeriesPoint[] =
      grain === "month"
        ? monthlySeries(from, to, viewsByDay)
        : eachUtcDay(from, to).map((day) => ({
            day,
            views: viewsByDay.get(day) ?? 0,
            uniques: uniquesByDay.get(day) ?? 0,
          }));

    const uniques = countUniques(from, to);
    const compared = uniqueBuckets(from, prevFrom, yesterday);

    let limitedWindow = 0;
    let limitedToday = 0;
    for (const row of limitedRows) {
      const hits = Number(row.hits) || 0;
      limitedWindow += hits;
      if (row.day === to) limitedToday = hits;
    }

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
      through_yesterday: {
        views: throughYesterdayViews,
        uniques: compared.current,
      },
      previous: {
        views: previousViews,
        uniques: compared.previous,
        complete: prevFrom >= addUtcDays(to, -(TRAFFIC_RETENTION_DAYS - 1)),
      },
      limited: {
        today: limitedToday,
        window: limitedWindow,
      },
      series,
      paths: paths.map((p) => ({ path: p.path, views: Number(p.views) || 0 })),
    };
  });

  return read();
}

export function recordHitFromRequest(
  request: Request,
  rawPath: string,
  visitorHash: string,
): { recorded: boolean; path: string | null } {
  if (!shouldTrackRequest(request)) {
    return { recorded: false, path: null };
  }
  return recordHit({ path: rawPath, visitorHash });
}
