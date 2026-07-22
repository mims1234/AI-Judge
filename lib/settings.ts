import { z } from "zod";

/**
 * Operator run defaults (plans/08 §4.2) — shared by the /settings page, the
 * /api/settings routes, and the run wizard. Frontend-owned contract.
 */
export const AppSettingsSchema = z.object({
  candidateConcurrency: z.number().int().min(1).max(4).default(1),
  judgeConcurrency: z.number().int().min(1).max(3).default(3),
  trials: z.number().int().min(1).max(5).default(1),
  defaultBudgetUsd: z.number().min(0.1).max(100).default(2),
  timeoutSec: z.number().int().min(30).max(600).default(120),
  maxRetries: z.number().int().min(0).max(5).default(3),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  candidateConcurrency: 1,
  judgeConcurrency: 3,
  trials: 1,
  defaultBudgetUsd: 2,
  timeoutSec: 120,
  maxRetries: 3,
};
