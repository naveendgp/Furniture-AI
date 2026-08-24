import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="px-5 lg:px-8 py-7 max-w-[1400px] mx-auto">
      <Skeleton className="h-44 w-full rounded-3xl mb-10" />
      <Skeleton className="h-8 w-48 mb-5" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
