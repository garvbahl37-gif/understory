import Link from "next/link";
import { Suspense } from "react";

import { FilterBar } from "@/components/ui/FilterBar";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  EmptyState,
  Page,
  PageHeader,
  Panel,
  SeverityTag,
  Tag,
  TableSkeleton,
} from "@/components/ui/primitives";
import { SEVERITIES, type AdvisorySummary, type Severity } from "@/lib/domain/types";
import { SEVERITY_COLOR, relativeDay } from "@/lib/format";
import { advisoryList } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Advisories",
  description: "Every advisory we index, ranked by how far into the estate it actually reaches.",
};

const FILTERS = [
  {
    param: "severity",
    label: "Severity",
    multiple: true,
    options: SEVERITIES.map((severity) => ({
      value: severity,
      label: severity.toLowerCase(),
      color: SEVERITY_COLOR[severity],
    })),
  },
];

async function AdvisoryTable({ severity, q }: { severity: string; q: string }) {
  const severities = severity
    .split(",")
    .filter((value): value is Severity => (SEVERITIES as readonly string[]).includes(value));

  const result = await load(() =>
    runQuery<typeof advisoryList.params, AdvisorySummary>(advisoryList, {
      severities,
      search: q,
      limit: 120,
    }),
  );

  if (!result.ok) return <ErrorState error={result.error} retryHref="/advisories" />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No advisory matches those filters"
        body="Widen the severity filter or clear the search. The graph holds both published CVEs and synthetic records; both are searchable by identifier or title."
      />
    );
  }

  const exposed = rows.filter((row) => row.affectedServices > 0).length;

  return (
    <>
      <p className="mb-3 text-[12.5px] text-lichen">
        <span className="u-num text-bone">{rows.length}</span> advisories ·{" "}
        <span className="u-num text-bone">{exposed}</span> reach at least one service ·{" "}
        <span className="u-num text-bone">{rows.length - exposed}</span> we are not exposed to
      </p>

      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Advisory</th>
                <th>Affected packages</th>
                <th className="num">Services</th>
                <th className="num">Tier 1</th>
                <th className="num">CVSS</th>
                <th className="num">Published</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="max-w-[380px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/advisories/${encodeURIComponent(row.id)}`}
                        className="link u-mono text-[12.5px]"
                      >
                        {row.id}
                      </Link>
                      <SeverityTag severity={row.severity} compact />
                      {row.exploitKnown ? <Tag tone="warn">exploited</Tag> : null}
                      {!row.verified ? <Tag tone="quiet">synthetic</Tag> : null}
                    </div>
                    <p className="mt-1 text-[12.5px] leading-snug text-lichen">{row.title}</p>
                  </td>
                  <td className="u-mono max-w-[200px] text-[11.5px] text-lichen">
                    {row.affectedPackages.slice(0, 2).join(", ")}
                    {row.affectedPackages.length > 2 ? ` +${row.affectedPackages.length - 2}` : ""}
                  </td>
                  <td className="num">
                    {row.affectedServices > 0 ? (
                      <span className="u-num text-bone">{row.affectedServices}</span>
                    ) : (
                      <span className="u-num text-lichen-dim">0</span>
                    )}
                  </td>
                  <td className="num">
                    {row.criticalServices > 0 ? (
                      <span className="u-num text-critical">{row.criticalServices}</span>
                    ) : (
                      <span className="u-num text-lichen-dim">—</span>
                    )}
                  </td>
                  <td className="num text-bone">{row.cvss.toFixed(1)}</td>
                  <td className="num text-[12px] text-lichen">{relativeDay(row.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export default async function AdvisoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; q?: string }>;
}) {
  const { severity = "", q = "" } = await searchParams;

  return (
    <Page>
      <PageHeader
        eyebrow="Advisories"
        title="What is wrong, and how far it reaches"
        lede="Ranked by blast radius rather than by score. An advisory on a package nothing depends on is a reading exercise; an advisory four hops beneath your checkout service is a Tuesday."
      />

      <Suspense fallback={null}>
        <FilterBar groups={FILTERS} searchParam="q" searchPlaceholder="CVE identifier or title…" />
      </Suspense>

      <Suspense key={`${severity}|${q}`} fallback={<TableSkeleton rows={10} cols={6} />}>
        <AdvisoryTable severity={severity} q={q} />
      </Suspense>
    </Page>
  );
}
