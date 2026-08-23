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
  Tag,
  TableSkeleton,
  TierMark,
} from "@/components/ui/primitives";
import type { BlastRadiusRow, Severity, UpgradeSuggestion } from "@/lib/domain/types";
import { ecosystemLabel, formatDay, packageHref, parseVersionKey, plainNumber } from "@/lib/format";
import { advisoryDetail, blastRadius, upgradePath } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery, runQuerySingle } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

type AdvisoryDetail = {
  id: string;
  source: string;
  title: string;
  summary: string;
  severity: Severity;
  cvss: number;
  cwe: string;
  publishedAt: string;
  exploitKnown: boolean;
  verified: boolean;
  reference: string | null;
  packages: Array<{
    packageKey: string;
    name: string;
    ecosystem: string;
    weeklyDownloads: number;
    versions: Array<{ version: string; key: string; publishedAt: string; fixedIn: string | null }>;
  }>;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: decodeURIComponent(id), description: `Blast radius for ${decodeURIComponent(id)}.` };
}

async function BlastRadius({ advisoryId }: { advisoryId: string }) {
  const result = await load(async () => {
    const rows = await runQuery<typeof blastRadius.params, BlastRadiusRow>(blastRadius, {
      advisoryId,
      maxDepth: 6,
      scopes: [],
      tiers: [],
    });

    // Remediation is a second traversal, over the release chain rather than the
    // dependency chain. Only ask for it once, against the deepest hit.
    const worst = rows.length ? rows.reduce((a, b) => (b.hops > a.hops ? b : a)) : null;
    const upgrade = worst
      ? await runQuerySingle<typeof upgradePath.params, UpgradeSuggestion>(upgradePath, {
          advisoryId,
          versionKey: worst.vulnerableVersion,
        })
      : null;

    return { rows, upgrade };
  });

  if (!result.ok)
    return <ErrorState error={result.error} retryHref={`/advisories/${encodeURIComponent(advisoryId)}`} />;

  const { rows, upgrade } = result.data;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing we run can reach this"
        body="No service has this advisory's affected releases anywhere in its dependency closure, to a depth of six hops. That is the good outcome — the advisory is indexed, and you are not exposed to it."
      />
    );
  }

  const bins = Array.from({ length: 7 }, (_, depth) => ({
    depth,
    count: rows.filter((row) => row.hops === depth).length,
  }));
  const teams = new Map<string, number>();
  for (const row of rows)
    teams.set(row.teamName ?? "Unowned", (teams.get(row.teamName ?? "Unowned") ?? 0) + 1);

  return (
    <>
      <div className="mb-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel>
          <p className="u-eyebrow mb-3">How deep it sits</p>
          <DepthHistogram bins={bins} />
        </Panel>

        <Panel>
          <p className="u-eyebrow mb-3">Remediation</p>
          {upgrade?.fixedVersion ? (
            <>
              <p className="text-[13px] leading-relaxed text-fg-muted">
                The nearest clean release is{" "}
                <Link
                  href={packageHref(parseVersionKey(upgrade.fixedVersion).packageKey)}
                  className="link u-mono"
                >
                  {parseVersionKey(upgrade.fixedVersion).packageName}@{upgrade.fixedSemver}
                </Link>
                , <strong className="text-fg">{upgrade.releasesAhead}</strong>{" "}
                {upgrade.releasesAhead === 1 ? "release" : "releases"} ahead of the version in the deepest
                path.
              </p>
              <div className="panel-sunken mt-3 px-3 py-2.5">
                <p className="u-mono text-[11.5px] leading-relaxed text-fg-subtle">
                  {upgrade.releaseChain
                    .slice()
                    .reverse()
                    .map((version, index, all) => (
                      <span key={version}>
                        <span className={index === all.length - 1 ? "text-low" : "text-fg-muted"}>
                          {version}
                        </span>
                        {index < all.length - 1 ? <span className="text-fg-ghost"> → </span> : null}
                      </span>
                    ))}
                </p>
              </div>
              <p className="mt-3 text-[11.5px] text-fg-subtle">
                Found by walking the SUPERSEDES chain from the affected release forward until a version this
                advisory does not touch — not by parsing the fix note.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-fg-subtle">
              No unaffected release of the affected package exists in the graph yet. Pin, patch or vendor.
            </p>
          )}
        </Panel>
      </div>

      <Section
        title={`Affected services — ${plainNumber(rows.length)}`}
        hint="Each row shows the shortest chain from the service's own manifest down to the vulnerable release. Nothing here was precomputed; the paths came back with the query."
      >
        <div className="space-y-3">
          {rows.map((row) => (
            <Panel key={row.serviceSlug} padded={false} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/services/${row.serviceSlug}`} className="link text-[14px] font-medium">
                    {row.serviceName}
                  </Link>
                  <TierMark tier={row.tier} />
                  {row.shipsExternally ? <Tag tone="warn">customer-facing</Tag> : null}
                </div>
                <div className="flex items-center gap-3 text-[11.5px] text-fg-subtle">
                  <span>{row.teamName ?? "unowned"}</span>
                  <span className="u-mono text-fg-ghost">·</span>
                  <span className="u-num">
                    {row.hops} {row.hops === 1 ? "hop" : "hops"}
                  </span>
                  {row.distinctRoutes > 1 ? (
                    <>
                      <span className="u-mono text-fg-ghost">·</span>
                      <span className="u-num">{row.distinctRoutes} routes</span>
                    </>
                  ) : null}
                  <Tag tone="quiet">{row.scope}</Tag>
                </div>
              </div>
              <div className="px-4 py-3">
                <Strata rows={chainToStrata(row.serviceName, `/services/${row.serviceSlug}`, row.chain)} />
              </div>
            </Panel>
          ))}
        </div>
      </Section>

      <Section title="By owning team" hint="Who needs to be in the room.">
        <Panel>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...teams.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([team, count]) => (
                <li
                  key={team}
                  className="flex items-baseline justify-between gap-3 border-b border-rule/60 pb-1.5"
                >
                  <span className="text-[13px] text-fg-muted">{team}</span>
                  <span className="u-num text-[13px] text-fg">{count}</span>
                </li>
              ))}
          </ul>
        </Panel>
      </Section>
    </>
  );
}

export default async function AdvisoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const advisoryId = decodeURIComponent(id);

  const head = await load(() =>
    runQuerySingle<typeof advisoryDetail.params, AdvisoryDetail>(advisoryDetail, { advisoryId }),
  );

  if (!head.ok) {
    return (
      <Page>
        <PageHeader eyebrow="Advisory" title={advisoryId} />
        <ErrorState error={head.error} retryHref={`/advisories/${encodeURIComponent(advisoryId)}`} />
      </Page>
    );
  }

  const advisory = head.data;
  if (!advisory) {
    return (
      <MissingEntity
        kind="advisory"
        identifier={advisoryId}
        browseHref="/advisories"
        browseLabel="Browse advisories"
      />
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/advisories" className="link">
              Advisories
            </Link>{" "}
            / {advisory.source}
          </>
        }
        title={advisory.title}
        actions={
          <>
            <SeverityTag severity={advisory.severity} />
            <Link href={`/explorer?seed=advisory&id=${encodeURIComponent(advisory.id)}`} className="btn">
              Open in explorer
            </Link>
          </>
        }
      />

      <div className="mb-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <p className="u-mono mb-2 text-[13px] text-accent">{advisory.id}</p>
          <p className="text-[14px] leading-relaxed text-fg-muted">{advisory.summary}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {advisory.exploitKnown ? <Tag tone="warn">exploitation observed</Tag> : null}
            {advisory.verified ? (
              <Tag tone="quiet">published record</Tag>
            ) : (
              <Tag tone="quiet">synthetic record — generated for this demo</Tag>
            )}
            <Tag tone="quiet">{advisory.cwe}</Tag>
          </div>
          {advisory.reference ? (
            <a
              href={advisory.reference}
              target="_blank"
              rel="noreferrer noopener"
              className="link mt-4 inline-block text-[12.5px]"
            >
              Read the NVD entry ↗
            </a>
          ) : null}
        </Panel>

        <Panel>
          <dl className="space-y-3 text-[12.5px]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-subtle">CVSS</dt>
              <dd className="u-num text-[18px] text-fg">{advisory.cvss.toFixed(1)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
              <dt className="text-fg-subtle">Published</dt>
              <dd className="text-fg-muted">{formatDay(advisory.publishedAt)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rule pt-3">
              <dt className="text-fg-subtle">Affected releases</dt>
              <dd className="u-num text-fg-muted">
                {advisory.packages.reduce((sum, pkg) => sum + pkg.versions.length, 0)}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <Section title="Affected packages" hint="The releases this advisory covers, and where the fix landed.">
        <div className="grid gap-3 md:grid-cols-2">
          {advisory.packages.map((pkg) => (
            <Panel key={pkg.packageKey}>
              <div className="flex items-start justify-between gap-3">
                <Link href={packageHref(pkg.packageKey)} className="link u-mono text-[13px]">
                  {pkg.name}
                </Link>
                <Tag tone="quiet">{ecosystemLabel(pkg.ecosystem)}</Tag>
              </div>
              <ul className="mt-3 space-y-1">
                {pkg.versions.map((version) => (
                  <li
                    key={version.key}
                    className="u-mono flex items-baseline justify-between gap-3 text-[11.5px]"
                  >
                    <span className="text-critical">{version.version}</span>
                    <span className="text-fg-ghost">affected</span>
                  </li>
                ))}
              </ul>
              {pkg.versions[0]?.fixedIn ? (
                <p className="u-mono mt-3 border-t border-rule pt-2.5 text-[11.5px] text-low">
                  fixed in {pkg.versions[0].fixedIn}
                </p>
              ) : null}
            </Panel>
          ))}
        </div>
      </Section>

      <Suspense fallback={<TableSkeleton rows={5} cols={3} />}>
        <BlastRadius advisoryId={advisory.id} />
      </Suspense>
    </Page>
  );
}
