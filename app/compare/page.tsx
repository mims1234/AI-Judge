import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
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
  demoLeaderboardRows,
  demoRunStats,
  demoSameTaskAnswers,
} from "@/lib/mocks/demoAnalytics";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import type { LeaderboardRow } from "@/lib/scoring";
import {
  getLeaderboardData,
  getModelRunStats,
  getModelsWithCompleteRuns,
  getSameTaskAnswers,
  type ModelRunStats,
  type SameTaskAnswer,
} from "@/lib/server/analytics";
import { getDefaultBundle, listBundles } from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  bundle?: string;
  models?: string;
  demo?: string;
  category?: string;
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
  const initialCategory: Category =
    sp.category && (CATEGORY_ORDER as string[]).includes(sp.category)
      ? (sp.category as Category)
      : "coding";

  const bundles = listBundles().filter((b) => b.status === "published");
  const fallback = getDefaultBundle();
  const bundleSlug =
    sp.bundle || fallback?.slug || bundles[0]?.slug || DEMO_BUNDLE_SLUG;

  const controlBundles =
    bundles.length > 0
      ? bundles
      : [
          {
            id: "demo",
            name: "Mini Benchmark",
            version: "v1",
            slug: DEMO_BUNDLE_SLUG,
            content_hash: "",
            status: "published" as const,
            changelog: "",
            created_at: Date.now(),
          },
        ];

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
      category_medians: Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])),
      category_detail: {},
    };
  });

  const stats: Record<string, ModelRunStats> = {};
  for (const id of modelIds) {
    stats[id] = isDemo ? demoRunStats(id) : getModelRunStats(bundleSlug, id);
  }

  const answersByCategory: Partial<Record<Category, SameTaskAnswer[]>> = {};
  if (modelIds.length > 0) {
    for (const cat of CATEGORY_ORDER) {
      answersByCategory[cat] = isDemo
        ? demoSameTaskAnswers(modelIds, cat)
        : getSameTaskAnswers(bundleSlug, modelIds, cat);
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
          title="Pick up to 4 models with at least one complete run"
          body="Comparison needs completed bundle runs so every column shares the same prompts."
          action={
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/compare?bundle=${encodeURIComponent(bundleSlug)}&models=${encodeURIComponent(
                  (isDemo ? demoLeaderboardRows() : allRows)
                    .slice(0, 2)
                    .map((r) => r.model_id)
                    .join(","),
                )}${isDemo ? "&demo=1" : allRows.length === 0 ? "&demo=1" : ""}`}
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
            initialCategory={initialCategory}
            answersByCategory={answersByCategory}
          />
          <ReliabilityEconomics rows={selectedRows} stats={stats} />
        </>
      )}
    </div>
  );
}
