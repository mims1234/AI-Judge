"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function LeaderboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/leaderboard]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        Leaderboard
      </h1>
      <EmptyState
        className="mt-6"
        title="Could not load leaderboard."
        body="The ranking query failed. Your runs are unchanged — try again."
        action={
          <Button variant="primary" onClick={reset}>
            Retry
          </Button>
        }
      />
    </div>
  );
}
