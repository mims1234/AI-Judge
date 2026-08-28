import { prepare } from "@/lib/db";

/**
 * A custom run is an instrument wipeout when at least one candidate task was
 * attempted and every candidate with validator results has zero passing
 * `custom_answer_schema` findings. Infra/judging failures without validators
 * are ignored (not counted as schema failures).
 */
export function isInstrumentWipeout(runId: string): boolean {
  const attempted = prepare(
    `SELECT COUNT(*) AS n FROM task_results
     WHERE run_id = ? AND status IN ('scored', 'error')`,
  ).get(runId) as { n: number };
  if (attempted.n < 1) return false;

  const attemptedIds = new Set(
    (
      prepare(
        `SELECT DISTINCT candidate_model_id AS id FROM task_results
         WHERE run_id = ? AND status IN ('scored', 'error')`,
      ).all(runId) as Array<{ id: string }>
    ).map((r) => r.id),
  );

  const rows = prepare(
    `SELECT tr.candidate_model_id AS id,
            SUM(CASE WHEN vr.passed = 1 THEN 1 ELSE 0 END) AS passed
     FROM validator_results vr
     JOIN task_results tr ON tr.id = vr.task_result_id
     WHERE tr.run_id = ?
       AND vr.validator = 'custom_answer_schema'
     GROUP BY tr.candidate_model_id`,
  ).all(runId) as Array<{ id: string; passed: number }>;

  const withValidators = rows.filter((r) => attemptedIds.has(r.id));
  if (withValidators.length === 0) return false;
  return withValidators.every((r) => r.passed === 0);
}
