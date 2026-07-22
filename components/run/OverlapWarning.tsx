import { DisagreementFlag } from "@/components/ui/DisagreementFlag";

/**
 * Self-judging overlap banner (plans/09 §1.4). Non-blocking — engine swaps
 * reserve judges. Spread prop unused; we reuse warn styling via a custom banner.
 */
export function OverlapWarning({
  overlap,
  escalate,
}: {
  overlap: string[];
  /** Pool < 4 with overlap — recommend more reserves. */
  escalate?: boolean;
}) {
  if (overlap.length === 0) return null;

  const list = overlap.join(", ");

  return (
    <div
      role="status"
      className="flex flex-col gap-1.5 rounded-md border border-warn-400/30 bg-warn-900 px-3 py-2.5 text-sm text-warn-400"
    >
      <div className="flex items-start gap-2">
        {/* Visual kinship with DisagreementFlag warn treatment */}
        <span className="mt-0.5 shrink-0" aria-hidden="true">
          <DisagreementFlag spread={4} compact />
        </span>
        <p>
          <span className="font-mono text-xs">{list}</span>
          {overlap.length === 1 ? " is" : " are"} both candidate and judge. If
          {overlap.length === 1 ? " it lands" : " they land"} on a panel, a seeded
          reserve judge will replace {overlap.length === 1 ? "it" : "them"} for{" "}
          {overlap.length === 1 ? "its" : "their"} own answers only — the
          substitution is recorded.
        </p>
      </div>
      {escalate && (
        <p className="pl-5 text-xs text-warn-400/80">
          Judge pool is small relative to overlap — recommend pool ≥ overlap + 3
          so reserve swaps have spare judges.
        </p>
      )}
    </div>
  );
}
