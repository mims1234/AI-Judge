import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Workbench } from "@/components/arena/Workbench";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildCellHref, parseCellParam } from "@/lib/cellRef";
import { getRunSnapshot } from "@/lib/server/runSnapshot";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ cell?: string; view?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Run ${id.slice(0, 8)}` };
}

function WorkbenchFallback() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-10">
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {Array.from({ length: 24 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export default async function RunWorkbenchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Back-compat: legacy drawer links (?cell=<cand>:<cat>[:<trial>]) redirect to
  // the dedicated cell page (plans/15 §A1).
  const legacy = parseCellParam(sp.cell ?? null);
  if (legacy.candidate && legacy.category) {
    redirect(buildCellHref(id, legacy.candidate, legacy.category, legacy.trial));
  }

  const snapshot = getRunSnapshot(id);

  if (!snapshot) {
    notFound();
  }

  return (
    <Suspense fallback={<WorkbenchFallback />}>
      <Workbench runId={id} snapshot={snapshot} />
    </Suspense>
  );
}
