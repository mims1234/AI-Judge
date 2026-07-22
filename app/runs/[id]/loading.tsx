import { Skeleton } from "@/components/ui/Skeleton";

export default function RunLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 md:px-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-3 w-full max-w-xl" />
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {Array.from({ length: 32 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
