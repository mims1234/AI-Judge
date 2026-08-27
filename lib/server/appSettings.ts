import { getDb, prepare } from "@/lib/db";
import { isEnvApiKeyFallbackAllowed } from "@/lib/env";
import { DEFAULT_APP_SETTINGS, AppSettingsSchema, type AppSettings } from "@/lib/settings";

/**
 * Server-only settings persistence (app_settings single-row table) and
 * operator facts for the /settings page. Frontend-owned (plans/08 §4).
 */

export function getAppSettings(): AppSettings {
  const row = prepare(`SELECT settings_json FROM app_settings WHERE id = 1`).get() as
    | { settings_json: string }
    | undefined;
  if (!row) {
    return { ...DEFAULT_APP_SETTINGS };
  }
  try {
    const parsed = AppSettingsSchema.safeParse(JSON.parse(row.settings_json));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_APP_SETTINGS };
}

export function saveAppSettings(settings: AppSettings): AppSettings {
  const db = getDb();
  db.prepare(
    `INSERT INTO app_settings (id, settings_json, updated_at)
     VALUES (1, @json, @now)
     ON CONFLICT(id) DO UPDATE SET settings_json = @json, updated_at = @now`,
  ).run({ json: JSON.stringify(settings), now: Date.now() });
  return settings;
}

export type KeyStatusInfo = {
  /** Env key is present and usable (dev mode only). */
  serverConfigured: boolean;
  /** True when AI_JUDGE_MODE=dev (or unset under non-prod NODE_ENV). */
  envFallbackAllowed: boolean;
};

/**
 * Whether a server env key can be used as a fallback.
 * Never includes key material — last-4 / paths must not reach the browser.
 */
export function getKeyStatusInfo(): KeyStatusInfo {
  const envFallbackAllowed = isEnvApiKeyFallbackAllowed();
  const key = process.env.OPENROUTER_API_KEY ?? "";
  const configured = envFallbackAllowed && key.trim().length > 0;
  return {
    serverConfigured: configured,
    envFallbackAllowed,
  };
}

export type DbStats = {
  modelsCount: number;
  modelsFetchedAt: string | null; // ISO
};

/** Public-safe catalog facts only — never filesystem paths, size, or journal mode. */
export function getDbStats(): DbStats {
  const models = prepare(
    `SELECT COUNT(*) AS n, MAX(fetched_at) AS max_at FROM models_cache`,
  ).get() as { n: number; max_at: number | null };

  return {
    modelsCount: models.n,
    modelsFetchedAt: models.max_at ? new Date(models.max_at).toISOString() : null,
  };
}
