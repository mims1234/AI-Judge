/** Anonymous visitor cookie — random hex, not a login id. */
export const VISITOR_COOKIE = "aij_vid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_ID_RE = /^\d{16,22}$/;
const BOT_UA_RE =
  /bot|crawler|spider|crawling|preview|slurp|facebookexternalhit|bingpreview|bytespider|gptbot|claudebot|semrush|ahrefs/i;

export const TRAFFIC_RANGE_DAYS = [7, 30, 90] as const;
export type TrafficRangeDays = (typeof TRAFFIC_RANGE_DAYS)[number];

/** Keep enough days for a 90-day window plus a full prior 90-day comparison. */
export const TRAFFIC_RETENTION_DAYS = 200;

const ALLOWED_ROOTS = new Set([
  "models",
  "bundles",
  "run",
  "runs",
  "playground",
  "leaderboard",
  "compare",
  "judges",
  "settings",
  "admin",
]);

export function isTrafficRangeDays(n: number): n is TrafficRangeDays {
  return (TRAFFIC_RANGE_DAYS as readonly number[]).includes(n);
}

/** 90-day windows collapse to months so the chart stays readable. */
export type TrafficGrain = "day" | "month";

export function seriesGrainForDays(days: TrafficRangeDays): TrafficGrain {
  return days >= 90 ? "month" : "day";
}

export function utcMonth(day: string): string {
  return day.slice(0, 7);
}

/** Inclusive UTC month keys (YYYY-MM) from two YYYY-MM-DD bounds. */
export function eachUtcMonth(from: string, to: string): string[] {
  const start = utcMonth(from);
  const end = utcMonth(to);
  if (start.length < 7 || end.length < 7 || start > end) return [];
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (!y || !m || !ey || !em) return [];
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

export type TrafficSeriesPoint = {
  day: string;
  views: number;
  uniques: number;
};

export type TrafficPathRow = {
  path: string;
  views: number;
};

export type TrafficStats = {
  days: TrafficRangeDays;
  grain: TrafficGrain;
  from: string;
  to: string;
  totals: {
    views: number;
    uniques: number;
    avg_views_per_day: number;
  };
  today: {
    views: number;
    uniques: number;
  };
  previous: {
    views: number;
    uniques: number;
    complete: boolean;
  };
  series: TrafficSeriesPoint[];
  paths: TrafficPathRow[];
};

/** YYYY-MM-DD in UTC. */
export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addUtcDays(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function eachUtcDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    out.push(cursor);
    cursor = addUtcDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return BOT_UA_RE.test(ua);
}

export function privacyDeniedFromHeaders(
  headers: Pick<Headers, "get">,
): boolean {
  const dnt = headers.get("dnt") ?? headers.get("DNT");
  if (dnt === "1" || dnt?.toLowerCase() === "yes") return true;
  const gpc = headers.get("sec-gpc") ?? headers.get("Sec-GPC");
  return gpc === "1";
}

/** When Origin/Referer is present, it must match this Host. */
export function isFirstPartyRequest(request: Request): boolean {
  const host = request.headers.get("host")?.toLowerCase();
  if (!host) return false;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const check = (raw: string | null): boolean | null => {
    if (!raw) return null;
    try {
      return new URL(raw).host.toLowerCase() === host;
    } catch {
      return false;
    }
  };
  const fromOrigin = check(origin);
  if (fromOrigin != null) return fromOrigin;
  const fromReferer = check(referer);
  if (fromReferer != null) return fromReferer;
  return true;
}

function isAllowedMappedPath(parts: string[]): boolean {
  if (parts.length === 0) return true;
  const [root, ...rest] = parts;
  if (!root || !ALLOWED_ROOTS.has(root.toLowerCase())) return false;
  if (rest.length === 0) return true;
  const a = root.toLowerCase();
  const b = rest[0]?.toLowerCase();
  const c = rest[1]?.toLowerCase();
  if (a === "bundles" && b === "new" && rest.length === 1) return true;
  if (a === "playground" && b === "leaderboard" && rest.length === 1) return true;
  if (a === "runs" && b === ":id" && rest.length === 1) return true;
  if (a === "runs" && b === ":id" && c === "cell" && rest.length === 3) {
    return true;
  }
  return false;
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

/**
 * Collapse high-cardinality segments so daily rollups stay small.
 * Drops query/hash, rejects API/assets, maps UUIDs and snowflakes to `:id`.
 */
export function normalizePath(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  let path = raw.trim();
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }

  const q = path.indexOf("?");
  if (q >= 0) path = path.slice(0, q);
  const h = path.indexOf("#");
  if (h >= 0) path = path.slice(0, h);

  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (path.length > 180) return null;

  const lower = path.toLowerCase();
  if (
    lower.startsWith("/api") ||
    lower.startsWith("/_next") ||
    lower.startsWith("/favicon") ||
    lower.endsWith(".ico") ||
    lower.endsWith(".map")
  ) {
    return null;
  }

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return "/";

  const mapped = parts.map((part) => {
    if (UUID_RE.test(part) || LONG_ID_RE.test(part) || part.length > 64) {
      return ":id";
    }
    return part;
  });

  if (!isAllowedMappedPath(mapped)) return null;
  return `/${mapped.join("/")}`;
}
