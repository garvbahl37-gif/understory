import Link from "next/link";
import { Suspense } from "react";

import { DepthHistogram } from "@/components/ui/charts";
import { ErrorState } from "@/components/ui/ErrorState";
import { MissingEntity } from "@/components/ui/MissingEntity";
import { Strata, chainToStrata } from "@/components/ui/Strata";
import {
  EmptyState,
  Page,
  PageHeader,
  Panel,
  Section,
  SeverityTag,
  Stat,
  StatSkeleton,
  TableSkeleton,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import type { Severity } from "@/lib/domain/types";
import { ecosystemLabel, formatDay, packageHref, plainNumber, relativeDay } from "@/lib/format";
import {
  serviceAdvisories,
  serviceDetail,
  serviceDirectDependencies,
  serviceFootprint,
  serviceLicenseMix,
} from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery, runQuerySingle } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

type Detail = {
  slug: string;
  name: string;
  tier: string;
  language: string;
  repo: string;
  description: string;
  shipsExternally: boolean;
  deployedAt: string;
  teamSlug: string | null;
  teamName: string | null;
  teamMission: string | null;
  directDependencies: number;
  calls: Array<{ slug: string; name: string; tier: string; protocol: string }>;
  calledBy: Array<{ slug: string; name: string; tier: string; protocol: string }>;
};
type Footprint = { packages: number; versions: number; maxDepth: number; transitiveVersions: number };
type DepRow = {
  packageKey: string;
  name: string;
  ecosystem: string;
  versionKey: string;
  version: string;
  scope: string;
  declaredRange: string;
  license: string | null;
  licenseCategory: string | null;
  directAdvisorySeverities: Severity[];
};
type AdvisoryRow = {
  advisoryId: string;
  title: string;
  severity: Severity;
  cvss: number;
  exploitKnown: boolean;
  verified: boolean;
  hops: number;
  scope: string;
  entryPackage: string;
  vulnerableVersion: string;
  chain: string[];
  distinctRoutes: number;
};
type LicenseRow = { spdxId: string; name: string; category: string; versions: number };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: slug };
}

async function Footprint({ slug, name }: { slug: string; name: string }) {
  const result = await load(async () => {
    const [footprint, advisories, licenses] = await Promise.all([
      runQuerySingle<typeof serviceFootprint.params, Footprint>(serviceFootprint, { slug }),
      runQuery<typeof serviceAdvisories.params, AdvisoryRow>(serviceAdvisories, { slug }),
      runQuery<typeof serviceLicenseMix.params, LicenseRow>(serviceLicenseMix, { slug }),
    ]);
    return { footprint, advisories, licenses };
  });

  if (!result.ok) return <ErrorState error={result.error} retryHref={`/services/${slug}`} />;
  const { footprint, advisories, licenses } = result.data;

  const critical = advisories.filter((a) => a.severity === "CRITICAL").length;
  const bins = Array.from({ length: 7 }, (_, depth) => ({
    depth,
    count: advisories.filter((a) => a.hops === depth).length,
  }));
  const restrictive = licenses.filter((l) => l.category !== "permissive");

  return (
    <>
      <Section title="Footprint">
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Packages beneath"
            value={plainNumber(footprint?.packages ?? 0)}
            sub={`${plainNumber(footprint?.versions ?? 0)} distinct releases`}
          />
          <Stat
            label="Deepest chain"
            value={`${footprint?.maxDepth ?? 0} hops`}
            sub="from the manifest to the furthest release"
          />
          <Stat
            label="Advisories reachable"
            value={plainNumber(advisories.length)}
            tone={critical > 0 ? "critical" : "neutral"}
            sub={critical > 0 ? `${critical} critical` : "none critical"}
          />
          <Stat
            label="Licence obligations"
            value={plainNumber(restrictive.length)}
            tone={restrictive.length > 0 ? "high" : "neutral"}
            sub={
              restrictive
                .map((l) => l.spdxId)
                .slice(0, 3)
                .join(", ") || "all permissive"
            }
          />
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-6">
          {advisories.length > 0 ? (
            <Section title="Exposure depth">
              <Panel>
                <DepthHistogram bins={bins} />
              </Panel>
            </Section>
          ) : null}

          <Section title="Licence mix" hint="Across the whole closure, not just the manifest.">
            <Panel padded={false} className="overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Licence</th>
                    <th className="num">Releases</th>
                  </tr>
                </thead>
                <tbody>
                  {licenses.map((row) => (
                    <tr key={row.spdxId}>
                      <td>
                        <span className="u-mono text-[12px] text-fg-muted">{row.spdxId}</span>
                        <div className="mt-0.5">
                          <Tag tone={row.category === "permissive" ? "quiet" : "warn"}>{row.category}</Tag>
                        </div>
                      </td>
                      <td className="num text-fg-muted">{row.versions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        </div>

        <Section
          title={`Advisories reaching this service — ${plainNumber(advisories.length)}`}
          hint="Shortest route from this service's own manifest down to each vulnerable release."
        >
          {advisories.length === 0 ? (
            <EmptyState
              title="Clean, to six hops"
              body="Nothing in this service's dependency closure matches an advisory we index. Worth re-checking after the next lockfile change."
            />
          ) : (
            <div className="space-y-3">
              {advisories.map((row) => (
                <Panel key={row.advisoryId} padded={false} className="overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-rule px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/advisories/${encodeURIComponent(row.advisoryId)}`}
                        className="link u-mono text-[12.5px]"
                      >
                        {row.advisoryId}
                      </Link>
                      <SeverityTag severity={row.severity} compact />
                      {row.exploitKnown ? <Tag tone="warn">exploited</Tag> : null}
                      {!row.verified ? <Tag tone="quiet">synthetic</Tag> : null}
                    </div>
                    <span className="u-num text-[11.5px] text-fg-subtle">
                      {row.hops} {row.hops === 1 ? "hop" : "hops"}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <p className="mb-2.5 text-[12.5px] leading-snug text-fg-subtle">{row.title}</p>
                    <Strata rows={chainToStrata(name, `/services/${slug}`, row.chain)} />
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

async function Dependencies({ slug }: { slug: string }) {
  const result = await load(() =>
    runQuery<typeof serviceDirectDependencies.params, DepRow>(serviceDirectDependencies, { slug }),
  );
  if (!result.ok) return null;

  return (
    <Section title="Declared dependencies" hint="What is actually written in the lockfile.">
      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Pinned</th>
                <th>Scope</th>
                <th>Licence</th>
                <th>Direct advisories</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.versionKey}>
                  <td>
                    <Link href={packageHref(row.packageKey)} className="link u-mono text-[12.5px]">
                      {row.name}
                    </Link>
                    <div className="mt-0.5">
                      <Tag tone="quiet">{ecosystemLabel(row.ecosystem)}</Tag>
                    </div>
                  </td>
                  <td className="u-mono text-[12px] text-fg-muted">
                    {row.version}
                    <div className="text-[10.5px] text-fg-ghost">{row.declaredRange}</div>
                  </td>
                  <td>
                    <Tag tone="quiet">{row.scope}</Tag>
                  </td>
                  <td className="u-mono text-[11.5px] text-fg-subtle">{row.license ?? "—"}</td>
                  <td>
                    {row.directAdvisorySeverities.length === 0 ? (
                      <span className="text-[12px] text-fg-ghost">clean</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {row.directAdvisorySeverities.map((severity) => (
                          <SeverityTag key={severity} severity={severity} compact />
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </Section>
  );
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const head = await load(() => runQuerySingle<typeof serviceDetail.params, Detail>(serviceDetail, { slug }));

  if (!head.ok) {
    return (
      <Page>
        <PageHeader eyebrow="Service" title={slug} />
        <ErrorState error={head.error} retryHref={`/services/${slug}`} />
      </Page>
    );
  }

  const service = head.data;
  if (!service) {
    return (
      <MissingEntity kind="service" identifier={slug} browseHref="/services" browseLabel="Browse services" />
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/services" className="link">
              Services
            </Link>{" "}
            / {service.teamName ?? "unowned"}
          </>
        }
        title={service.name}
        lede={service.description}
        actions={
          <Link href={`/explorer?seed=service&id=${encodeURIComponent(service.slug)}`} className="btn">
            Open in explorer
          </Link>
        }
      />

      <div className="mb-7 grid gap-4 lg:grid-cols-3">
        <Panel>
          <p className="u-eyebrow mb-3">Ownership</p>
          <p className="text-[14px] text-fg">{service.teamName ?? "Unowned"}</p>
          {service.teamMission ? (
            <p className="mt-1 text-[12.5px] text-fg-subtle">{service.teamMission}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <TierMark tier={service.tier} />
            <Tag tone="quiet">{service.language}</Tag>
            {service.shipsExternally ? <Tag tone="warn">customer-facing</Tag> : null}
          </div>
          <p className="u-mono mt-4 text-[11px] text-fg-ghost">
            deployed {relativeDay(service.deployedAt)} · {formatDay(service.deployedAt)}
          </p>
        </Panel>

        <Panel>
          <p className="u-eyebrow mb-3">Calls out to</p>
          {service.calls.length === 0 ? (
            <p className="text-[12.5px] text-fg-subtle">Nothing. This service is a leaf in the call graph.</p>
          ) : (
            <ul className="space-y-1.5">
              {service.calls.map((call) => (
                <li key={call.slug} className="flex items-center justify-between gap-3">
                  <Link href={`/services/${call.slug}`} className="link text-[12.5px]">
                    {call.name}
                  </Link>
                  <Tag tone="quiet">{call.protocol}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <p className="u-eyebrow mb-3">Called by</p>
          {service.calledBy.length === 0 ? (
            <p className="text-[12.5px] text-fg-subtle">Nothing calls this directly.</p>
          ) : (
            <ul className="space-y-1.5">
              {service.calledBy.map((call) => (
                <li key={call.slug} className="flex items-center justify-between gap-3">
                  <Link href={`/services/${call.slug}`} className="link text-[12.5px]">
                    {call.name}
                  </Link>
                  <Tag tone="quiet">{call.protocol}</Tag>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Suspense fallback={<StatSkeleton />}>
        <Footprint slug={service.slug} name={service.name} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
        <Dependencies slug={service.slug} />
      </Suspense>
    </Page>
  );
}
