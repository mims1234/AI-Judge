"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatUiMessage } from "@/lib/client/useChatStream";

/** Scrollable transcript — raw mono while streaming, markdown when settled. */
export function ChatThread({
  messages,
  candidateModelId,
}: {
  messages: ChatUiMessage[];
  candidateModelId: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    if (stickRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  return (
    <div
      ref={scrollerRef}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
      onScroll={() => {
        const el = scrollerRef.current;
        if (!el) return;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
    >
      {messages.length === 0 ? (
        <p className="py-10 text-center text-sm text-dim">
          Send a message to start chatting with{" "}
          <span className="font-mono text-body">{candidateModelId}</span>.
        </p>
      ) : (
        messages.map((m) => {
          const isUser = m.role === "user";
          const showMd = !isUser && !m.streaming && m.content.length > 0;
          return (
            <article
              key={m.id}
              className={cn(
                "flex flex-col gap-1.5",
                isUser ? "items-end" : "items-start",
              )}
            >
              <span className="font-mono text-[11px] uppercase tracking-wide text-dim">
                {isUser ? "You" : candidateModelId}
              </span>
              <div
                className={cn(
                  "max-w-[min(42rem,100%)] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "bg-teal-900/40 text-bright"
                    : "border border-line-subtle bg-ink-900 text-body",
                )}
              >
                {showMd ? (
                  <div
                    className="md-body"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(m.content),
                    }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {m.content || (m.streaming ? "" : "…")}
                    {m.streaming && (
                      <span
                        className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-teal-400 align-middle"
                        aria-hidden
                      />
                    )}
                  </pre>
                )}
              </div>
            </article>
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}
