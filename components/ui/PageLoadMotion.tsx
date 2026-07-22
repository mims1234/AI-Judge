"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Route-transition loading shell: anime.js indeterminate bar + skeleton rows.
 * Respects prefers-reduced-motion (static bar + pulse skeletons only).
 */
export function PageLoadMotion({
  titleWidth = "w-40",
  rows = 8,
  className,
  label = "Loading",
}: {
  titleWidth?: string;
  rows?: number;
  className?: string;
  label?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !barRef.current || !glowRef.current) return;

    const barAnim = animate(barRef.current, {
      scaleX: [0.12, 0.78, 0.35, 0.92, 0.2],
      ease: "inOut(3)",
      duration: 2200,
      loop: true,
    });

    const glowAnim = animate(glowRef.current, {
      opacity: [0.35, 0.9, 0.35],
      ease: "inOut(2)",
      duration: 1400,
      loop: true,
    });

    return () => {
      barAnim.pause();
      glowAnim.pause();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-10 md:px-10",
        className,
      )}
    >
      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          ref={barRef}
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-teal-400"
          style={{ transform: "scaleX(0.2)" }}
        />
        <div
          ref={glowRef}
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-teal-300/40 to-transparent"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className={cn("h-8", titleWidth)} />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>

      {rows > 0 && (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton
              key={i}
              className="h-12 w-full"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}

      <p className="font-mono text-xs text-faint">{label}…</p>
    </div>
  );
}
