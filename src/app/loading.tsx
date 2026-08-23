import { Page, Skeleton, StatSkeleton, TableSkeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <Page>
      <div role="status" aria-label="Loading">
        <Skeleton className="h-2.5 w-28" />
        <Skeleton className="mt-4 h-8 w-[420px] max-w-full" />
        <Skeleton className="mt-3.5 h-3 w-[560px] max-w-full" />
        <Skeleton className="mt-2 h-3 w-[420px] max-w-full" />
        <div className="mt-9">
          <StatSkeleton />
        </div>
        <div className="mt-8">
          <TableSkeleton rows={7} cols={5} />
        </div>
      </div>
    </Page>
  );
}
