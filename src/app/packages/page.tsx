import Link from "next/link";
import { Suspense } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { FilterBar } from "@/components/ui/FilterBar";
import { EmptyState, Page, PageHeader, Panel, TableSkeleton, Tag } from "@/components/ui/primitives";
import { ECOSYSTEMS, type Ecosystem } from "@/lib/domain/types";
import { compactNumber, ecosystemLabel, packageHref } from "@/lib/format";
import { packageSearch } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Packages",
  description: "Every third-party package in the graph, across five registries.",
};

type Row = {
  key: string;
  name: string;
  ecosystem: string;
  description: string;
  weeklyDownloads: number;
  deprecated: boolean;
  versions: number;
  maintainers: number;
  advisories: number;
};

const FILTERS = [
  {
    param: "eco",
    label: "Registry",
    multiple: true,
    options: ECOSYSTEMS.map((eco) => ({ value: eco, label: ecosystemLabel(eco) })),
  },
];

async function PackageTable({ eco, q }: { eco: string; q: string }) {
  const ecosystems = eco
    .split(",")
    .filter((v): v is Ecosystem => (ECOSYSTEMS as readonly string[]).includes(v));

  const result = await load(() =>
    runQuery<typeof packageSearch.params, Row>(packageSearch, { search: q, ecosystems, limit: 120 }),
  );

  if (!result.ok) return <ErrorState error={result.error} retryHref="/packages" />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No package matches"
        body="Try a shorter fragment of the name, or clear the registry filter. Maven artefacts are indexed by their full groupId:artifactId."
      />
    );
  }

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Registry</th>
              <th className="num">Weekly</th>
              <th className="num">Releases</th>
              <th className="num">Maintainers</th>
              <th className="num">Advisories</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="max-w-[420px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={packageHref(row.key)} className="link u-mono text-[12.5px]">
                      {row.name}
                    </Link>
                    {row.deprecated ? <Tag tone="warn">deprecated</Tag> : null}
                  </div>
                  <p className="mt-1 truncate text-[12px] text-fg-subtle">{row.description}</p>
                </td>
                <td>
                  <Tag tone="quiet">{ecosystemLabel(row.ecosystem)}</Tag>
                </td>
                <td className="num text-fg-muted">{compactNumber(row.weeklyDownloads)}</td>
                <td className="num text-fg-muted">{row.versions}</td>
                <td className="num">
                  <span className={row.maintainers === 1 ? "text-high" : "text-fg-muted"}>
                    {row.maintainers}
                  </span>
                </td>
                <td className="num">
                  {row.advisories > 0 ? (
                    <span className="u-num text-critical">{row.advisories}</span>
                  ) : (
                    <span className="u-num text-fg-ghost">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ eco?: string; q?: string }>;
}) {
  const { eco = "", q = "" } = await searchParams;

  return (
    <Page>
      <PageHeader
        eyebrow="Inventory"
        title="What we stand on"
        lede="Five registries, one index. Ecosystem is a property on the node rather than a separate table, so a single statement searches npm, PyPI, Maven, crates.io and Go modules together."
      />

      <Suspense fallback={null}>
        <FilterBar groups={FILTERS} searchParam="q" searchPlaceholder="Package name…" />
      </Suspense>

      <Suspense key={`${eco}|${q}`} fallback={<TableSkeleton rows={12} cols={6} />}>
        <PackageTable eco={eco} q={q} />
      </Suspense>
    </Page>
  );
}
