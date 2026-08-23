import Link from "next/link";
import { Suspense } from "react";

import { SeverityComposition } from "@/components/ui/charts";
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
  Skeleton,
  Stat,
  StatSkeleton,
  TableSkeleton,
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

/**
 * The page is split into three regions, each with its own Suspense boundary,
 * so the shell paints immediately and the expensive traversals stream in as
 * they land rather than holding the whole document hostage to the slowest one.
 */

async function Hero() {
  const result = await load(async () => {
    // The headline is whichever advisory currently reaches the most services.
    const advisories = await runQuery<typeof advisoryList.params, AdvisorySummary>(advisoryList, {
      severities: [],
      search: "",
      limit: 40,
    });
    const headline = advisories[0] ?? null;
    const radius = headline
      ? await runQuery<typeof blastRadius.params, BlastRadiusRow>(blastRadius, {
          advisoryId: headline.id,
          maxDepth: 6,
          scopes: [],
          tiers: [],
        })
      : [];
    return { headline, radius };
  });

  if (!result.ok) return <ErrorState error={result.error} retryHref="/" />;
  const { headline, radius } = result.data;

  // The most instructive row is the deepest one: the service that had no idea.
  const deepest = radius.length
    ? radius.reduce((worst, row) => (row.hops > worst.hops ? row : worst), radius[0])
    : null;

  if (!headline || !deepest) {
    return (
      <EmptyState
        title="Nothing is exposed"
        body="No advisory in the graph reaches a service through any dependency chain. Either the graph has not been seeded yet, or you have had an unusually good week."
      />
    );
  }

  return (
    <Panel padded={false} className="panel-lifted overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-3">
        <span className="u-eyebrow">Deepest live exposure</span>
        <div className="flex items-center gap-2">
          <SeverityTag severity={headline.severity} />
          {headline.exploitKnown ? <Tag tone="warn">exploit known</Tag> : null}
          {headline.verified ? (
            <Tag tone="quiet" title="A real, published advisory. Its page links to the NVD entry.">
              published CVE
            </Tag>
          ) : (
            <Tag
              tone="quiet"
              title="Generated for this demo to give the graph realistic density. The package and the dependency chain below it are real."
            >
              synthetic advisory
            </Tag>
          )}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="px-5 py-5">
          <p className="text-[13px] text-fg-subtle">
            <Link href={`/advisories/${encodeURIComponent(headline.id)}`} className="link u-mono">
              {headline.id}
            </Link>{" "}
            reaches <strong className="text-fg">{deepest.serviceName}</strong> from{" "}
            <strong className="text-fg">{deepest.hops} hops</strong> below its manifest. Nobody on{" "}
            {deepest.teamName ?? "the owning team"} typed this package&apos;s name.
          </p>

          <div className="panel-sunken mt-4 px-4 py-3.5">
            <Strata
              rows={chainToStrata(deepest.serviceName, `/services/${deepest.serviceSlug}`, deepest.chain)}
            />
          </div>

          <p className="mt-4 max-w-[64ch] text-[13px] leading-relaxed text-fg-subtle">{headline.title}</p>
        </div>

        <div className="border-t border-rule px-5 py-5 lg:border-l lg:border-t-0">
          <p className="u-eyebrow mb-3">Blast radius</p>
          <p className="u-num text-[40px] leading-none text-fg">{radius.length}</p>
          <p className="mt-1.5 text-[12px] text-fg-subtle">
            services affected · {radius.filter((r) => r.tier === "critical").length} of them tier 1
          </p>

          <dl className="mt-5 space-y-2.5 border-t border-rule pt-4 text-[12px]">
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Deepest path</dt>
              <dd className="u-num text-fg">{deepest.hops} hops</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Owning teams</dt>
              <dd className="u-num text-fg">{new Set(radius.map((r) => r.teamSlug).filter(Boolean)).size}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-fg-subtle">Customer-facing</dt>
              <dd className="u-num text-fg">{radius.filter((r) => r.shipsExternally).length}</dd>
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
  );
}

async function Census() {
  const result = await load(async () => {
    const [labels, types, severities] = await Promise.all([
      runQuery<typeof nodeCounts.params, LabelCount>(nodeCounts, {}),
      runQuery<typeof relationshipCounts.params, TypeCount>(relationshipCounts, {}),
      runQuery<typeof severityBreakdown.params, SeverityRow>(severityBreakdown, {}),
    ]);
    return { labels, types, severities };
  });

  if (!result.ok) return <ErrorState error={result.error} retryHref="/" />;
  const { labels, types, severities } = result.data;

  const nodeTotal = labels.reduce((sum, row) => sum + row.count, 0);
  const relTotal = types.reduce((sum, row) => sum + row.count, 0);
  const advisoryTotal = severities.reduce((sum, row) => sum + row.advisories, 0);
  const criticalCount = severities.find((row) => row.severity === "CRITICAL")?.advisories ?? 0;

  return (
    <>
      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          sub="published CVEs and synthetic records"
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

      <div className="panel mt-3 px-5 py-4">
        <p className="u-eyebrow mb-3">Advisory backlog by severity</p>
        <SeverityComposition data={severities} total={advisoryTotal} />
      </div>
    </>
  );
}

async function Leaderboards() {
  const result = await load(async () => {
    const [exposed, reach, recent] = await Promise.all([
      runQuery<typeof exposedServices.params, ExposedService>(exposedServices, { limit: 6 }),
      runQuery<typeof topReachPackages.params, ReachRow>(topReachPackages, { limit: 6 }),
      runQuery<typeof recentAdvisories.params, RecentRow>(recentAdvisories, { limit: 5 }),
    ]);
    return { exposed, reach, recent };
  });

  if (!result.ok) return <ErrorState error={result.error} retryHref="/" />;
  const { exposed, reach, recent } = result.data;
  const maxReach = Math.max(1, ...reach.map((row) => row.dependentServices));

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Most exposed services"
          hint="Counting advisories anywhere in the resolved dependency tree, not just the manifest."
        >
          {exposed.length === 0 ? (
            <EmptyState title="Nothing is exposed" body="No service can reach a known-vulnerable release." />
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
                      <td className="text-[12.5px] text-fg-subtle">{row.teamName ?? "—"}</td>
                      <td className="num">
                        <span className="u-num text-fg">{row.advisories}</span>
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
          hint="Packages the largest number of services can reach. A bad release here is everyone's problem."
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
                        <span className="u-mono text-[10.5px] text-fg-faint">
                          {compactNumber(row.weeklyDownloads)}/wk
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      <Meter
                        value={row.dependentServices}
                        max={maxReach}
                        tone={row.criticalServices > 0 ? "var(--sev-high)" : "var(--accent)"}
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
          <div className="scroll-x">
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
                      <p className="mt-1 max-w-[62ch] truncate text-[12.5px] text-fg-subtle">{row.title}</p>
                    </td>
                    <td className="u-mono text-[11.5px] text-fg-subtle">
                      {row.affectedPackages.slice(0, 2).join(", ")}
                      {row.affectedPackages.length > 2 ? ` +${row.affectedPackages.length - 2}` : ""}
                    </td>
                    <td className="num text-fg">{row.cvss.toFixed(1)}</td>
                    <td className="num text-[12px] text-fg-subtle">{relativeDay(row.publishedAt)}</td>
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

export default function OverviewPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Meridian Pay · production estate"
        title="See what your software is standing on"
        lede="Forty-four services and a few thousand releases, held as one graph. Every number on this page is a Cypher traversal run when you loaded it — the expensive ones stream in as they land."
      />

      <section className="rise mb-9">
        <Suspense fallback={<HeroSkeleton />}>
          <Hero />
        </Suspense>
      </section>

      <Section title="The graph right now">
        <Suspense fallback={<StatSkeleton />}>
          <Census />
        </Suspense>
      </Section>

      <Suspense fallback={<TableSkeleton rows={6} cols={3} />}>
        <Leaderboards />
      </Suspense>
    </Page>
  );
}

function HeroSkeleton() {
  return (
    <div className="panel overflow-hidden" role="status" aria-label="Loading the deepest live exposure">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="h-4 w-24 rounded-full" />
      </div>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3 px-5 py-5">
          <Skeleton className="h-3 w-4/5" />
          <div className="panel-sunken space-y-2.5 px-4 py-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-2 w-3" />
                <Skeleton className="h-3 rounded-sm" style={{ width: `${44 + i * 11}%` }} />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 border-t border-rule px-5 py-5 lg:border-l lg:border-t-0">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-2.5 w-36" />
          <Skeleton className="mt-6 h-8 w-full" />
        </div>
      </div>
    </div>
  );
}
