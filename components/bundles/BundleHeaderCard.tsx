import Link from "next/link";
import { AuthorChip } from "@/components/bundles/AuthorChip";
import { PackQualityBadge } from "@/components/bundles/PackQualityBadge";
import { PackReviewDetails } from "@/components/bundles/PackReviewDetails";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { shortId } from "@/lib/format";
import type { BundleListItem, BundleRow } from "@/lib/bundles/types";

/** Bundle version header: status, content hash, meta, CTA (plans/08 §3.2). Server-rendered. */
export function BundleHeaderCard({
  bundle,
  canLaunch = false,
  canImprove = false,
}: {
  bundle: BundleRow | BundleListItem;
  canLaunch?: boolean;
  canImprove?: boolean;
}) {
  const created = new Date(bundle.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const meta = bundle as BundleListItem;
  const categoryCount = meta.categoryCount ?? 8;
  const quality = meta.quality ?? null;
  const author = meta.author ?? null;

  return (
    <div className="rounded-md border border-line-subtle bg-ink-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg text-bright">{bundle.slug}</h2>
            <Badge tone={bundle.origin === "custom" ? "info" : "teal"}>
              {bundle.origin === "custom" ? "CUSTOM" : "OFFICIAL"}
            </Badge>
            <Badge tone={bundle.status === "published" ? "teal" : "neutral"}>
              {bundle.status.toUpperCase()}
            </Badge>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-dim">
            <span className="flex items-center gap-1 font-mono">
              hash {shortId(bundle.content_hash, 8)}…
              <CopyButton text={bundle.content_hash} label="bundle content hash" />
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">v{bundle.version}</span>
            <span aria-hidden="true">·</span>
            <span>
              {categoryCount} {categoryCount === 1 ? "task" : "tasks"}
            </span>
            <span aria-hidden="true">·</span>
            <span>created {created}</span>
          </p>
        </div>
        {quality && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] uppercase tracking-wide text-faint">
              Pack review
            </span>
            <PackQualityBadge quality={quality} size="md" />
          </div>
        )}
      </div>

      {author && (
        <div className="mt-3 flex items-center gap-2 border-t border-line-subtle pt-3">
          <AuthorChip author={author} className="text-sm" />
          {bundle.origin === "custom" && (
            <span className="text-xs text-faint">· pack author</span>
          )}
        </div>
      )}

      {bundle.brief && (
        <p className="mt-3 max-w-3xl text-sm leading-6 text-body">
          {bundle.brief}
        </p>
      )}

      {quality && quality.flags.length > 0 && (
        <div className="mt-4">
          <PackReviewDetails quality={quality} />
        </div>
      )}

      <p className="mt-3 text-xs text-faint">
        {bundle.origin === "official"
          ? "Published official bundles are immutable — changes create a new version and a new leaderboard."
          : "Published custom packs are immutable. Improve by publishing a new pack — the original stays frozen."}
      </p>

      {(bundle.status === "published" && canLaunch) || canImprove ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {bundle.status === "published" && canLaunch && (
            <Link
              href={`/run?bundle=${encodeURIComponent(bundle.slug)}`}
              className={buttonClasses({ variant: "primary" })}
            >
              Run this pack →
            </Link>
          )}
          {canImprove && (
            <Link
              href={`/bundles/new?from=${encodeURIComponent(bundle.slug)}`}
              className={buttonClasses({ variant: "secondary" })}
              data-testid="pack-improve"
            >
              Improve as a new pack →
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}
