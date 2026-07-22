import { cn } from "@/lib/cn";

export type SkeletonProps = {
  className?: string;
};

/** Loading placeholder block — static under prefers-reduced-motion (plans/07 §3.8). */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-ink-800", className)} />;
}

/** A page-title + row skeleton group used by several loading.tsx files. */
export function SkeletonRows({ rows = 8, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-11 w-full" />
      ))}
    </div>
  );
}
