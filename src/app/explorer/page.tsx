import { Suspense } from "react";

import { Page, PageHeader } from "@/components/ui/primitives";

import { ExplorerClient } from "./ExplorerClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Explorer",
  description:
    "Walk the supply chain graph directly — services, packages, releases, advisories and the people behind them.",
};

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string; id?: string; depth?: string }>;
}) {
  const { seed = "service", id = "checkout-api" } = await searchParams;
  const kind = (["service", "package", "advisory", "maintainer"] as const).includes(seed as never)
    ? (seed as "service" | "package" | "advisory" | "maintainer")
    : "service";

  return (
    <Page>
      <PageHeader
        eyebrow="Analysis"
        title="Walk the graph"
        lede="Every other page in this application is a projection of this. Here the subgraph is drawn as it is stored: labelled nodes, typed edges, and the paths between them assembled from several small edge-list queries running side by side."
      />
      <Suspense fallback={<div className="h-[560px] rounded-[5px] border border-rule bg-[var(--well)]" />}>
        <ExplorerClient initialSeed={kind} initialId={id} />
      </Suspense>
    </Page>
  );
}
