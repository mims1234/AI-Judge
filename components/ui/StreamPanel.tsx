"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import { CopyButton } from "@/components/ui/CopyButton";
import { StatusDot, type StatusDotTone } from "@/components/ui/StatusDot";

export type StreamPanelProps = {
  text: string; // accumulated tokens so far
  status: "idle" | "streaming" | "done" | "error";
  label: string; // e.g. "Candidate — anthropic/claude-sonnet-4.5"
  maxHeight?: number; // px, default 420; scrolls internally
  markdown?: boolean; // render sanitized markdown when done; raw mono while streaming
  defaultCollapsed?: boolean; // judge streams pass true
  className?: string;
};

const STATUS_TONES: Record<StreamPanelProps["status"], { tone: StatusDotTone; label: string }> = {
  idle: { tone: "idle", label: "idle" },
  streaming: { tone: "streaming", label: "streaming" },
  done: { tone: "done", label: "done" },
  error: { tone: "error", label: "error" },
};

/**
 * Live token display (plans/07 §3.4). Plain escaped text while streaming with a
 * blinking teal cursor; sanitized markdown when done && markdown. Auto-sticks to
 * bottom until the user scrolls up. No aria-live on the token region.
 */
export function StreamPanel({
  text,
  status,
  label,
  maxHeight = 420,
  markdown = false,
  defaultCollapsed = false,
  className,
}: StreamPanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Follow the stream while pinned.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || collapsed) return;
    if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text, collapsed, status]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickToBottom.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight });
  };

  const tone = STATUS_TONES[status];
  const renderedHtml =
    status === "done" && markdown && text ? renderMarkdown(text) : null;

  return (
    <section
      role="region"
      aria-label={label}
      className={cn("rounded-md border border-line-subtle bg-ink-950", className)}
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${label}` : `Collapse ${label}`}
          onClick={() => setCollapsed((v) => !v)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-dim transition-colors duration-150 hover:bg-ink-800 hover:text-bright"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
            className={cn("transition-transform duration-150", collapsed && "-rotate-90")}
          >
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="min-w-0 flex-1 truncate text-xs uppercase tracking-wide text-dim">
          {label}
        </div>
        <StatusDot tone={tone.tone} label={tone.label} />
        <CopyButton text={text} label={label} />
      </div>

      {!collapsed && (
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            style={{ maxHeight }}
            className="overflow-y-auto p-4"
          >
            {text.length === 0 && status === "idle" && (
              <span className="font-mono text-sm text-faint">Waiting…</span>
            )}
            {text.length === 0 && status === "streaming" && (
              <span className="font-mono text-sm text-faint">
                Connecting
                <span className="stream-cursor" aria-hidden="true" />
              </span>
            )}
            {renderedHtml ? (
              <div
                className="md-body"
                // Sanitized by lib/markdown.ts (marked + DOMPurify allowlist).
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              text.length > 0 && (
                <div className="font-mono text-sm whitespace-pre-wrap text-body">
                  {text}
                  {status === "streaming" && (
                    <span className="stream-cursor" aria-hidden="true" />
                  )}
                </div>
              )
            )}
            {status === "error" && (
              <div className="mt-2 font-mono text-xs text-fail-400">
                stream interrupted
              </div>
            )}
          </div>

          {showJump && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="absolute bottom-3 right-3 rounded-full border border-line-strong bg-ink-850 px-2.5 py-1 text-xs text-body shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-colors duration-150 hover:bg-ink-700 hover:text-bright"
            >
              Jump to latest ↓
            </button>
          )}
        </div>
      )}
    </section>
  );
}
