"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function BundlesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/bundles]", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-10 md:px-10">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">Bundles</h1>
      <EmptyState
        className="mt-6"
        title="Could not load bundles."
        body="The bundle store failed to respond. Your data is unchanged — try again."
        action={<Button variant="primary" onClick={reset}>Retry</Button>}
      />
    </div>
  );
}
