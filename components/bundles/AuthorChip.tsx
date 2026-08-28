import { cn } from "@/lib/cn";
import type { BundleAuthor } from "@/lib/bundles/types";

/** Pack author identity: avatar (or initial fallback) + username. */
export function AuthorChip({
  author,
  className,
}: {
  author: BundleAuthor;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 text-xs text-dim",
        className,
      )}
    >
      {author.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatar_url}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-line-strong"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ink-700 font-mono text-[9px] uppercase text-dim"
        >
          {author.username.slice(0, 1)}
        </span>
      )}
      <span className="truncate">by {author.username}</span>
    </span>
  );
}
