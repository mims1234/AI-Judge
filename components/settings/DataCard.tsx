"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import { Button } from "@/components/ui/Button";

export type DataCardStats = {
  path: string;
  sizeBytes: number | null;
  walMode: boolean;
  modelsCount: number;
  modelsFetchedAt: string | null;
};

/** Read-only operator facts + models-cache refresh (plans/08 §4.2). */
export function DataCard({ stats }: { stats: DataCardStats }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/models?refresh=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      // Cache refresh is best-effort; the models page surfaces detail.
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section aria-labelledby="data-heading" className="rounded-md border border-line-subtle bg-ink-900 p-5">
      <h2 id="data-heading" className="text-xs uppercase tracking-wide text-dim">
        Data
      </h2>

      <dl className="mt-3 flex flex-col gap-2.5 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-dim">Database</dt>
          <dd className="font-mono text-xs text-body">
            {stats.path} · {formatBytes(stats.sizeBytes)} · {stats.walMode ? "WAL" : "journal"}
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <dt className="text-dim">Models cache</dt>
          <dd className="flex items-center gap-2 font-mono text-xs text-body">
            {stats.modelsCount} models · refreshed {formatRelativeTime(stats.modelsFetchedAt)}
            <Button variant="ghost" size="sm" onClick={refresh} loading={refreshing} aria-label="Refresh models cache">
              ↻
            </Button>
          </dd>
        </div>
      </dl>
    </section>
  );
}
