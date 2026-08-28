/**
 * Dated backup of the live SQLite file, then a clean-slate DB that keeps
 * Discord users (and app_settings). Official presets are not copied.
 *
 * Does not import the Next app (server-only). Safe to re-run: an existing
 * dated backup is never overwritten.
 *
 * Usage (prod host, app stopped):
 *   DATABASE_PATH=/root/mims/AI-Judge/data/ai-judge.sqlite npx tsx scripts/backup-and-reset-content.ts
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const KEEP = new Set(["users", "app_settings", "migrations", "sqlite_sequence"]);

function main(): void {
  const dbPath = process.env.DATABASE_PATH ?? "./data/ai-judge.sqlite";
  const live = path.resolve(dbPath);
  const dir = path.dirname(live);
  const stamp = new Date().toISOString().slice(0, 10);
  const backup = path.join(dir, `ai-judge.backup-${stamp}.sqlite`);

  let source: string;
  if (fs.existsSync(backup)) {
    source = backup;
    console.log(`Using existing backup (not overwritten): ${backup}`);
  } else if (fs.existsSync(live)) {
    fs.copyFileSync(live, backup);
    source = backup;
    console.log(`Backup: ${backup}`);
  } else {
    console.error(`No live DB at ${live} and no backup at ${backup}`);
    process.exit(1);
  }

  const work = `${live}.reset-work`;
  if (fs.existsSync(work)) fs.unlinkSync(work);
  fs.copyFileSync(source, work);

  const db = new Database(work);
  db.pragma("foreign_keys = OFF");
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as Array<{ name: string }>;
  for (const { name } of tables) {
    if (KEEP.has(name)) continue;
    db.exec(`DELETE FROM "${name.replace(/"/g, '""')}"`);
  }
  db.pragma("foreign_keys = ON");

  const users = (
    db.prepare(`SELECT COUNT(*) AS n FROM users`).get() as { n: number }
  ).n;
  let official = 0;
  try {
    official = (
      db.prepare(
        `SELECT COUNT(*) AS n FROM bundles WHERE origin = 'official'`,
      ).get() as { n: number }
    ).n;
  } catch {
    official = 0;
  }
  db.close();

  for (const suffix of ["", "-wal", "-shm"]) {
    const extra = live + suffix;
    if (fs.existsSync(extra)) fs.unlinkSync(extra);
  }
  fs.renameSync(work, live);

  console.log(
    `Reset complete. Users kept: ${users}. Official bundles left: ${official}.`,
  );
}

try {
  main();
} catch (err: unknown) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
