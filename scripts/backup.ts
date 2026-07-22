import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadEnvLocal } from "./env";

loadEnvLocal();

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function main(): Promise<void> {
  const dbPath =
    process.env.DATABASE_PATH && process.env.DATABASE_PATH.length > 0
      ? process.env.DATABASE_PATH
      : "./data/ai-judge.sqlite";
  const resolved = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Database not found at ${resolved}. Run npm run db:migrate (or npm run dev) first.`,
    );
  }

  const backupDir = path.join(path.dirname(resolved), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const dest = path.join(backupDir, `ai-judge-${stamp()}.sqlite`);

  const db = new Database(resolved, { readonly: true, fileMustExist: true });
  try {
    await db.backup(dest);
  } finally {
    db.close();
  }

  const size = fs.statSync(dest).size;
  console.log(`Backup written: ${dest}`);
  console.log(`Size: ${(size / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
