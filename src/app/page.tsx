import Link from "next/link";

import { ErrorState } from "@/components/ui/ErrorState";
import { Strata, chainToStrata } from "@/components/ui/Strata";
import {
  EmptyState,
  Meter,
  Page,
  PageHeader,
  Panel,
  Section,
  SeverityTag,
  Stat,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import type {
  AdvisorySummary,
  BlastRadiusRow,
  ExposedService,
  LabelCount,
  Severity,
  TypeCount,
} from "@/lib/domain/types";
import { compactNumber, ecosystemLabel, packageHref, plainNumber, relativeDay } from "@/lib/format";
import {
  advisoryList,
  blastRadius,
  exposedServices,
  nodeCounts,
  recentAdvisories,
  relationshipCounts,
  severityBreakdown,
  topReachPackages,
} from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

type SeverityRow = { severity: Severity; advisories: number; exploitKnown: number };
type ReachRow = {
  packageKey: string;
  name: string;
  ecosystem: string;
  weeklyDownloads: number;
  dependentServices: number;
  criticalServices: number;
};
type RecentRow = {
  id: string;
  title: string;
  severity: Severity;
  cvss: number;
  publishedAt: string;
  exploitKnown: boolean;
  verified: boolean;
  affectedPackages: string[];
};

async function loadOverview() {
  // The headline advisory is whichever one currently reaches the most services.
  const advisories = await runQuery<typeof advisoryList.params, AdvisorySummary>(advisoryList, {
    severities: [],
    search: "",
    limit: 40,
  });
  const headline = advisories[0] ?? null;

  const [labels, types, severities, exposed, reach, recent, radius] = await Promise.all([
    runQuery<typeof nodeCounts.params, LabelCount>(nodeCounts, {}),
    runQuery<typeof relationshipCounts.params, TypeCount>(relationshipCounts, {}),
    runQuery<typeof severityBreakdown.params, SeverityRow>(severityBreakdown, {}),
    runQuery<typeof exposedServices.params, ExposedService>(exposedServices, { limit: 6 }),
    runQuery<typeof topReachPackages.params, ReachRow>(topReachPackages, { limit: 6 }),
    runQuery<typeof recentAdvisories.params, RecentRow>(recentAdvisories, { limit: 5 }),
    headline
      ? runQuery<typeof blastRadius.params, BlastRadiusRow>(blastRadius, {
          advisoryId: headline.id,
          maxDepth: 6,
          scopes: [],
          tiers: [],
        })
      : Promise.resolve([] as BlastRadiusRow[]),
  ]);

  return { advisories, headline, labels, types, severities, exposed, reach, recent, radius };
}

export default async function OverviewPage() {
  const result = await load(loadOverview);

  if (!result.ok) {
    return (
      <Page>
        <PageHeader
          eyebrow="Overview"
          title="See what your software is standing on"
          lede="Understory reads a live dependency graph out of CognoDB. It cannot show you anything until it can reach the database."
        />
        <ErrorState error={result.error} retryHref="/" />
      </Page>
    );
  }

  const { headline, labels, types, severities, exposed, reach, recent, radius, advisories } = result.data;

  const nodeTotal = labels.reduce((sum, row) => sum + row.count, 0);
  const relTotal = types.reduce((sum, row) => sum + row.count, 0);
  const criticalCount = severities.find((row) => row.severity === "CRITICAL")?.advisories ?? 0;
  const advisoryTotal = severities.reduce((sum, row) => sum + row.advisories, 0);
  const servicesHit = new Set(advisories.flatMap((a) => (a.affectedServices > 0 ? [a.id] : []))).size;

  // The most instructive row is the deepest one: the service that had no idea.
  const deepest = radius.length
    ? radius.reduce((worst, row) => (row.hops > worst.hops ? row : worst), radius[0])
    : null;
  const maxReach = Math.max(1, ...reach.map((row) => row.dependentServices));

  return (
    <Page>
      <PageHeader
        eyebrow="Meridian Pay · production estate"
        title="See what your software is standing on"
        lede={
          <>
            Forty-four services, {plainNumber(labels.find((l) => l.label === "Package")?.count ?? 0)} packages
            and {plainNumber(labels.find((l) => l.label === "Version")?.count ?? 0)} releases, held as one
            graph. Every number on this page came from a Cypher traversal run just now — nothing here is
            precomputed.
          </>
        }
      />

      {/* ── the thesis ───────────────────────────────────────────────────── */}
      {headline && deepest ? (
        <section className="rise mb-9">
          <Panel padded={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
              <span className="u-eyebrow">Deepest live exposure</span>
              <div className="flex items-center gap-2">
                <SeverityTag severity={headline.severity} />
                {headline.exploitKnown ? <Tag tone="warn">exploit known</Tag> : null}
                {headline.verified ? (
                  <Tag tone="quiet">published CVE</Tag>
                ) : (
                  <Tag tone="quiet">synthetic</Tag>
                )}
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="px-5 py-5">
                <p className="text-[13px] text-lichen">
                  <Link href={`/advisories/${encodeURIComponent(headline.id)}`} className="link u-mono">
                    {headline.id}
                  </Link>{" "}
                  reaches <strong className="text-bone">{deepest.serviceName}</strong> from{" "}
                  <strong className="text-bone">{deepest.hops} hops</strong> below its manifest. Nobody on{" "}
                  {deepest.teamName ?? "the owning team"} typed this package&apos;s name.
                </p>

                <div className="panel-sunken mt-4 px-4 py-3.5">
                  <Strata
                    rows={chainToStrata(
                      deepest.serviceName,
                      `/services/${deepest.serviceSlug}`,
                      deepest.chain,
                    )}
                  />
                </div>

                <p className="mt-4 max-w-[64ch] text-[13px] leading-relaxed text-lichen">{headline.title}</p>
              </div>

              <div className="border-t border-rule px-5 py-5 lg:border-l lg:border-t-0">
                <p className="u-eyebrow mb-3">Blast radius</p>
                <p className="u-num text-[38px] leading-none text-bone">{radius.length}</p>
                <p className="mt-1.5 text-[12px] text-lichen">
                  services affected · {radius.filter((r) => r.tier === "critical").length} of them tier 1
                </p>

                <dl className="mt-5 space-y-2.5 border-t border-rule pt-4 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-lichen">Deepest path</dt>
                    <dd className="u-num text-bone">{deepest.hops} hops</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-lichen">Owning teams</dt>
                    <dd className="u-num text-bone">
                      {new Set(radius.map((r) => r.teamSlug).filter(Boolean)).size}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-lichen">Customer-facing</dt>
                    <dd className="u-num text-bone">{radius.filter((r) => r.shipsExternally).length}</dd>
                  </div>
                </dl>

                <Link
                  href={`/advisories/${encodeURIComponent(headline.id)}`}
                  className="btn btn-primary mt-5 w-full justify-center"
                >
                  Open the full blast radius
                </Link>
              </div>
            </div>
          </Panel>
        </section>
      ) : null}

      {/* ── the numbers ──────────────────────────────────────────────────── */}
      <Section title="The graph right now">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Nodes"
            value={plainNumber(nodeTotal)}
            sub={labels
              .slice(0, 3)
              .map((row) => `${row.label} ${compactNumber(row.count)}`)
              .join(" · ")}
            href="/model"
          />
          <Stat
            label="Relationships"
            value={plainNumber(relTotal)}
            sub={types
              .slice(0, 3)
              .map((row) => `${row.type} ${compactNumber(row.count)}`)
              .join(" · ")}
            href="/model"
          />
          <Stat
            label="Advisories indexed"
            value={plainNumber(advisoryTotal)}
            sub={`${servicesHit} reach at least one service`}
            href="/advisories"
          />
          <Stat
            label="Critical"
            value={plainNumber(criticalCount)}
            tone="critical"
            sub={`${severities.reduce((s, r) => s + r.exploitKnown, 0)} with known exploits`}
            href="/advisories?severity=CRITICAL"
          />
        </div>
      </Section>

      {/* ── two columns ──────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Most exposed services"
          hint="Counting advisories anywhere in the resolved dependency tree, not just the manifest."
        >
          {exposed.length === 0 ? (
            <EmptyState
              title="Nothing is exposed"
              body="No service can reach a known-vulnerable release. Either the graph is empty or you have had an unusually good week."
            />
          ) : (
            <Panel padded={false} className="overflow-hidden">
              <table className="table">
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Owner</th>
                    <th className="num">Advisories</th>
                  </tr>
                </thead>
                <tbody>
                  {exposed.map((row) => (
                    <tr key={row.slug}>
                      <td>
                        <Link href={`/services/${row.slug}`} className="link font-medium">
                          {row.name}
                        </Link>
                        <div className="mt-1">
                          <TierMark tier={row.tier} />
                        </div>
                      </td>
                      <td className="text-[12.5px] text-lichen">{row.teamName ?? "—"}</td>
                      <td className="num">
                        <span className="u-num text-bone">{row.advisories}</span>
                        {row.criticalAdvisories > 0 ? (
                          <span className="u-num ml-2 text-[11px] text-critical">
                            {row.criticalAdvisories} crit
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </Section>

        <Section
          title="Widest reach"
          hint="Packages that the largest number of services can reach. A bad release here is everyone's problem."
        >
          <Panel padded={false} className="overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Package</th>
                  <th className="num">Services beneath</th>
                </tr>
              </thead>
              <tbody>
                {reach.map((row) => (
                  <tr key={row.packageKey}>
                    <td>
                      <Link href={packageHref(row.packageKey)} className="link u-mono text-[12.5px]">
                        {row.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Tag tone="quiet">{ecosystemLabel(row.ecosystem)}</Tag>
                        <span className="u-mono text-[10.5px] text-lichen-dim">
                          {compactNumber(row.weeklyDownloads)}/wk
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      <Meter
                        value={row.dependentServices}
                        max={maxReach}
                        tone={row.criticalServices > 0 ? "var(--sev-high)" : "var(--chalk)"}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      </div>

      <Section title="Newest advisories" hint="Ordered by publication date, whatever their blast radius.">
        <Panel padded={false} className="overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>Advisory</th>
                <th>Packages</th>
                <th className="num">CVSS</th>
                <th className="num">Published</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/advisories/${encodeURIComponent(row.id)}`}
                        className="link u-mono text-[12.5px]"
                      >
                        {row.id}
                      </Link>
                      <SeverityTag severity={row.severity} compact />
                      {!row.verified ? <Tag tone="quiet">synthetic</Tag> : null}
                    </div>
                    <p className="mt-1 max-w-[62ch] truncate text-[12.5px] text-lichen">{row.title}</p>
                  </td>
                  <td className="u-mono text-[11.5px] text-lichen">
                    {row.affectedPackages.slice(0, 2).join(", ")}
                    {row.affectedPackages.length > 2 ? ` +${row.affectedPackages.length - 2}` : ""}
                  </td>
                  <td className="num text-bone">{row.cvss.toFixed(1)}</td>
                  <td className="num text-[12px] text-lichen">{relativeDay(row.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </Section>
    </Page>
  );
}
