import type { BundleRow } from "@/lib/bundles/types";

/** Version changelog entries (plans/08 §3.2). Server-rendered. */
export function ChangelogList({ bundles }: { bundles: BundleRow[] }) {
  if (bundles.length === 0) return null;

  return (
    <section aria-labelledby="changelog-heading">
      <h2 id="changelog-heading" className="mb-4 text-xl text-bright">
        Changelog
      </h2>
      <ol role="list" className="flex flex-col gap-3">
        {bundles.map((b) => (
          <li
            key={b.id}
            className="rounded-md border border-line-subtle bg-ink-900 px-4 py-3"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm text-bright">{b.slug}</span>
              <span className="font-mono text-xs text-dim">v{b.version}</span>
              <time
                dateTime={new Date(b.created_at).toISOString()}
                className="text-xs text-faint"
              >
                {new Date(b.created_at).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </div>
            <p className="mt-1 text-sm leading-6 text-dim">{b.changelog}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
