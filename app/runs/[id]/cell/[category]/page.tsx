import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CellPage } from "@/components/arena/CellPage";
import { isCategory, parseTrialParam } from "@/lib/cellRef";
import { getRunSnapshot } from "@/lib/server/runSnapshot";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; category: string }>;
type SearchParams = Promise<{ candidate?: string; trial?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id, category } = await params;
  return { title: `Cell ${category} · Run ${id.slice(0, 8)}` };
}

export default async function CellDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id, category } = await params;
  const sp = await searchParams;

  if (!isCategory(category)) notFound();
  const candidate = sp.candidate;
  if (!candidate) notFound();

  const snapshot = getRunSnapshot(id);
  if (!snapshot) notFound();
  if (!snapshot.candidates.includes(candidate)) notFound();

  return (
    <CellPage
      runId={id}
      snapshot={snapshot}
      candidateModelId={candidate}
      category={category}
      trialFromUrl={parseTrialParam(sp.trial ?? null)}
    />
  );
}
