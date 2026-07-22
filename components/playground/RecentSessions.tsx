import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { formatUsd } from "@/lib/format";
import type { RecentChatSession } from "@/lib/server/chatAnalytics";

/** List of past playground sessions — open one to inspect transcript + judging. */
export function RecentSessions({
  sessions,
  title = "Recent chats",
  emptyHint = "Judged sessions show up here so you can reopen them and see why they scored the way they did.",
}: {
  sessions: RecentChatSession[];
  title?: string;
  emptyHint?: string;
}) {
  if (sessions.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-bright">{title}</h3>
        <p className="text-sm text-dim">{emptyHint}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium text-bright">{title}</h3>
      <ul className="divide-y divide-line-subtle/70 rounded-md border border-line-subtle">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link
              href={`/playground?session=${encodeURIComponent(s.id)}`}
              className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 hover:bg-ink-900"
            >
              <div className="min-w-0 flex flex-col gap-1">
                <span className="truncate font-mono text-xs text-body">
                  {s.candidate_model_id}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{s.status}</Badge>
                  {s.category && <Badge tone="teal">{s.category}</Badge>}
                  <span className="font-mono text-[11px] text-dim">
                    {formatUsd(s.total_cost_usd)}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                {s.median_score != null ? (
                  <ScoreBadge score={s.median_score} size="sm" />
                ) : (
                  <span className="font-mono text-xs text-dim">—</span>
                )}
                <span className="text-xs text-teal-300">Open →</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
