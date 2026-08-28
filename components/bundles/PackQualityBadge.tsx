import { Badge } from "@/components/ui/Badge";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { cn } from "@/lib/cn";
import type { PackReview } from "@/lib/bundles/pack-review";

/** Pack review score on the score ramp + "Needs work" flag under 6. */
export function PackQualityBadge({
  quality,
  size = "sm",
  className,
}: {
  quality: PackReview;
  size?: "sm" | "md";
  className?: string;
}) {
  const needsWork = quality.score < 6;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ScoreBadge score={quality.score} size={size} showOutOf />
      {needsWork && <Badge tone="warn">Needs work</Badge>}
    </span>
  );
}
