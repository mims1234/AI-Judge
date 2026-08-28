import type { Metadata } from "next";
import Link from "next/link";
import { pageSeo } from "@/lib/seo";
import { SignInGate } from "@/components/auth/SignInGate";
import { AuthorChip } from "@/components/bundles/AuthorChip";
import { BundleHeaderCard } from "@/components/bundles/BundleHeaderCard";
import { ChangelogList } from "@/components/bundles/ChangelogList";
import { CollapsibleSection } from "@/components/bundles/CollapsibleSection";
import { PackQualityBadge } from "@/components/bundles/PackQualityBadge";
import { TaskCardGrid } from "@/components/bundles/TaskCardGrid";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import {
  attachBundleMeta,
  getBundleTasks,
  getDefaultBundle,
  listBundles,
  parseMustMention,
  withBundleMeta,
} from "@/lib/server/bundles";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageSeo({
  title: "Bundles",
  description:
    "Inspect immutable prompt packs: eight category tasks, judge prompts, output schemas, content hashes, and changelogs. Same input for every model.",
  path: "/bundles",
});

type SearchParams = Promise<{ bundle?: string }>;

export default async function BundlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { bundle: bundleParam } = await searchParams;
  const user = await getSessionUser();
  const userId = user?.id ?? null;
  const listed = attachBundleMeta(
    listBundles().filter((b) => {
      if (b.status === "published") return true;
      return b.origin === "custom" && b.status === "draft" && b.author_user_id === userId;
    }),
  );

  if (listed.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 md:px-10">
        <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
          Bundles
        </h1>
        <EmptyState
          className="mt-6"
          title="No bundles seeded."
          body="Run npm run db:migrate (or restart the dev server) to install mini-benchmark-v1."
        />
      </div>
    );
  }

  const official = listed.filter((b) => b.origin === "official");
  const custom = listed.filter((b) => b.origin === "custom");

  const selected =
    listed.find((b) => b.slug === bundleParam || b.id === bundleParam) ??
    (getDefaultBundle()
      ? listed.find((b) => b.id === getDefaultBundle()!.id)
      : undefined) ??
    listed.find((b) => b.status === "published") ??
    listed[0]!;

  const taskRows = getBundleTasks(selected.id);
  const tasks = taskRows.map((t) => ({
    category: t.category,
    task_body: t.task_body,
    output_schema: t.output_schema,
    token_limit: t.token_limit,
    must_mention: parseMustMention(t.must_mention_json),
  }));
  const wrapper = taskRows[0]?.wrapper ?? "";
  const rubric = taskRows[0]?.judge_prompt ?? "";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
            Bundles
          </h1>
          <p className="mt-1 text-sm text-dim">
            Immutable prompt instruments. Official tracks stay separate; custom
            packs get their own board.
          </p>
        </div>
        {userId ? (
          <Link href="/bundles/new" className={buttonClasses({ variant: "primary" })}>
            Create pack
          </Link>
        ) : null}
      </div>
      {!userId && (
        <SignInGate
          variant="banner"
          title="Sign in to create a pack"
          body="Viewing stays open. Creating and publishing needs a Discord sign-in."
        />
      )}

      <CatalogSection title="Official" items={official} selectedId={selected.id} />
      <CatalogSection
        title="Custom packs"
        items={custom}
        selectedId={selected.id}
        emptyCta
        canCreate={Boolean(userId)}
      />

      <BundleHeaderCard
        bundle={selected}
        canLaunch={Boolean(userId)}
        canImprove={Boolean(userId) && selected.origin === "custom"}
      />

      <CollapsibleSection title="Common wrapper" text={wrapper} copyLabel="common wrapper" />

      <section aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="mb-4 text-xl text-bright">
          Category tasks
        </h2>
        <TaskCardGrid tasks={tasks} />
      </section>

      <CollapsibleSection title="Judge rubric" text={rubric} copyLabel="judge rubric" />

      <ChangelogList bundles={listed} />
    </div>
  );
}

function CatalogSection({
  title,
  items,
  selectedId,
  emptyCta = false,
  canCreate = false,
}: {
  title: string;
  items: ReturnType<typeof withBundleMeta>[];
  selectedId: string;
  emptyCta?: boolean;
  canCreate?: boolean;
}) {
  if (items.length === 0) {
    return (
      <section>
        <h2 className="mb-3 text-xs uppercase tracking-wide text-dim">{title}</h2>
        {emptyCta && canCreate ? (
          <Link
            href="/bundles/new"
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-dim transition-colors duration-150 hover:border-teal-400/50 hover:text-body"
          >
            <span>No custom packs yet — build one from 1–5 types, generated with your key.</span>
            <span className="text-teal-300">Create pack →</span>
          </Link>
        ) : emptyCta ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-3 text-sm text-dim">
            No custom packs yet. Sign in to create one.
          </p>
        ) : (
          <p className="text-sm text-faint">None yet.</p>
        )}
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-xs uppercase tracking-wide text-dim">{title}</h2>
      <nav aria-label={title} className="grid gap-3 sm:grid-cols-2">
        {items.map((b) => {
          const isSelected = b.id === selectedId;
          return (
            <Link
              key={b.id}
              href={`/bundles?bundle=${encodeURIComponent(b.slug)}`}
              aria-current={isSelected ? "page" : undefined}
              className={cn(
                "flex flex-col gap-2.5 rounded-md border p-4 transition-colors duration-150",
                isSelected
                  ? "border-teal-400/60 bg-teal-900/40"
                  : "border-line-subtle bg-ink-900 hover:border-line-strong",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-sm text-bright">{b.slug}</span>
                <Badge tone={b.origin === "custom" ? "info" : "teal"}>
                  {b.origin === "custom" ? "CUSTOM" : "OFFICIAL"}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
                {b.author && (
                  <>
                    <AuthorChip author={b.author} />
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>
                  {b.categoryCount} {b.categoryCount === 1 ? "task" : "tasks"}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">v{b.version}</span>
                {b.status === "draft" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <Badge tone="neutral">DRAFT</Badge>
                  </>
                )}
              </div>
              {b.quality && (
                <div className="flex items-center gap-2">
                  <PackQualityBadge quality={b.quality} />
                  <span className="text-[11px] uppercase tracking-wide text-faint">
                    Pack review
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
