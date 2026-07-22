/**
 * Next.js server boot hook — fail-fast env validation only.
 *
 * SQLite (better-sqlite3) is intentionally NOT opened here: Next's instrumentation
 * bundler still traces native addons even behind runtime guards. The DB singleton
 * opens lazily on the first server call to getDb() (API routes / engine).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("@/lib/env");
  getEnv();
}
