"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CATEGORY_ORDER, type Category, type RunSnapshot } from "@/lib/schemas";
import { isTerminal } from "@/lib/client/runStore";
import { RunStoreProvider, useRunStore } from "@/lib/client/useRunStream";
import { ArenaGrid } from "@/components/arena/ArenaGrid";
import { CellDrawer } from "@/components/arena/CellDrawer";
import { RunHeader } from "@/components/arena/RunHeader";
import { RunReport } from "@/components/report/RunReport";
import { Tabs } from "@/components/ui/Tabs";

function parseCellParam(raw: string | null): {
  candidate: string | null;
  category: Category | null;
  trial: number | null;
} {
  if (!raw) return { candidate: null, category: null, trial: null };
  const parts = raw.split(":");
  const candidate = parts[0] || null;
  const category = (parts[1] as Category | undefined) ?? null;
  const trial =
    parts[2] != null && parts[2] !== "" && !Number.isNaN(Number(parts[2]))
      ? Number(parts[2])
      : null;
  if (!candidate || !category || !CATEGORY_ORDER.includes(category)) {
    return { candidate: null, category: null, trial: null };
  }
  return { candidate, category, trial };
}

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

  const cellParam = searchParams.get("cell");
  const view = searchParams.get("view") === "report" ? "report" : "arena";
  const { candidate, category, trial } = useMemo(
    () => parseCellParam(cellParam),
    [cellParam],
  );

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

  const openCell = (cand: string, cat: Category) => {
    setParams((p) => {
      p.set("cell", `${cand}:${cat}`);
      p.delete("view");
    });
  };

  const closeCell = () => {
    setParams((p) => {
      p.delete("cell");
    });
  };

  const setTrial = (t: number) => {
    if (!candidate || !category) return;
    setParams((p) => {
      p.set("cell", `${candidate}:${category}:${t}`);
    });
  };

  const eligibilityBanner =
    status === "cancelled"
      ? "This run is not leaderboard-eligible: cancelled before completion."
      : status === "incomplete"
        ? notice?.code === "BUDGET_CAP_REACHED"
          ? "This run is not leaderboard-eligible: incomplete — budget cap reached."
          : "This run is not leaderboard-eligible: incomplete — infrastructure failures or budget cap."
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
        <ArenaGrid onOpenCell={openCell} />
      )}

      <CellDrawer
        candidateModelId={candidate}
        category={category}
        trialFromUrl={trial}
        onClose={closeCell}
        onTrialChange={setTrial}
      />
    </div>
  );
}

/** Client root: RunStore provider + header/grid/drawer (plans/09 §2). */
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
