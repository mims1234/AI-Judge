import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";

export default function RunNotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-16">
      <h1 className="font-display text-2xl uppercase tracking-[0.08em] text-bright">
        Run not found
      </h1>
      <p className="text-sm text-dim">That run id is unknown or was deleted.</p>
      <Link href="/leaderboard" className={buttonClasses({ variant: "primary" })}>
        Back to leaderboard
      </Link>
    </div>
  );
}
