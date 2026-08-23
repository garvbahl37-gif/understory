import Link from "next/link";
import { Suspense } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { Strata, chainToStrata } from "@/components/ui/Strata";
import {
  EmptyState,
  Page,
  PageHeader,
  Panel,
  Section,
  Stat,
  StatSkeleton,
  TableSkeleton,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import type { LicenseExposureRow } from "@/lib/domain/types";
import { plainNumber } from "@/lib/format";
import { licenseContamination, licenseSummary } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Licences",
  description:
    "Copyleft obligations that reached a customer-facing service, and the chain that carried them.",
};

type SummaryRow = {
  spdxId: string;
  name: string;
  category: string;
  osiApproved: boolean;
  versions: number;
  packages: number;
};

const CATEGORY_TONE: Record<string, "quiet" | "warn"> = {
  permissive: "quiet",
  "weak-copyleft": "warn",
  "strong-copyleft": "warn",
  "network-copyleft": "warn",
  "source-available": "warn",
  unknown: "warn",
};

async function Contamination() {
  const result = await load(() =>
    runQuery<typeof licenseContamination.params, LicenseExposureRow>(licenseContamination, {
      categories: ["strong-copyleft", "network-copyleft", "source-available", "unknown"],
      maxDepth: 6,
    }),
  );

  if (!result.ok) return <ErrorState error={result.error} retryHref="/licences" />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No copyleft obligation reached a shipped product"
        body="Nothing under a strong-copyleft, network-copyleft, source-available or undeclared licence appears in the dependency closure of any customer-facing service, to a depth of six hops."
      />
    );
  }

  const byService = new Map<string, LicenseExposureRow[]>();
  for (const row of rows) {
    const list = byService.get(row.serviceSlug) ?? [];
    list.push(row);
    byService.set(row.serviceSlug, list);
  }

  return (
    <div className="space-y-4">
      {[...byService.entries()].map(([slug, group]) => {
        const first = group[0];
        return (
          <Panel key={slug} padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/services/${slug}`} className="link font-medium">
                  {first.serviceName}
                </Link>
                <TierMark tier={first.tier} />
                <Tag tone="warn">customer-facing</Tag>
              </div>
              <span className="text-[11.5px] text-fg-subtle">{first.teamName ?? "unowned"}</span>
            </div>

            <div className="divide-y divide-[color-mix(in_srgb,var(--rule)_60%,transparent)]">
              {group.map((row) => (
                <div key={`${row.serviceSlug}-${row.license}`} className="px-4 py-3.5">
                  <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
                    <span className="u-mono text-[13px] text-high">{row.license}</span>
                    <Tag tone={CATEGORY_TONE[row.category] ?? "warn"}>{row.category}</Tag>
                    <span className="text-[12px] text-fg-subtle">{row.licenseName}</span>
                    {row.distinctVersions > 1 ? (
                      <span className="u-mono text-[10.5px] text-fg-ghost">
                        {row.distinctVersions} releases under this licence
                      </span>
                    ) : null}
                  </div>
                  <Strata
                    rows={chainToStrata(row.serviceName, `/services/${row.serviceSlug}`, row.chain, {
                      endNote: row.license,
                    })}
                  />
                </div>
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}

async function Distribution() {
  const result = await load(() => runQuery<typeof licenseSummary.params, SummaryRow>(licenseSummary, {}));
  if (!result.ok) return null;

  const total = result.data.reduce((sum, row) => sum + row.versions, 0);
  const restrictive = result.data.filter((row) => row.category !== "permissive");
  const restrictiveVersions = restrictive.reduce((sum, row) => sum + row.versions, 0);

  return (
    <>
      <div className="stagger mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Licences in play"
          value={result.data.filter((r) => r.versions > 0).length}
          sub="across every indexed release"
        />
        <Stat label="Releases indexed" value={plainNumber(total)} sub="each carries its own licence edge" />
        <Stat
          label="Non-permissive releases"
          value={plainNumber(restrictiveVersions)}
          tone={restrictiveVersions > 0 ? "high" : "neutral"}
          sub={`${Math.round((restrictiveVersions / Math.max(1, total)) * 100)}% of the graph`}
        />
        <Stat
          label="Undeclared"
          value={plainNumber(result.data.find((r) => r.category === "unknown")?.versions ?? 0)}
          tone="critical"
          sub="no grant of rights at all"
        />
      </div>

      <Section title="Licence distribution" hint="The denominator for everything above.">
        <Panel padded={false} className="overflow-hidden">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>SPDX</th>
                  <th>Licence</th>
                  <th>Category</th>
                  <th className="num">Releases</th>
                  <th className="num">Packages</th>
                </tr>
              </thead>
              <tbody>
                {result.data
                  .filter((row) => row.versions > 0)
                  .map((row) => (
                    <tr key={row.spdxId}>
                      <td className="u-mono text-[12.5px] text-fg">{row.spdxId}</td>
                      <td className="text-[12.5px] text-fg-subtle">{row.name}</td>
                      <td>
                        <Tag tone={CATEGORY_TONE[row.category] ?? "quiet"}>{row.category}</Tag>
                      </td>
                      <td className="num text-fg-muted">{plainNumber(row.versions)}</td>
                      <td className="num text-fg-muted">{plainNumber(row.packages)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>
    </>
  );
}

export default function LicencesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Analysis"
        title="Obligations we inherited"
        lede="Licences propagate down a dependency tree the same way vulnerabilities do, and nobody notices until a customer's legal team asks. This page crosses three unrelated parts of the graph — licensing, dependency depth and ownership — in one statement, and returns the chain that carried the obligation rather than just the fact of it."
      />

      <Suspense fallback={<StatSkeleton />}>
        <Distribution />
      </Suspense>

      <Section
        title="Contamination paths"
        hint="Customer-facing services only. A permissive licence deep in a tree is fine; a network-copyleft licence under a service you offer over the internet is a conversation."
      >
        <Suspense fallback={<TableSkeleton rows={5} cols={3} />}>
          <Contamination />
        </Suspense>
      </Section>
    </Page>
  );
}
