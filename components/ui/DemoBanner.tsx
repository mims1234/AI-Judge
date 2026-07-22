import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

/**
 * Shown whenever `?demo=1` data is on screen — demo mode is always explicit
 * and labeled, never silently mixed into real data.
 */
export function DemoBanner({ className, note }: { className?: string; note?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-2.5 rounded-md border border-teal-400/30 bg-teal-900 px-3 py-2 text-sm text-teal-300",
        className,
      )}
    >
      <Badge tone="teal">DEMO DATA</Badge>
      <span className="text-body">
        {note ?? "Exploring with simulated data — no models are being called and nothing is billed."}
      </span>
      <Link href="?" className="ml-auto text-xs text-dim underline-offset-2 hover:text-bright hover:underline">
        Exit demo
      </Link>
    </div>
  );
}
