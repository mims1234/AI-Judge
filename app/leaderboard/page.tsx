import type { Metadata } from "next";
import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { pageSeo } from "@/lib/seo";
import { LeaderboardControls } from "@/components/leaderboard/LeaderboardControls";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { buttonClasses } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DEMO_BUNDLE_HASH,
  DEMO_BUNDLE_SLUG,
  demoBundleRow,
  demoLeaderboardRows,
} from "@/lib/mocks/demoAnalytics";
import {
  CATEGORY_ORDER,
  OFFICIAL_CATEGORY_ORDER,
  presentCategories,
  type Category,
} from "@/lib/schemas";
import { getLeaderboardData } from "@/lib/server/analytics";
import { getDefaultBundle, listBundles, withBundleMeta } from "@/lib/server/bundles";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Leaderboard",
  description:
    "Bundle-scoped LLM rankings from scored runs. Median of three blind judges, averaged across tasks, with reliability and cost. Incomplete runs count with penalties; cancelled runs do not.",
  path: "/leaderboard",
});

type SearchParams = Promise<{
  bundle?: string;
  category?: string;
  demo?: string;
}>;

function parseCategory(raw: string | undefined): Category | "overall" {
  if (!raw || raw === "overall") return "overall";
  return (CATEGORY_ORDER as string[]).includes(raw) ? (raw as Category) : "overall";
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const user = await getSessionUser();
  const sp = await searchParams;
  const isDemo = sp.demo === "1";
  const category = parseCategory(sp.category);

  const bundles = listBundles().filter((b) => b.status === "published");
  const fallback = getDefaultBundle();
  const bundleSlug =
    sp.bundle ||
    fallback?.slug ||
    bundles[0]?.slug ||
    DEMO_BUNDLE_SLUG;

  const live = isDemo
    ? null
    : getLeaderboardData(
        bundleSlug,
        category === "overall" ? undefined : category,
      );

  const rows = isDemo
    ? demoLeaderboardRows(category === "overall" ? undefined : category)
    : (live?.rows ?? []);

  const bundleHash = isDemo ? DEMO_BUNDLE_HASH : (live?.bundle_hash ?? "—");

  const allProvisional = rows.length > 0 && rows.every((r) => r.provisional);
  const controlBundles =
    bundles.length > 0
      ? bundles
      : [demoBundleRow()];
  const selectedBundle =
    controlBundles.find((b) => b.slug === bundleSlug) ?? controlBundles[0];
  const filterCategories = isDemo
    ? [...OFFICIAL_CATEGORY_ORDER]
    : presentCategories(
        selectedBundle ? withBundleMeta(selectedBundle).availableCategories : [],
      );

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 md:px-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Leaderboard
        </h1>
        <p className="font-mono text-xs text-dim">
          {bundleSlug}
          <span className="mx-2 text-faint">·</span>
          hash {bundleHash.slice(0, 12)}
        </p>
      </header>

      {isDemo && (
        <DemoBanner note="Demo leaderboard — fabricated rankings for exploration, not written to the database." />
      )}

      <LeaderboardControls
        bundles={controlBundles}
        bundleSlug={bundleSlug}
        category={category}
        categories={filterCategories}
        demo={isDemo}
      />

      {allProvisional && (
        <div
          role="status"
          className="rounded-md border border-warn-400/30 bg-warn-900 px-3 py-2 text-sm text-warn-400"
        >
          All models below are provisional (&lt; 3 complete runs). Rankings stabilize after three
          complete bundle runs.
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No scored runs for this bundle yet"
          body="Scored runs enter the leaderboard, including incomplete runs with penalties. Cancelled runs never enter. Infrastructure failures never become zero scores."
          action={
            <div className="flex flex-wrap gap-2">
              {user ? (
                <Link href="/run" className={buttonClasses({ variant: "primary" })}>
                  Start a benchmark
                </Link>
              ) : (
                <Link href="/runs" className={buttonClasses({ variant: "secondary" })}>
                  View runs
                </Link>
              )}
              {!isDemo && (
                <Link
                  href={`/leaderboard?bundle=${encodeURIComponent(bundleSlug)}&demo=1`}
                  className={buttonClasses({ variant: "ghost" })}
                >
                  Explore demo data
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <LeaderboardTable rows={rows} bundleSlug={bundleSlug} demo={isDemo} />
      )}
    </div>
  );
}
