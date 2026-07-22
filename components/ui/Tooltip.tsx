"use client";

import { cloneElement, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement<Record<string, unknown>>;
  className?: string;
  side?: "top" | "bottom";
};

/** Custom tooltip on hover+focus with 150ms delay (plans/07 §3.8). */
export function Tooltip({ content, children, className, side = "top" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const show = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 150);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(false);
  };

  const trigger = cloneElement(children, { "aria-describedby": id });

  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-sm border border-line-strong bg-ink-850 px-2 py-1 text-xs text-body shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-opacity duration-150",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
          open ? "opacity-100" : "opacity-0",
        )}
      >
        {content}
      </span>
    </span>
  );
}
