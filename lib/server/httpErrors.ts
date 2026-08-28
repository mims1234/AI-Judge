import { NextResponse } from "next/server";
import {
  apiError,
  forbiddenError,
  needsLoginError,
} from "@/lib/api-helpers";
import { AuthRequiredError, ForbiddenError } from "@/lib/server/session";

export function mapThrownApiError(err: unknown): NextResponse {
  if (err instanceof AuthRequiredError) {
    return needsLoginError(err.message);
  }
  if (err instanceof ForbiddenError) {
    return forbiddenError(err.message);
  }
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: string }).code)
      : "";
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (code === "NEEDS_LOGIN") return needsLoginError(message);
  if (code === "FORBIDDEN") return forbiddenError(message);
  if (code === "BUNDLE_NOT_FOUND") {
    return apiError("BUNDLE_NOT_FOUND", 404, message);
  }
  if (code === "RUN_NOT_FOUND") {
    return apiError("RUN_NOT_FOUND", 404, message);
  }
  if (code === "SAFETY_REFUSED") {
    return apiError("SAFETY_REFUSED", 400, message);
  }
  if (code === "VALIDATION_ERROR") {
    return apiError("VALIDATION_ERROR", 400, message);
  }
  console.error("[api]", err);
  return apiError("INTERNAL_ERROR", 500, "Unexpected error");
}
