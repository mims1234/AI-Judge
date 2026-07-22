"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CHAT_LIMITS } from "@/lib/schemas";

/** Message box + send / judge actions for an active session. */
export function ChatComposer({
  disabled,
  judging,
  canJudge,
  userTurns,
  onSend,
  onJudge,
}: {
  disabled: boolean;
  judging: boolean;
  canJudge: boolean;
  userTurns: number;
  onSend: (content: string) => Promise<void>;
  onJudge: () => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const remaining = CHAT_LIMITS.MAX_USER_TURNS - userTurns;
  const tooLong = text.trim().length > CHAT_LIMITS.MAX_MESSAGE_CHARS;

  const submit = async () => {
    const content = text.trim();
    if (!content || disabled || sending || tooLong) return;
    setSending(true);
    try {
      await onSend(content);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line-subtle pt-3">
      <label className="sr-only" htmlFor="chat-composer">
        Message
      </label>
      <textarea
        id="chat-composer"
        rows={3}
        value={text}
        disabled={disabled || sending}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Message the candidate… (Ctrl/⌘+Enter to send)"
        className="w-full resize-y rounded-md border border-line-strong bg-ink-900 px-3 py-2 text-sm text-bright placeholder:text-dim focus:border-teal-400 focus:outline-none"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-dim">
          {remaining} turn{remaining === 1 ? "" : "s"} left
          {tooLong ? " · message too long" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={!canJudge || judging || sending}
            loading={judging}
            onClick={() => void onJudge()}
          >
            {judging ? "Judging…" : "Judge conversation"}
          </Button>
          <Button
            type="button"
            disabled={disabled || sending || !text.trim() || tooLong}
            loading={sending}
            onClick={() => void submit()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
