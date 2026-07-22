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

/**
 * Parse ?cell= — OpenRouter ids may contain ":" (e.g. cohere/foo:free),
 * so category/trial are taken from the right, not by a naive split.
 * Formats: `<candidate>:<category>` | `<candidate>:<category>:<trialIndex>`
 */
function parseCellParam(raw: string | null): {
  candidate: string | null;
  category: Category | null;
  trial: number | null;
} {
  const empty = { candidate: null, category: null, trial: null };
  if (!raw) return empty;
  const parts = raw.split(":");
  if (parts.length < 2) return empty;

  // `<candidate>:<category>:<trial>` — trial is a non-negative integer suffix
  if (parts.length >= 3) {
    const trialRaw = parts[parts.length - 1]!;
    const categoryRaw = parts[parts.length - 2]!;
    if (
      /^\d+$/.test(trialRaw) &&
      CATEGORY_ORDER.includes(categoryRaw as Category)
    ) {
      const candidate = parts.slice(0, -2).join(":");
      if (!candidate) return empty;
      return {
        candidate,
        category: categoryRaw as Category,
        trial: Number(trialRaw),
      };
    }
  }

  // `<candidate>:<category>` — category is a known enum at the end
  const categoryRaw = parts[parts.length - 1]!;
  if (!CATEGORY_ORDER.includes(categoryRaw as Category)) return empty;
  const candidate = parts.slice(0, -1).join(":");
  if (!candidate) return empty;
  return { candidate, category: categoryRaw as Category, trial: null };
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
