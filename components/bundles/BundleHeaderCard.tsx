import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { shortId } from "@/lib/format";
import type { BundleRow } from "@/lib/server/bundles";

/** Bundle version header: status, content hash, meta, CTA (plans/08 §3.2). Server-rendered. */
export function BundleHeaderCard({ bundle }: { bundle: BundleRow }) {
  const created = new Date(bundle.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="rounded-md border border-line-subtle bg-ink-900 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono text-lg text-bright">{bundle.slug}</h2>
        <Badge tone={bundle.status === "published" ? "teal" : "neutral"}>
          {bundle.status.toUpperCase()}
        </Badge>
        <span className="flex items-center gap-1 font-mono text-xs text-dim">
          hash: {shortId(bundle.content_hash, 8)}…
          <CopyButton text={bundle.content_hash} label="bundle content hash" />
        </span>
      </div>
      <p className="mt-2 text-sm text-dim">
        8 categories · seeded panels · created {created} · v{bundle.version}
      </p>
      <p className="mt-1 text-xs text-faint">
        Published bundles are immutable — changes create a new version and a new leaderboard.
      </p>
      <div className="mt-4">
        <Link href="/run" className={buttonClasses({ variant: "primary" })}>
          Run this bundle →
        </Link>
      </div>
    </div>
  );
}
