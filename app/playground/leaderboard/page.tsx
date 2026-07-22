import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { RecentSessions } from "@/components/playground/RecentSessions";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { formatPercent, formatScore, formatUsd } from "@/lib/format";
import { CHAT_CATEGORY_ORDER, type ChatCategory } from "@/lib/schemas";
import {
  listRecentChatSessions,
  queryChatLeaderboard,
} from "@/lib/server/chatAnalytics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat leaderboard",
};

type SearchParams = Promise<{ category?: string; model?: string }>;

function parseCategory(raw: string | undefined): ChatCategory | "overall" {
  if (!raw || raw === "overall") return "overall";
  return (CHAT_CATEGORY_ORDER as readonly string[]).includes(raw)
    ? (raw as ChatCategory)
    : "overall";
}

export default async function ChatLeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const sp = await searchParams;
  const category = parseCategory(sp.category);
  const modelFilter = sp.model?.trim() || undefined;
  const data = queryChatLeaderboard(
    category === "overall" ? undefined : category,
  );
  const rows = data.rows;
  const recentSessions = listRecentChatSessions({
    limit: 24,
    modelId: modelFilter,
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8 md:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-teal-300">
            Playground
          </p>
          <h1 className="font-display text-3xl uppercase tracking-[0.06em] text-bright md:text-4xl">
            Chat leaderboard
          </h1>
          <p className="max-w-2xl text-sm text-dim">
            Rankings from judged free-chat sessions. Same fairness rules as
            bundle runs: infra faults score 0, judge faults are excluded (not
            penalized), and prior scores survive a failed re-judge. Provisional
            until a model has three judged sessions.
          </p>
        </div>
        <Link href="/playground" className={buttonClasses({ variant: "secondary" })}>
          Open playground
        </Link>
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Category filter">
        {(["overall", ...CHAT_CATEGORY_ORDER] as const).map((cat) => {
          const active = category === cat;
          const href =
            cat === "overall"
              ? "/playground/leaderboard"
              : `/playground/leaderboard?category=${cat}`;
          return (
            <Link
              key={cat}
              href={href}
              className={
                active
                  ? "rounded-sm bg-teal-900 px-2.5 py-1 text-sm text-teal-300"
                  : "rounded-sm px-2.5 py-1 text-sm text-dim hover:bg-ink-800 hover:text-bright"
              }
            >
              {cat}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title="No judged chats yet."
          body="Start a playground session and run a judging round to populate this board."
          action={
            <Link
              href="/playground"
              className="rounded-md bg-teal-500 px-3 py-2 text-sm text-ink-950"
            >
              Start chatting
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-line-subtle">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line-subtle bg-ink-900 text-xs uppercase tracking-wide text-dim">
              <tr>
                <th className="px-3 py-2.5 font-medium">#</th>
                <th className="px-3 py-2.5 font-medium">Model</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Sessions</th>
                <th className="px-3 py-2.5 font-medium">Coverage</th>
                <th className="px-3 py-2.5 font-medium">Disagreement</th>
                <th className="px-3 py-2.5 font-medium">Avg cost</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.model_id}
                  className="border-b border-line-subtle/70 last:border-0"
                >
                  <td className="px-3 py-2.5 font-mono text-dim">{row.rank}</td>
                  <td className="px-3 py-2.5 font-mono text-body">
                    <Link
                      href={`/playground/leaderboard?model=${encodeURIComponent(row.model_id)}${
                        category !== "overall" ? `&category=${category}` : ""
                      }`}
                      className="text-teal-300 hover:text-teal-200"
                      title="Show this model's sessions"
                    >
                      {row.model_id}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <ScoreBadge score={row.score} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-body">
                    {row.judged_sessions}
                  </td>
                  <td
                    className={
                      row.coverage < 1
                        ? "px-3 py-2.5 font-mono tabular-nums text-warn-400"
                        : "px-3 py-2.5 font-mono tabular-nums text-dim"
                    }
                    title={[
                      "Share of attempts that counted toward the score.",
                      row.penalized_sessions > 0
                        ? `${row.penalized_sessions} penalized (infra → score 0)`
                        : null,
                      row.excluded_sessions > 0
                        ? `${row.excluded_sessions} excluded (judge fault — not penalized)`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  >
                    {formatPercent(row.coverage)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-dim">
                    {formatScore(row.disagreement_mean)}
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-dim">
                    {formatUsd(row.avg_cost_usd_per_session)}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.provisional ? (
                      <Badge tone="warn">provisional</Badge>
                    ) : (
                      <Badge tone="pass">stable</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line-subtle pt-6">
        {modelFilter && (
          <p className="text-sm text-dim">
            Showing sessions for{" "}
            <span className="font-mono text-body">{modelFilter}</span>
            {" · "}
            <Link
              href={
                category === "overall"
                  ? "/playground/leaderboard"
                  : `/playground/leaderboard?category=${category}`
              }
              className="text-teal-300 hover:text-teal-200"
            >
              Clear model filter
            </Link>
          </p>
        )}
        <RecentSessions
          sessions={recentSessions}
          title={
            modelFilter
              ? `Sessions for ${modelFilter}`
              : "Recent judged chats"
          }
          emptyHint="No sessions yet — run a playground chat and judge it, then reopen it here to inspect the transcript and scores."
        />
      </div>
    </div>
  );
}
