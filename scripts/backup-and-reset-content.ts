/**
 * Dated backup of the live SQLite file, then a clean-slate DB that keeps
 * Discord users (and app_settings). Official presets are not copied.
 *
 * Usage (prod host, app stopped):
 *   DATABASE_PATH=/root/mims/AI-Judge/data/ai-judge.sqlite npx tsx scripts/backup-and-reset-content.ts
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

async function main(): Promise<void> {
  const dbPath = process.env.DATABASE_PATH ?? "./data/ai-judge.sqlite";
  const abs = path.resolve(dbPath);
  if (!fs.existsSync(abs)) {
    console.error(`No database at ${abs}`);
    process.exit(1);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const backup = path.join(path.dirname(abs), `ai-judge.backup-${stamp}.sqlite`);
  fs.copyFileSync(abs, backup);
  console.log(`Backup: ${backup}`);

  const src = new Database(backup, { readonly: true });
  const users = src.prepare(`SELECT * FROM users`).all() as Record<
    string,
    unknown
  >[];
  let settings: Record<string, unknown>[] = [];
  try {
    settings = src.prepare(`SELECT * FROM app_settings`).all() as Record<
      string,
      unknown
    >[];
  } catch {
    settings = [];
  }
  src.close();

  fs.unlinkSync(abs);
  for (const suffix of ["-wal", "-shm"]) {
    const extra = abs + suffix;
    if (fs.existsSync(extra)) fs.unlinkSync(extra);
  }

  process.env.AI_JUDGE_DROP_OFFICIAL = "1";
  const { getDb, prepare } = await import("@/lib/db");
  const db = getDb();

  const userCols = users[0] ? Object.keys(users[0]) : [];
  if (userCols.length > 0) {
    const placeholders = userCols.map((c) => `@${c}`).join(", ");
    const ins = db.prepare(
      `INSERT OR REPLACE INTO users (${userCols.join(", ")}) VALUES (${placeholders})`,
    );
    for (const row of users) ins.run(row);
  }

  if (settings.length > 0) {
    const cols = Object.keys(settings[0]!);
    const placeholders = cols.map((c) => `@${c}`).join(", ");
    const ins = db.prepare(
      `INSERT OR REPLACE INTO app_settings (${cols.join(", ")}) VALUES (${placeholders})`,
    );
    for (const row of settings) ins.run(row);
  }

  const leftover = prepare(
    `SELECT COUNT(*) AS n FROM bundles WHERE origin = 'official'`,
  ).get() as { n: number };
  console.log(
    `Reset complete. Users restored: ${users.length}. Official bundles left: ${leftover.n}.`,
  );
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
