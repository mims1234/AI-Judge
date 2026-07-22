import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { CalibrationTable } from "@/components/judges/CalibrationTable";
import { JudgeTable } from "@/components/judges/JudgeTable";
import { buttonClasses } from "@/components/ui/Button";
import { DemoBanner } from "@/components/ui/DemoBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Input";
import {
  DEMO_BUNDLE_SLUG,
  demoCalibrationRows,
  demoJudgeDetail,
  demoJudgeRollups,
} from "@/lib/mocks/demoAnalytics";
import {
  getCalibrationResults,
  getJudgeDetail,
  getJudgeRollups,
  getPanelWideSigma,
  type JudgeDetail,
} from "@/lib/server/analytics";
import { getDefaultBundle, listBundles } from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  bundle?: string;
  demo?: string;
}>;

/** Bundle select via GET form — keeps judges page mostly server-rendered. */
function BundleForm({
  bundles,
  bundleSlug,
  demo,
}: {
  bundles: { id: string; slug: string; name: string; version: string }[];
  bundleSlug: string;
  demo?: boolean;
}) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      {demo && <input type="hidden" name="demo" value="1" />}
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-dim">
        Bundle
        <Select name="bundle" defaultValue={bundleSlug} className="min-w-[200px]" aria-label="Bundle">
          {bundles.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name} ({b.version})
            </option>
          ))}
        </Select>
      </label>
      <button
        type="submit"
        className={buttonClasses({ variant: "secondary", size: "sm" })}
      >
        Apply
      </button>
      <Link
        href={demo ? `/judges?bundle=${bundleSlug}` : `/judges?bundle=${bundleSlug}&demo=1`}
        className="text-xs text-dim underline-offset-2 hover:text-bright hover:underline"
      >
        {demo ? "Exit demo" : "Try demo data"}
      </Link>
    </form>
  );
}

export default async function JudgesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  noStore();
  const sp = await searchParams;
  const isDemo = sp.demo === "1";

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
            slug: DEMO_BUNDLE_SLUG,
            name: "Mini Benchmark",
            version: "v1",
          },
        ];

  const rollups = isDemo ? demoJudgeRollups() : getJudgeRollups(bundleSlug);
  const panelSigma = isDemo ? 0.72 : getPanelWideSigma();
  const calibration = isDemo ? demoCalibrationRows() : getCalibrationResults();

  const details: Record<string, JudgeDetail> = {};
  for (const r of rollups) {
    details[r.judge_model_id] = isDemo
      ? demoJudgeDetail(r.judge_model_id)
      : getJudgeDetail(r.judge_model_id);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Judges
        </h1>
        <p className="text-sm text-bright">How reliable are the judges themselves?</p>
        <p className="max-w-3xl text-sm text-dim">
          Agreement is a diagnostic, not a target — a well-supported minority judgment is not
          penalized. Scores here affect judge meta-rating only and never alter candidate rankings.
        </p>
      </header>

      {isDemo && (
        <DemoBanner note="Demo judge analytics — fabricated harshness and calibration figures." />
      )}

      <BundleForm bundles={controlBundles} bundleSlug={bundleSlug} demo={isDemo} />

      {rollups.length === 0 ? (
        <EmptyState
          title="Judge analytics appear after the first run"
          body="Once judges score a complete task, harshness, variance, and parse reliability show up here."
          action={
            <div className="flex flex-wrap gap-2">
              <Link href="/run" className={buttonClasses({ variant: "primary" })}>
                Start a benchmark
              </Link>
              {!isDemo && (
                <Link
                  href={`/judges?bundle=${encodeURIComponent(bundleSlug)}&demo=1`}
                  className={buttonClasses({ variant: "ghost" })}
                >
                  Explore demo data
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <section aria-labelledby="judge-table-heading" className="flex flex-col gap-3">
          <h2 id="judge-table-heading" className="text-sm uppercase tracking-wide text-dim">
            Judge rollups
          </h2>
          <JudgeTable rollups={rollups} details={details} panelSigma={panelSigma} />
        </section>
      )}

      <section aria-labelledby="calibration-heading" className="flex flex-col gap-3">
        <h2 id="calibration-heading" className="text-sm uppercase tracking-wide text-dim">
          Calibration results
        </h2>
        <CalibrationTable rows={calibration} />
      </section>
    </div>
  );
}
