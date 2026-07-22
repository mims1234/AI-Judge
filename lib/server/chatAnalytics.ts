import { isoFromMs } from "@/lib/api-helpers";
import { parseChatSessionError } from "@/lib/chat-errors";
import { prepare } from "@/lib/db";
import { median } from "@/lib/scoring";
import {
  CHAT_CATEGORY_ORDER,
  type ChatCategory,
  type ChatSessionSnapshot,
  type ChatSessionStatus,
  type ParseStatus,
  type Verdict,
} from "@/lib/schemas";

/**
 * Chat playground read models (plans/16 §B4): session snapshot for the
 * playground page and the dedicated chat leaderboard aggregation.
 */

export function getChatSessionSnapshot(id: string): ChatSessionSnapshot | null {
  const session = prepare(`SELECT * FROM chat_sessions WHERE id = ?`).get(id) as
    | {
        id: string;
        candidate_model_id: string;
        judge_pool_json: string;
        status: ChatSessionStatus;
        category: ChatCategory | null;
        median_score: number | null;
        disagreement: number | null;
        judging_rounds: number;
        total_cost_usd: number;
        error: string | null;
        last_event_id: number;
        created_at: number;
        finished_at: number | null;
      }
    | undefined;
  if (!session) return null;

  const messages = (
    prepare(
      `SELECT id, role, content, prompt_tokens, completion_tokens, cost_usd, latency_ms, created_at
       FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`,
    ).all(id) as Array<{
      id: string;
      role: "user" | "assistant";
      content: string;
      prompt_tokens: number | null;
      completion_tokens: number | null;
      cost_usd: number | null;
      latency_ms: number | null;
      created_at: number;
    }>
  ).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    tokens:
      m.prompt_tokens != null
        ? { prompt: m.prompt_tokens, completion: m.completion_tokens ?? 0 }
        : null,
    cost_usd: m.cost_usd,
    latency_ms: m.latency_ms,
    created_at: isoFromMs(m.created_at)!,
  }));

  // Latest judging round only — earlier rounds stay in the DB for audit.
  const judgments =
    session.judging_rounds > 0
      ? (
          prepare(
            `SELECT * FROM chat_judgments
             WHERE session_id = ? AND round = ? ORDER BY judge_model_id ASC`,
          ).all(id, session.judging_rounds) as Array<{
            judge_model_id: string;
            round: number;
            predicted_category: ChatCategory | null;
            category_confidence: number | null;
            category_rationale: string | null;
            parsed_json: string | null;
            parse_status: ParseStatus;
            score_correctness: number | null;
            score_compliance: number | null;
            score_quality: number | null;
            score_honesty: number | null;
            claimed_overall: number | null;
            server_overall: number | null;
            verdict: Verdict | null;
            cost_usd: number | null;
            latency_ms: number | null;
          }>
        ).map((j) => {
          let feedback: Record<string, unknown> | null = null;
          if (typeof j.parsed_json === "string") {
            try {
              feedback = JSON.parse(j.parsed_json) as Record<string, unknown>;
            } catch {
              feedback = null;
            }
          }
          const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
          return {
            judge_model_id: j.judge_model_id,
            round: j.round,
            predicted_category: j.predicted_category,
            category_confidence: j.category_confidence,
            category_rationale: j.category_rationale,
            parse_status: j.parse_status,
            scores:
              j.score_correctness != null
                ? {
                    correctness: j.score_correctness,
                    requirement_compliance: j.score_compliance!,
                    quality: j.score_quality!,
                    honesty: j.score_honesty!,
                  }
                : null,
            claimed_overall: j.claimed_overall,
            server_overall: j.server_overall,
            verdict: j.verdict,
            feedback: feedback
              ? {
                  what_was_good: arr(feedback.what_was_good),
                  what_was_terrible: arr(feedback.what_was_terrible),
                  what_was_missing: arr(feedback.what_was_missing),
                  constraint_violations: arr(feedback.constraint_violations),
                  critical_errors: arr(feedback.critical_errors),
                  specific_evidence: arr(feedback.specific_evidence),
                  one_best_improvement:
                    typeof feedback.one_best_improvement === "string"
                      ? feedback.one_best_improvement
                      : "",
                }
              : null,
            cost_usd: j.cost_usd,
            latency_ms: j.latency_ms,
          };
        })
      : [];

  return {
    session: {
      id: session.id,
      candidate_model_id: session.candidate_model_id,
      judge_pool: JSON.parse(session.judge_pool_json) as string[],
      status: session.status,
      category: session.category,
      median_score: session.median_score,
      disagreement: session.disagreement,
      judging_rounds: session.judging_rounds,
      total_cost_usd: session.total_cost_usd,
      error: parseChatSessionError(session.error),
      created_at: isoFromMs(session.created_at)!,
      finished_at: isoFromMs(session.finished_at),
      last_event_id: session.last_event_id,
    },
    messages,
    judgments,
  };
}

/* ---------------- Recent sessions (replay / audit) ---------------- */

export type RecentChatSession = {
  id: string;
  candidate_model_id: string;
  status: ChatSessionStatus;
  category: ChatCategory | null;
  median_score: number | null;
  disagreement: number | null;
  judging_rounds: number;
  total_cost_usd: number;
  created_at: string;
  finished_at: string | null;
};

/** Newest sessions first — used to reopen chats and inspect rankings. */
export function listRecentChatSessions(opts?: {
  limit?: number;
  modelId?: string;
}): RecentChatSession[] {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 100);
  const rows = (
    opts?.modelId
      ? prepare(
          `SELECT id, candidate_model_id, status, category, median_score,
                  disagreement, judging_rounds, total_cost_usd, created_at, finished_at
           FROM chat_sessions
           WHERE candidate_model_id = ?
           ORDER BY COALESCE(finished_at, created_at) DESC
           LIMIT ?`,
        ).all(opts.modelId, limit)
      : prepare(
          `SELECT id, candidate_model_id, status, category, median_score,
                  disagreement, judging_rounds, total_cost_usd, created_at, finished_at
           FROM chat_sessions
           ORDER BY COALESCE(finished_at, created_at) DESC
           LIMIT ?`,
        ).all(limit)
  ) as Array<{
    id: string;
    candidate_model_id: string;
    status: ChatSessionStatus;
    category: ChatCategory | null;
    median_score: number | null;
    disagreement: number | null;
    judging_rounds: number;
    total_cost_usd: number;
    created_at: number;
    finished_at: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    candidate_model_id: r.candidate_model_id,
    status: r.status,
    category: r.category,
    median_score: r.median_score,
    disagreement: r.disagreement,
    judging_rounds: r.judging_rounds,
    total_cost_usd: r.total_cost_usd,
    created_at: isoFromMs(r.created_at)!,
    finished_at: isoFromMs(r.finished_at),
  }));
}

/* ---------------- Leaderboard ---------------- */

export type ChatLeaderboardRow = {
  rank: number;
  model_id: string;
  score: number;
  provisional: boolean;
  judged_sessions: number;
  /** Share of attempts that produced a real judge score (not penalty/exclusion). */
  coverage: number;
  /** Infra-failure sessions counted as score 0. */
  penalized_sessions: number;
  /** Judging-failure sessions excluded (not scored against the model). */
  excluded_sessions: number;
  disagreement_mean: number;
  verdict_distribution: { pass: number; partial_pass: number; fail: number };
  avg_cost_usd_per_session: number;
  avg_latency_ms: number;
  last_evaluated_at: string | null;
  category_medians: Partial<Record<ChatCategory, number>>;
};

export function queryChatLeaderboard(category?: ChatCategory): {
  category: ChatCategory | null;
  rows: ChatLeaderboardRow[];
} {
  // Scored sessions: successful panels + infra penalties (median 0).
  // Judging failures with no prior score stay status=error and are excluded.
  const sessions = (
    category
      ? prepare(
          `SELECT id, candidate_model_id, category, median_score, disagreement,
                  total_cost_usd, judging_rounds, finished_at, error
           FROM chat_sessions
           WHERE status = 'judged' AND median_score IS NOT NULL AND category = ?
           ORDER BY finished_at ASC`,
        ).all(category)
      : prepare(
          `SELECT id, candidate_model_id, category, median_score, disagreement,
                  total_cost_usd, judging_rounds, finished_at, error
           FROM chat_sessions
           WHERE status = 'judged' AND median_score IS NOT NULL
           ORDER BY finished_at ASC`,
        ).all()
  ) as Array<{
    id: string;
    candidate_model_id: string;
    category: ChatCategory | null;
    median_score: number;
    disagreement: number | null;
    total_cost_usd: number;
    judging_rounds: number;
    finished_at: number | null;
    error: string | null;
  }>;

  // Terminal judging failures that never produced a score (coverage gaps).
  const excludedRows = (
    category
      ? prepare(
          `SELECT candidate_model_id, error
           FROM chat_sessions
           WHERE status = 'error' AND median_score IS NULL AND category = ?`,
        ).all(category)
      : prepare(
          `SELECT candidate_model_id, error
           FROM chat_sessions
           WHERE status = 'error' AND median_score IS NULL`,
        ).all()
  ) as Array<{ candidate_model_id: string; error: string | null }>;

  const excludedByModel = new Map<string, number>();
  for (const row of excludedRows) {
    const parsed = parseChatSessionError(row.error);
    if (parsed?.kind === "judging_failure") {
      excludedByModel.set(
        row.candidate_model_id,
        (excludedByModel.get(row.candidate_model_id) ?? 0) + 1,
      );
    }
  }

  const byModel = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const list = byModel.get(s.candidate_model_id) ?? [];
    list.push(s);
    byModel.set(s.candidate_model_id, list);
  }
  // Models that only have excluded failures still appear with empty score lists? No —
  // bundle only shows models with overall_score. Keep same: scored sessions only.
  // But still surface excluded counts on models that do have scores.

  // Per-category medians are computed across ALL judged sessions of the model,
  // independent of the active filter (mirrors queryLeaderboard §3c).
  const allJudged = prepare(
    `SELECT candidate_model_id, category, median_score
     FROM chat_sessions
     WHERE status = 'judged' AND median_score IS NOT NULL AND category IS NOT NULL`,
  ).all() as Array<{
    candidate_model_id: string;
    category: ChatCategory;
    median_score: number;
  }>;
  const catMediansByModel = new Map<string, Map<ChatCategory, number[]>>();
  for (const row of allJudged) {
    let m = catMediansByModel.get(row.candidate_model_id);
    if (!m) {
      m = new Map();
      catMediansByModel.set(row.candidate_model_id, m);
    }
    const list = m.get(row.category) ?? [];
    list.push(row.median_score);
    m.set(row.category, list);
  }

  const rows: ChatLeaderboardRow[] = [];
  for (const [modelId, list] of byModel) {
    const medians = list.map((s) => s.median_score);
    const sessionIds = list.map((s) => s.id);
    const placeholders = sessionIds.map(() => "?").join(",");

    const penalized_sessions = list.filter((s) => {
      const parsed = parseChatSessionError(s.error);
      return parsed?.kind === "infra_failure";
    }).length;
    const scored_sessions = list.length - penalized_sessions;
    const excluded_sessions = excludedByModel.get(modelId) ?? 0;
    const attemptTotal = list.length + excluded_sessions;
    const coverage = attemptTotal > 0 ? scored_sessions / attemptTotal : 1;

    const verdictRows = prepare(
      `SELECT cj.verdict AS verdict, COUNT(*) AS n
       FROM chat_judgments cj
       JOIN chat_sessions cs ON cs.id = cj.session_id AND cs.judging_rounds = cj.round
       WHERE cj.session_id IN (${placeholders}) AND cj.verdict IS NOT NULL
       GROUP BY cj.verdict`,
    ).all(...sessionIds) as Array<{ verdict: Verdict; n: number }>;
    const verdictTotal = verdictRows.reduce((sum, r) => sum + r.n, 0);
    const verdictOf = (v: Verdict) =>
      verdictTotal > 0
        ? (verdictRows.find((r) => r.verdict === v)?.n ?? 0) / verdictTotal
        : 0;

    const latency = prepare(
      `SELECT AVG(latency_ms) AS l FROM chat_messages
       WHERE session_id IN (${placeholders}) AND role = 'assistant' AND latency_ms IS NOT NULL`,
    ).get(...sessionIds) as { l: number | null };

    const catMedians: Partial<Record<ChatCategory, number>> = {};
    const modelCats = catMediansByModel.get(modelId);
    for (const cat of CHAT_CATEGORY_ORDER) {
      const values = modelCats?.get(cat);
      if (values && values.length > 0) catMedians[cat] = median(values);
    }

    const disagreements = list
      .map((s) => s.disagreement)
      .filter((d): d is number => d != null);
    const lastFinished = list.reduce<number | null>(
      (acc, s) => (s.finished_at != null && (acc == null || s.finished_at > acc) ? s.finished_at : acc),
      null,
    );

    rows.push({
      rank: 0,
      model_id: modelId,
      score: median(medians),
      provisional: list.length < 3,
      judged_sessions: list.length,
      coverage,
      penalized_sessions,
      excluded_sessions,
      disagreement_mean:
        disagreements.length > 0
          ? disagreements.reduce((a, b) => a + b, 0) / disagreements.length
          : 0,
      verdict_distribution: {
        pass: verdictOf("pass"),
        partial_pass: verdictOf("partial_pass"),
        fail: verdictOf("fail"),
      },
      avg_cost_usd_per_session:
        list.reduce((sum, s) => sum + s.total_cost_usd, 0) / list.length,
      avg_latency_ms: latency.l ?? 0,
      last_evaluated_at: isoFromMs(lastFinished),
      category_medians: catMedians,
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.judged_sessions !== a.judged_sessions) {
      return b.judged_sessions - a.judged_sessions;
    }
    return a.model_id.localeCompare(b.model_id);
  });
  rows.forEach((row, i) => {
    row.rank = i + 1;
  });

  return { category: category ?? null, rows };
}
