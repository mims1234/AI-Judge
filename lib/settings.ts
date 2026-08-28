import { z } from "zod";

/**
 * Operator run defaults (plans/08 §4.2) — shared by the /settings page, the
 * /api/settings routes, and the run wizard. Frontend-owned contract.
 *
 * timeoutSec is the per-call OpenRouter wait (candidate, judge, playground).
 * 10 minutes is the comfortable default when providers are queued.
 */
export const TIMEOUT_SEC_MIN = 60;
export const TIMEOUT_SEC_MAX = 900;
export const TIMEOUT_SEC_DEFAULT = 600;
/** Stored default before the field was wired to live calls. */
export const LEGACY_UNUSED_TIMEOUT_SEC = 120;

export const AppSettingsSchema = z.object({
  candidateConcurrency: z.number().int().min(1).max(4).default(1),
  judgeConcurrency: z.number().int().min(1).max(3).default(3),
  trials: z.number().int().min(1).max(5).default(1),
  defaultBudgetUsd: z.number().min(0.1).max(100).default(2),
  timeoutSec: z
    .number()
    .int()
    .min(TIMEOUT_SEC_MIN)
    .max(TIMEOUT_SEC_MAX)
    .default(TIMEOUT_SEC_DEFAULT),
  maxRetries: z.number().int().min(0).max(5).default(3),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  candidateConcurrency: 1,
  judgeConcurrency: 3,
  trials: 1,
  defaultBudgetUsd: 2,
  timeoutSec: TIMEOUT_SEC_DEFAULT,
  maxRetries: 3,
};

export function callDeadlineMs(
  timeoutSec: number = TIMEOUT_SEC_DEFAULT,
): number {
  const sec = Number.isFinite(timeoutSec) ? timeoutSec : TIMEOUT_SEC_DEFAULT;
  return (
    Math.min(TIMEOUT_SEC_MAX, Math.max(TIMEOUT_SEC_MIN, Math.round(sec))) *
    1000
  );
}

/** Pass-through — 120s is a valid saved timeout, not rewritten. */
export function coerceAppSettings(settings: AppSettings): AppSettings {
  return settings;
}
