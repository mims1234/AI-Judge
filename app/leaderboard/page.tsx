import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { LeaderboardControls } from "@/components/leaderboard/LeaderboardControls";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { buttonClasses } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DEMO_BUNDLE_HASH,
  DEMO_BUNDLE_SLUG,
  demoLeaderboardRows,
} from "@/lib/mocks/demoAnalytics";
import { CATEGORY_ORDER, type Category } from "@/lib/schemas";
import { getLeaderboardData } from "@/lib/server/analytics";
import { getDefaultBundle, listBundles } from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

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
      : [
          {
            id: "demo",
            name: "Mini Benchmark",
            version: "v1",
            slug: DEMO_BUNDLE_SLUG,
            content_hash: DEMO_BUNDLE_HASH,
            status: "published" as const,
            changelog: "",
            created_at: Date.now(),
          },
        ];

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
          title="No complete runs for this bundle yet"
          body="Only completed bundle runs enter the leaderboard. Infrastructure failures never become zero scores."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/run" className={buttonClasses({ variant: "primary" })}>
                Start a benchmark
              </Link>
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
