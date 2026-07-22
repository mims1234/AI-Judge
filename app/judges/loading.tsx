import { Skeleton } from "@/components/ui/Skeleton";

export default function JudgesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
      <Skeleton className="h-8 w-36" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-10 w-52" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
