"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { CopyButton } from "@/components/ui/CopyButton";

/** <details>-style collapsible mono block (common wrapper, judge rubric). */
export function CollapsibleSection({
  title,
  text,
  copyLabel,
  defaultOpen = false,
}: {
  title: string;
  text: string;
  copyLabel: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-md border border-line-subtle bg-ink-900">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-xs uppercase tracking-wide text-dim">{title}</span>
        <span
          aria-hidden="true"
          className={cn("text-dim transition-transform duration-150", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="relative border-t border-line-subtle">
          <div className="absolute right-3 top-3">
            <CopyButton text={text} label={copyLabel} />
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-5 pr-12 font-mono text-sm leading-6 text-body">
            {text}
          </pre>
        </div>
      )}
    </section>
  );
}
