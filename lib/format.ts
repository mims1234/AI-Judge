/**
 * Display formatters (plans/07 §6). Scores 1dp, USD 4dp under $1 / 2dp above,
 * tabular-friendly token/latency/relative-time formats.
 */

export function formatScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "—";
  return score.toFixed(1);
}

export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || Number.isNaN(usd)) return "—";
  const abs = Math.abs(usd);
  const digits = abs < 1 ? 4 : 2;
  return `$${usd.toFixed(digits)}`;
}

/** USD range like "$0.84–1.32" (compacts the currency sign on the high end). */
export function formatUsdRange(min: number, max: number): string {
  const hiDigits = Math.abs(max) < 1 ? 4 : 2;
  return `${formatUsd(min)}–${max.toFixed(hiDigits)}`;
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

export function formatContext(contextLength: number | null | undefined): string {
  if (contextLength == null) return "—";
  return `${formatTokens(contextLength)} ctx`;
}

export function formatLatency(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

/** Elapsed clock "12:41" (mm:ss) or "1:02:03" (h:mm:ss). */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms) || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatRelativeTime(iso: string | number | null | undefined): string {
  if (iso == null) return "—";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  if (diff < 45_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(t).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Input is a 0..1 fraction. */
export function formatPercent(fraction: number | null | undefined, digits = 0): string {
  if (fraction == null || Number.isNaN(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** First n chars of an id for compact display ("#a3f2c1d4"). */
export function shortId(id: string, n = 8): string {
  return id.length <= n ? id : id.slice(0, n);
}

/** File/DB size for operator facts (e.g. /settings Data card). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export type ScoreBandName = "terrible" | "poor" | "mixed" | "good" | "excellent";

export type ScoreBand = {
  name: ScoreBandName;
  text: string;
  bg: string;
};

/**
 * Score-ramp band (plans/07 §2.1): 0–2.9 terrible, 3–4.9 poor, 5–6.4 mixed,
 * 6.5–7.9 good, 8–10 excellent. Never interpolate — pick the band.
 */
export function scoreBand(score: number): ScoreBand {
  if (score < 3)
    return { name: "terrible", text: "text-score-terrible", bg: "bg-score-terrible-bg" };
  if (score < 5)
    return { name: "poor", text: "text-score-poor", bg: "bg-score-poor-bg" };
  if (score < 6.5)
    return { name: "mixed", text: "text-score-mixed", bg: "bg-score-mixed-bg" };
  if (score < 8)
    return { name: "good", text: "text-score-good", bg: "bg-score-good-bg" };
  return { name: "excellent", text: "text-score-excellent", bg: "bg-score-excellent-bg" };
}
