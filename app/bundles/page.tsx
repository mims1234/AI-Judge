import type { Metadata } from "next";
import Link from "next/link";
import { BundleHeaderCard } from "@/components/bundles/BundleHeaderCard";
import { ChangelogList } from "@/components/bundles/ChangelogList";
import { CollapsibleSection } from "@/components/bundles/CollapsibleSection";
import { TaskCardGrid } from "@/components/bundles/TaskCardGrid";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getBundleTasks,
  getDefaultBundle,
  listBundles,
} from "@/lib/server/bundles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bundles",
};

type SearchParams = Promise<{ bundle?: string }>;

export default async function BundlesPage({ searchParams }: { searchParams: SearchParams }) {
  const { bundle: bundleParam } = await searchParams;
  const bundles = listBundles();

  if (bundles.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 md:px-10">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">Bundles</h1>
        <EmptyState
          className="mt-6"
          title="No bundles seeded."
          body="Run npm run db:migrate (or restart the dev server) to install mini-benchmark-v1."
        />
      </div>
    );
  }

  const selected =
    bundles.find((b) => b.slug === bundleParam || b.id === bundleParam) ??
    getDefaultBundle() ??
    bundles.find((b) => b.status === "published") ??
    bundles[0]!;

  const taskRows = getBundleTasks(selected.id);
  const tasks = taskRows.map((t) => ({
    category: t.category,
    task_body: t.task_body,
    output_schema: t.output_schema,
    token_limit: t.token_limit,
  }));
  const wrapper = taskRows[0]?.wrapper ?? "";
  const rubric = taskRows[0]?.judge_prompt ?? "";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">Bundles</h1>
        {bundles.length > 1 && (
          <nav aria-label="Bundle versions" className="flex gap-2">
            {bundles.map((b) => (
              <Link
                key={b.id}
                href={`/bundles?bundle=${encodeURIComponent(b.slug)}`}
                aria-current={b.id === selected.id ? "page" : undefined}
                className={
                  b.id === selected.id
                    ? "rounded-sm bg-teal-900 px-2.5 py-1.5 font-mono text-xs text-teal-300"
                    : "rounded-sm px-2.5 py-1.5 font-mono text-xs text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
                }
              >
                {b.slug}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <BundleHeaderCard bundle={selected} />

      <CollapsibleSection title="Common wrapper" text={wrapper} copyLabel="common wrapper" />

      <section aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="mb-4 text-xl text-bright">
          Category tasks
        </h2>
        <TaskCardGrid tasks={tasks} />
      </section>

      <CollapsibleSection title="Judge rubric" text={rubric} copyLabel="judge rubric" />

      <ChangelogList bundles={bundles} />

      <div className="border-t border-line-subtle pt-4">
        <Link href="/run" className={buttonClasses({ variant: "primary" })}>
          Run this bundle →
        </Link>
      </div>
    </div>
  );
}
