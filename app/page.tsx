import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { RankingPreview } from "@/components/landing/RankingPreview";
import { StepCard } from "@/components/landing/StepCard";
import { VerdictPlane } from "@/components/landing/VerdictPlane";
import { buttonClasses } from "@/components/ui/Button";
import { shortId } from "@/lib/format";
import { queryLeaderboard, type LeaderboardRow } from "@/lib/scoring";
import { listBundles } from "@/lib/server/bundles";
import { getSessionUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const METHODOLOGY = [
  {
    number: "01",
    title: "Bundle",
    body: "One immutable, versioned prompt bundle — 1–5 typed tasks. Same input for every model, forever.",
    glyph: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="14" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 8h14M8 8v9" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "Stream",
    body: "Candidates answer live over OpenRouter. Deterministic validators check JSON, counts, word limits and known answers first.",
    glyph: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 10h4l2-5 3 10 2-5h3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Judge ×3",
    body: "A seeded blind panel of three judges scores each answer at temperature 0. Candidate identity is never revealed.",
    glyph: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="6" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="14" cy="7" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="10" cy="14" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Rank",
    body: "Median of judge overalls per task, then averaged across tasks. Scored runs enter the board, including incomplete ones with penalties. Cancelled runs never do.",
    glyph: (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 16V9M10 16V4M16 16v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

const HONESTY = [
  {
    title: "Blind judging",
    body: "Judge prompts contain only the task and the raw answer — never the model's name, provider, or metadata.",
  },
  {
    title: "Seeded panels",
    body: "Each category gets one deterministic 3-judge panel per run, persisted with its seed and reserve order. Fully reproducible.",
  },
  {
    title: "Deterministic validators",
    body: "Objective checks — schema, counts, word limits, known math answers — run before judging and are shown separately, never blended away.",
  },
];

export default async function Home() {
  noStore();
  const user = await getSessionUser();

  const bundle =
    listBundles().find((b) => b.status === "published" && b.origin === "custom") ??
    null;
  let rows: LeaderboardRow[] = [];
  let unavailable = false;
  if (bundle) {
    try {
      rows = queryLeaderboard(bundle.slug).rows.slice(0, 5);
    } catch (err) {
      console.error("[landing] leaderboard read failed", err);
      unavailable = true;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10">
      {/* HERO */}
      <section className="flex flex-col items-start gap-10 py-16 md:py-24 lg:flex-row lg:items-center">
        <div className="w-full lg:w-[55%]">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-teal-400">
            Benchmark lab
          </p>
          <h1 className="font-display text-6xl uppercase leading-[1.05] tracking-[0.08em] text-bright">
            AI Judge
          </h1>
          <p className="mt-4 max-w-xl text-2xl leading-8 text-body">
            One bundle. Three independent judges. Reproducible rankings.
          </p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-dim">
            A single-operator instrument for honest model comparison — streamed answers,
            deterministic validators, seeded blind judge panels, durable SQLite records.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {user ? (
              <Link href="/run" className={buttonClasses({ variant: "primary", size: "lg" })}>
                Start a benchmark
              </Link>
            ) : (
              <Link href="/runs" className={buttonClasses({ variant: "primary", size: "lg" })}>
                View runs
              </Link>
            )}
            <Link href="/leaderboard" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              View leaderboard
            </Link>
          </div>
        </div>
        <div className="hidden w-full justify-center sm:flex lg:w-[45%] lg:justify-end">
          <VerdictPlane />
        </div>
      </section>

      {/* METHODOLOGY */}
      <section aria-labelledby="methodology-heading" className="border-t border-line-subtle py-12">
        <h2 id="methodology-heading" className="mb-6 text-xl text-bright">
          Methodology
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {METHODOLOGY.map((step) => (
            <StepCard key={step.number} {...step} />
          ))}
        </div>
      </section>

      {/* LIVE RANKING PREVIEW */}
      <section className="border-t border-line-subtle py-12">
        <RankingPreview
          bundleSlug={bundle?.slug ?? null}
          rows={rows}
          unavailable={unavailable}
          canLaunch={Boolean(user)}
        />
      </section>

      {/* HONESTY STRIP */}
      <section aria-labelledby="honesty-heading" className="border-t border-line-subtle py-12">
        <h2 id="honesty-heading" className="sr-only">
          Why it is honest
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {HONESTY.map((card) => (
            <div key={card.title} className="rounded-md border border-line-subtle bg-ink-900 p-5">
              <h3 className="flex items-center gap-2 text-base text-bright">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                {card.title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-dim">{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-line-subtle py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-faint">
          <span className="font-mono">
            {bundle ? (
              <>
                {bundle.slug} · hash {shortId(bundle.content_hash, 12)}…
              </>
            ) : (
              "no published bundles"
            )}
          </span>
          <span>Single-operator benchmark lab · SQLite WAL · temperature-0 judging</span>
        </div>
      </footer>
    </div>
  );
}
