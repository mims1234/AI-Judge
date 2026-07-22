"use client";

import { animate } from "animejs";
import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Number that counts up to `value` with anime.js (plans/15 §A4).
 * - `value === null` renders the placeholder em dash.
 * - First non-null value after mount animates from 0; later changes animate
 *   from the current display value. Reduced-motion users get instant updates.
 */
export function CountUp({
  value,
  format,
  duration = 650,
  className,
}: {
  value: number | null;
  format: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState<string>(() =>
    value == null ? "—" : format(value),
  );
  const stateRef = useRef({ v: value ?? 0 });
  const prevRef = useRef<number | null>(value);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;

    if (value == null) {
      setDisplay("—");
      return;
    }
    if (prefersReducedMotion()) {
      stateRef.current.v = value;
      setDisplay(format(value));
      return;
    }
    const from = prev == null ? 0 : stateRef.current.v;
    stateRef.current.v = from;
    const anim = animate(stateRef.current, {
      v: value,
      duration,
      ease: "out(3)",
      onUpdate: () => setDisplay(format(stateRef.current.v)),
      onComplete: () => setDisplay(format(value)),
    });
    return () => {
      anim.pause();
    };
  }, [value, format, duration]);

  return <span className={className}>{display}</span>;
}
