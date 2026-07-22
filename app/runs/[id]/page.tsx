import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Workbench } from "@/components/arena/Workbench";
import { Skeleton } from "@/components/ui/Skeleton";
import { getRunSnapshot } from "@/lib/server/runSnapshot";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

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

export default async function RunWorkbenchPage({ params }: { params: Params }) {
  const { id } = await params;
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
