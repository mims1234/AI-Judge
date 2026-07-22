"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildCellHref } from "@/lib/cellRef";
import type { Category, RunSnapshot } from "@/lib/schemas";
import { isTerminal } from "@/lib/client/runStore";
import { RunStoreProvider, useRunStore } from "@/lib/client/useRunStream";
import { ArenaGrid } from "@/components/arena/ArenaGrid";
import { RunHeader } from "@/components/arena/RunHeader";
import { RunReport } from "@/components/report/RunReport";
import { Tabs } from "@/components/ui/Tabs";

function WorkbenchInner({
  runId,
  initialSnapshot,
}: {
  runId: string;
  initialSnapshot: RunSnapshot;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = useRunStore((s) => s.run.status);
  const notice = useRunStore((s) => s.run.notice);
  const terminal = isTerminal(status);
  const [reportSnapshot, setReportSnapshot] = useState(initialSnapshot);

  const view = searchParams.get("view") === "report" ? "report" : "arena";

  useEffect(() => {
    if (view !== "report" || !terminal) return;
    let cancelled = false;
    fetch(`/api/runs/${encodeURIComponent(runId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: RunSnapshot | null) => {
        if (!cancelled && data) setReportSnapshot(data);
      })
      .catch(() => {
        /* keep initial */
      });
    return () => {
      cancelled = true;
    };
  }, [view, terminal, runId]);

  const setParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(searchParams.toString());
      mutate(p);
      const qs = p.toString();
      router.replace(qs ? `/runs/${runId}?${qs}` : `/runs/${runId}`, {
        scroll: false,
      });
    },
    [router, runId, searchParams],
  );

  // Report matrix cells deep-link into the cell detail page (plans/15 §A1).
  const openCell = (cand: string, cat: Category) => {
    router.push(buildCellHref(runId, cand, cat));
  };

  const eligibilityBanner =
    status === "cancelled"
      ? "This run is not leaderboard-eligible: cancelled before completion."
      : status === "incomplete"
        ? notice?.code === "BUDGET_CAP_REACHED"
          ? "Included on the leaderboard with reduced coverage — budget cap reached. Infra failures score 0; judging failures are excluded (not penalized)."
          : "Included on the leaderboard with penalties / reduced coverage. Infra failures score 0 (retry to replace); judging failures are excluded."
        : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-10">
      <RunHeader />

      {eligibilityBanner && (
        <div
          role="status"
          className="rounded-md border border-warn-400/30 bg-warn-900 px-3 py-2 text-sm text-warn-400"
        >
          {eligibilityBanner}
        </div>
      )}

      {terminal && (
        <Tabs
          tabs={[
            { key: "arena", label: "Arena" },
            { key: "report", label: "Report" },
          ]}
          activeKey={view}
          onChange={(key) =>
            setParams((p) => {
              if (key === "report") p.set("view", "report");
              else p.delete("view");
            })
          }
          ariaLabel="Run views"
        />
      )}

      {view === "report" && terminal ? (
        <RunReport
          snapshot={reportSnapshot}
          eligibilityReason={eligibilityBanner}
          onOpenCell={openCell}
        />
      ) : (
        <ArenaGrid />
      )}
    </div>
  );
}

/** Client root: RunStore provider + header/grid (plans/09 §2, plans/15 §A1). */
export function Workbench({
  runId,
  snapshot,
}: {
  runId: string;
  snapshot: RunSnapshot;
}) {
  return (
    <RunStoreProvider runId={runId} initialSnapshot={snapshot}>
      <WorkbenchInner runId={runId} initialSnapshot={snapshot} />
    </RunStoreProvider>
  );
}
