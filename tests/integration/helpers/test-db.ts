import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetChatEngineForTests } from "@/lib/chat-engine";
import { closeDb, getDb, migrate } from "@/lib/db";
import { resetEnvCache } from "@/lib/env";
import { resetRunEngineForTests } from "@/lib/run-engine";
import { setTestSession } from "@/lib/server/session";
import { resetTrafficLimiterForTests } from "@/lib/server/traffic";

export type TestDb = {
  path: string;
  dir: string;
  db: ReturnType<typeof getDb>;
  cleanup: () => void;
};

/**
 * Temp SQLite + migrations (plans/11 §2 harness).
 * Never touches ./data/ai-judge.sqlite.
 */
export function createTestDb(prefix = "ai-judge-test-"): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, "test.sqlite");

  closeDb();
  resetRunEngineForTests();
  resetChatEngineForTests();
  setTestSession(null);
  process.env.DATABASE_PATH = dbPath;
  process.env.OPENROUTER_API_KEY ??= "test-key";
  resetEnvCache();

  const db = getDb();
  migrate();

  return {
    path: dbPath,
    dir,
    db,
    cleanup: () => {
      try {
        closeDb();
      } catch {
        /* ignore */
      }
      resetRunEngineForTests();
      resetChatEngineForTests();
      setTestSession(null);
      resetTrafficLimiterForTests();
      resetEnvCache();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Windows file lock race — best effort */
      }
    },
  };
}
