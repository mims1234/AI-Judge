import Link from "next/link";
import { cn } from "@/lib/cn";

const COPY = {
  run: "Launching writes a public lab record. Anyone can open the run, the export, and the leaderboard. Pause and cancel stay yours.",
  playground:
    "Playground chats are public. Recent sessions are listed on this page. Anyone with the session link can read the transcript.",
  pack: "Publishing puts this pack on the public bundles list, credited to your Discord name. Published packs cannot be edited or deleted.",
} as const;

/** Short disclosure before a user creates a public lab record. */
export function PublicRecordNotice({
  kind,
  className,
}: {
  kind: keyof typeof COPY;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-md border border-line-strong bg-ink-900 px-4 py-3",
        className,
      )}
      data-testid={`public-record-${kind}`}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-teal-400">
        Public record
      </p>
      <p className="mt-1.5 text-sm leading-6 text-body">
        {COPY[kind]}{" "}
        <Link href="/privacy" className="text-teal-300 hover:text-teal-200">
          Privacy
        </Link>
      </p>
    </aside>
  );
}
