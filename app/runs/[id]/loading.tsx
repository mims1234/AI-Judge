"use client";

import { animate } from "animejs";
import { useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RunLoading() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !barRef.current) return;
    const anim = animate(barRef.current, {
      scaleX: [0.12, 0.78, 0.35, 0.92, 0.2],
      ease: "inOut(3)",
      duration: 2200,
      loop: true,
    });
    return () => {
      anim.pause();
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading run"
      className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-10"
    >
      <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          ref={barRef}
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-teal-400"
          style={{ transform: "scaleX(0.2)" }}
        />
      </div>
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
      <p className="font-mono text-xs text-faint">Loading run…</p>
    </div>
  );
}
