import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { pageSeo } from "@/lib/seo";
import { CompareChips } from "@/components/compare/CompareChips";
import { CompareOverview } from "@/components/compare/CompareOverview";
import { ReliabilityEconomics } from "@/components/compare/ReliabilityEconomics";
import { SameTaskAnswers } from "@/components/compare/SameTaskAnswers";
import { ScoreMatrix } from "@/components/compare/ScoreMatrix";
import { buttonClasses } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DEMO_BUNDLE_SLUG,
  demoBundleRow,
  demoLeaderboardRows,
  demoRunStats,
  demoSameTaskAnswers,
} from "@/lib/mocks/demoAnalytics";
import { labeledTaskTitles } from "@/lib/bundles/task-labels";
import {
  OFFICIAL_CATEGORY_ORDER,
  presentCategories,
  type Category,
} from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";
import type { CompareTaskOption, SameTaskAnswer } from "@/lib/analytics/types";
import {
  getCompareTasks,
  getLeaderboardData,
  getModelRunStats,
  getModelsWithCompleteRuns,
  getSameTaskAnswers,
  type ModelRunStats,
} from "@/lib/server/analytics";
import { getDefaultBundle, listBundles, withBundleMeta } from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Compare models",
  description:
    "Compare up to four models on the same bundle: score matrix, same-task answers, reliability, and score-per-dollar.",
  path: "/compare",
});

type SearchParams = Promise<{
  bundle?: string;
  models?: string;
  demo?: string;
  category?: string;
  task?: string;
}>;

function parseModels(raw: string | undefined): string[] {
  if (!raw) return [];
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ids)].slice(0, 4);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const sp = await searchParams;
  const isDemo = sp.demo === "1";
  const modelIds = parseModels(sp.models);

  const bundles = listBundles().filter((b) => b.status === "published");
  const fallback = getDefaultBundle();
  const bundleSlug =
    sp.bundle || fallback?.slug || bundles[0]?.slug || DEMO_BUNDLE_SLUG;

  const controlBundles =
    bundles.length > 0
      ? bundles
      : [demoBundleRow()];
  const selected = controlBundles.find((b) => b.slug === bundleSlug);
  const categories = isDemo
    ? [...OFFICIAL_CATEGORY_ORDER]
    : presentCategories(
        selected ? withBundleMeta(selected).availableCategories : [],
      );
  const compareTasks: CompareTaskOption[] = isDemo
    ? labeledTaskTitles(
        OFFICIAL_CATEGORY_ORDER.map((c) => ({ id: `demo-${c}`, category: c })),
      )
    : getCompareTasks(bundleSlug);

  const initialTaskId = (() => {
    if (sp.task && compareTasks.some((t) => t.id === sp.task)) return sp.task;
    if (sp.category) {
      const match = compareTasks.find((t) => t.category === (sp.category as Category));
      if (match) return match.id;
    }
    return compareTasks[0]?.id;
  })();

  let allRows: LeaderboardRow[] = [];
  let eligibleIds: string[] = [];

  if (isDemo) {
    allRows = demoLeaderboardRows();
    eligibleIds = allRows.map((r) => r.model_id);
  } else {
    allRows = getLeaderboardData(bundleSlug)?.rows ?? [];
    eligibleIds = getModelsWithCompleteRuns(bundleSlug);
  }

  const selectedRows: LeaderboardRow[] = modelIds.map((id) => {
    const found = allRows.find((r) => r.model_id === id);
    if (found) return found;
    return {
      rank: 0,
      model_id: id,
      score: 0,
      provisional: true,
      complete_runs: 0,
      disagreement_mean: 0,
      success_rate: 0,
      avg_cost_usd_per_run: 0,
      avg_latency_ms: 0,
      last_evaluated_at: null,
      spread_history: [],
      category_medians: Object.fromEntries(categories.map((c) => [c, 0])),
      category_detail: {},
      coverage: 0,
      penalized_tasks: 0,
      excluded_tasks: 0,
    };
  });

  const stats: Record<string, ModelRunStats> = {};
  for (const id of modelIds) {
    stats[id] = isDemo ? demoRunStats(id) : getModelRunStats(bundleSlug, id);
  }

  const answersByTask: Record<string, SameTaskAnswer[]> = {};
  if (modelIds.length > 0) {
    for (const task of compareTasks) {
      answersByTask[task.id] = isDemo
        ? demoSameTaskAnswers(modelIds, task.category)
        : getSameTaskAnswers(bundleSlug, modelIds, task.id);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Compare
        </h1>
        <p className="text-sm text-dim">
          Side-by-side scores for up to four models on one bundle version.
        </p>
      </header>

      {isDemo && (
        <DemoBanner note="Demo compare — fabricated model answers and scores for exploration." />
      )}

      <CompareChips
        bundleSlug={bundleSlug}
        bundles={controlBundles}
        selectedIds={modelIds}
        eligibleIds={eligibleIds}
        demo={isDemo}
      />

      {modelIds.length === 0 ? (
        <EmptyState
          title="Pick up to 4 models with at least one scored run"
          body="Comparison needs completed bundle runs so every column shares the same prompts."
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href={
                  !isDemo && allRows.length < 2
                    ? `/compare?bundle=${encodeURIComponent(bundleSlug)}&demo=1`
                    : `/compare?bundle=${encodeURIComponent(bundleSlug)}&models=${encodeURIComponent(
                        (isDemo ? demoLeaderboardRows() : allRows)
                          .slice(0, 2)
                          .map((r) => r.model_id)
                          .join(","),
                      )}${isDemo ? "&demo=1" : ""}`
                }
                className={buttonClasses({ variant: "primary" })}
              >
                {allRows.length >= 2 || isDemo
                  ? "Compare top models"
                  : "Explore demo compare"}
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <CompareOverview rows={selectedRows} stats={stats} />
          <ScoreMatrix rows={selectedRows} />
          <SameTaskAnswers
            modelIds={modelIds}
            tasks={compareTasks}
            initialTaskId={initialTaskId}
            answersByTask={answersByTask}
          />
          <ReliabilityEconomics rows={selectedRows} stats={stats} />
        </>
      )}
    </div>
  );
}
