"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useAnnounce } from "@/components/ui/StatusAnnouncer";

export type CopyButtonProps = {
  text: string;
  label?: string; // what is being copied, for the announcement
  className?: string;
};

/** Small ghost copy-to-clipboard button with copied-feedback. */
export function CopyButton({ text, label = "text", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const announce = useAnnounce();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API blocked — fall back to a hidden textarea.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* best effort */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    announce(`Copied ${label}`);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-sm text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright",
        className,
      )}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true" className="text-pass-400">
          <path d="M2.5 7l2.5 2.5 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
          <path d="M8.5 4.5v-2a1.2 1.2 0 0 0-1.2-1.2H2.7A1.2 1.2 0 0 0 1.5 2.5v4.6a1.2 1.2 0 0 0 1.2 1.2h1.8" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
      )}
    </button>
  );
}
