import { Skeleton, SkeletonRows } from "@/components/ui/Skeleton";

export default function ModelsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-6 md:px-10">
      <div className="flex items-end justify-between gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-6 w-52" />
      </div>
      <Skeleton className="mt-4 h-10 w-full" />
      <SkeletonRows className="mt-3" rows={12} />
    </div>
  );
}
