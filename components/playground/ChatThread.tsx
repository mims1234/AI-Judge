"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { renderMarkdown } from "@/lib/markdown";
import type { ChatUiMessage } from "@/lib/client/useChatStream";

function TypingDots({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-teal-400/25 bg-teal-900/20 px-3.5 py-3 text-sm text-teal-200"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="inline-flex items-center gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2 w-2 rounded-full bg-teal-300"
            style={{
              animation: "typing-bounce 1.1s ease-in-out infinite",
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </span>
      <span className="font-mono text-xs text-teal-200/90">{label}</span>
    </div>
  );
}

/** Scrollable transcript — raw mono while streaming, markdown when settled. */
export function ChatThread({
  messages,
  candidateModelId,
  awaitingReply = false,
  streaming = false,
}: {
  messages: ChatUiMessage[];
  candidateModelId: string;
  /** True after Send until the first assistant delta arrives. */
  awaitingReply?: boolean;
  /** True while an assistant reply is actively streaming. */
  streaming?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, awaitingReply, streaming]);

  const streamingEmpty = messages.some(
    (m) => m.role === "assistant" && m.streaming && m.content.length === 0,
  );
  const showThinking =
    (awaitingReply || streaming || streamingEmpty) &&
    !messages.some(
      (m) => m.role === "assistant" && m.streaming && m.content.length > 0,
    );

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
      {messages.length === 0 && !showThinking ? (
        <p className="py-10 text-center text-sm text-dim">
          Send a message to start chatting with{" "}
          <span className="font-mono text-body">{candidateModelId}</span>.
        </p>
      ) : (
        messages.map((m) => {
          const isUser = m.role === "user";
          const showMd = !isUser && !m.streaming && m.content.length > 0;
          const showStreamBody =
            !isUser && m.streaming && m.content.length > 0;
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
              {showMd ? (
                <div
                  className={cn(
                    "max-w-[min(42rem,100%)] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                    "border border-line-subtle bg-ink-900 text-body",
                  )}
                >
                  <div
                    className="md-body"
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(m.content),
                    }}
                  />
                </div>
              ) : showStreamBody ? (
                <div
                  className={cn(
                    "max-w-[min(42rem,100%)] rounded-md px-3.5 py-2.5 text-sm leading-relaxed",
                    "border border-teal-400/20 bg-ink-900 text-body",
                  )}
                >
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {m.content}
                    <span
                      className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-teal-400 align-middle"
                      aria-hidden
                    />
                  </pre>
                </div>
              ) : isUser ? (
                <div className="max-w-[min(42rem,100%)] rounded-md bg-teal-900/40 px-3.5 py-2.5 text-sm leading-relaxed text-bright">
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {m.content}
                  </pre>
                </div>
              ) : null}
            </article>
          );
        })
      )}
      {showThinking && (
        <article className="flex flex-col items-start gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-wide text-dim">
            {candidateModelId}
          </span>
          <TypingDots
            label={
              streaming || streamingEmpty
                ? "Replying…"
                : "Thinking — waiting for the first tokens…"
            }
          />
        </article>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
