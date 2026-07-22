import { prepare } from "@/lib/db";

/**
 * Server-only catalog extras: description / supported parameters live in the
 * models_cache raw_json blob (plans/08 §2.3). Read per model for the drawer.
 */

export type ModelExtras = {
  description: string | null;
  supportedParameters: string[];
};

export function getModelExtras(modelId: string): ModelExtras | null {
  const row = prepare(`SELECT raw_json FROM models_cache WHERE openrouter_id = ?`).get(
    modelId,
  ) as { raw_json: string } | undefined;
  if (!row) return null;
  try {
    const raw = JSON.parse(row.raw_json) as {
      description?: unknown;
      supported_parameters?: unknown;
    };
    return {
      description: typeof raw.description === "string" ? raw.description : null,
      supportedParameters: Array.isArray(raw.supported_parameters)
        ? raw.supported_parameters.filter((p): p is string => typeof p === "string")
        : [],
    };
  } catch {
    return { description: null, supportedParameters: [] };
  }
}
