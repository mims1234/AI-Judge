/** Shared chat session error encoding (mirrors bundle task_results.error). */

export type ChatSessionErrorKind = "infra_failure" | "judging_failure";

export type ChatSessionError = {
  kind: ChatSessionErrorKind;
  message: string;
};

/** Persist the same `{ kind, message }` shape as bundle task_results.error. */
export function encodeChatSessionError(
  kind: ChatSessionErrorKind,
  message: string,
): string {
  return JSON.stringify({ kind, message });
}

/** Parse structured chat session errors; plain strings → judging_failure. */
export function parseChatSessionError(
  error: string | null,
): ChatSessionError | null {
  if (!error) return null;
  try {
    const obj = JSON.parse(error) as { kind?: unknown; message?: unknown };
    if (
      (obj.kind === "infra_failure" || obj.kind === "judging_failure") &&
      typeof obj.message === "string"
    ) {
      return { kind: obj.kind, message: obj.message };
    }
  } catch {
    /* legacy plain-text errors */
  }
  return { kind: "judging_failure", message: error };
}
