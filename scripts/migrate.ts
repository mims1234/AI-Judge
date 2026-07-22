import { loadEnvLocal } from "./env";
import { closeDb, migrate } from "../lib/db";

loadEnvLocal();

function main(): void {
  // Opening the DB applies any pending migrations (append-only, tracked in `migrations`).
  const result = migrate();
  console.log(`Migrations present: ${result.applied.length}`);
  for (const name of result.applied) {
    console.log(`  - ${name}`);
  }
  console.log("db:migrate complete (idempotent — re-run applies zero new migrations).");
  closeDb();
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
