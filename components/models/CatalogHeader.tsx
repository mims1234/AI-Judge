"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiKey";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export type CatalogHeaderProps = {
  count: number;
  fetchedAt: string; // ISO
  source: "cache" | "stale" | "network" | "demo";
};

/** Catalog meta line: count, cache age, refresh button (plans/08 §2.3). */
export function CatalogHeader({ count, fetchedAt, source }: CatalogHeaderProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const res = await apiFetch("/api/models?refresh=1", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch {
      setRefreshFailed(true);
    } finally {
      setRefreshing(false);
    }
  };

  const showStaleBanner = (source === "stale" || refreshFailed) && !bannerDismissed && source !== "demo";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-dim">
          <span className="font-mono tabular-nums text-body">{count}</span> models ·{" "}
          {source === "demo" ? "demo catalog" : `cached ${formatRelativeTime(fetchedAt)}`}
        </span>
        {source === "stale" && <Badge tone="warn">STALE</Badge>}
        <Button
          variant="ghost"
          size="sm"
          loading={refreshing}
          onClick={refresh}
          aria-label="Refresh model catalog"
        >
          ↻ Refresh
        </Button>
      </div>

      {showStaleBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-md border border-warn-400/30 bg-warn-900 px-3 py-2 text-sm text-warn-400"
        >
          <span>Showing cached list — refresh failed or still in progress.</span>
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 rounded-sm px-1.5 py-0.5 text-warn-400 hover:bg-ink-800"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
