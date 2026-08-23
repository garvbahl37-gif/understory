import Link from "next/link";
import { Suspense } from "react";

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
  TableSkeleton,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import type { Severity } from "@/lib/domain/types";
import {
  compactNumber,
  ecosystemLabel,
  formatDay,
  packageHref,
  plainNumber,
  relativeDay,
} from "@/lib/format";
import { packageDependents, packageDetail, packageDownstreamServices } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery, runQuerySingle } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

type Detail = {
  key: string;
  name: string;
  ecosystem: string;
  description: string;
  repoUrl: string;
  weeklyDownloads: number;
  firstPublished: string;
  deprecated: boolean;
  versions: Array<{
    key: string;
    version: string;
    publishedAt: string;
    yanked: boolean;
    license: string | null;
    licenseCategory: string | null;
    advisories: Array<{ id: string; severity: Severity }>;
  }>;
  maintainers: Array<{
    handle: string;
    name: string;
    role: string;
    since: string;
    twoFactorEnabled: boolean;
    publicPackages: number;
  }>;
};
type DownstreamRow = {
  serviceSlug: string;
  serviceName: string;
  tier: string;
  teamName: string | null;
  hops: number;
  viaVersion: string;
  chain: string[];
};
type DependentRow = {
  packageKey: string;
  name: string;
  ecosystem: string;
  weeklyDownloads: number;
  dependentVersion: string;
  declaredRange: string;
  scope: string;
};

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: decodeURIComponent(key).split(":").slice(1).join(":") };
}

async function Downstream({ packageKey }: { packageKey: string }) {
  const result = await load(async () => {
    const [services, dependents] = await Promise.all([
      runQuery<typeof packageDownstreamServices.params, DownstreamRow>(packageDownstreamServices, {
        packageKey,
      }),
      runQuery<typeof packageDependents.params, DependentRow>(packageDependents, { packageKey, limit: 40 }),
    ]);
    return { services, dependents };
  });

  if (!result.ok) return <ErrorState error={result.error} retryHref={packageHref(packageKey)} />;
  const { services, dependents } = result.data;

  return (
    <>
      <Section title="Reverse dependencies" hint="Other packages that pull this one in directly.">
        {dependents.length === 0 ? (
          <EmptyState
            title="Nothing depends on this"
            body="No other indexed package names this one. If a service uses it, it is a direct dependency there."
          />
        ) : (
          <Panel padded={false} className="overflow-hidden">
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>Package</th>
                    <th>Its release</th>
                    <th>Declared range</th>
                    <th className="num">Weekly</th>
                  </tr>
                </thead>
                <tbody>
                  {dependents.map((row) => (
                    <tr key={`${row.packageKey}@${row.dependentVersion}`}>
                      <td>
                        <Link href={packageHref(row.packageKey)} className="link u-mono text-[12.5px]">
                          {row.name}
                        </Link>
                      </td>
                      <td className="u-mono text-[12px] text-fg-muted">{row.dependentVersion}</td>
                      <td className="u-mono text-[11.5px] text-fg-subtle">{row.declaredRange}</td>
                      <td className="num text-fg-muted">{compactNumber(row.weeklyDownloads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}
      </Section>

      <Section
        title={`Services standing on this — ${plainNumber(services.length)}`}
        hint="Reverse reachability at unbounded depth. This is the question a registry page can never answer and a graph answers in one statement."
      >
        {services.length === 0 ? (
          <EmptyState
            title="Nothing we run reaches this package"
            body="It is indexed, but no service's dependency closure touches it within six hops."
          />
        ) : (
          <div className="space-y-3">
            {services.map((row) => (
              <Panel key={row.serviceSlug} padded={false} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/services/${row.serviceSlug}`} className="link font-medium">
                      {row.serviceName}
                    </Link>
                    <TierMark tier={row.tier} />
                  </div>
                  <span className="u-num text-[11.5px] text-fg-subtle">
                    {row.teamName ?? "unowned"} · {row.hops} {row.hops === 1 ? "hop" : "hops"}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <Strata
                    rows={chainToStrata(row.serviceName, `/services/${row.serviceSlug}`, row.chain, {
                      flagLast: false,
                      endNote: "this package",
                    })}
                  />
                </div>
              </Panel>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

export default async function PackagePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const packageKey = decodeURIComponent(key);

  const head = await load(() =>
    runQuerySingle<typeof packageDetail.params, Detail>(packageDetail, { packageKey }),
  );

  if (!head.ok) {
    return (
      <Page>
        <PageHeader eyebrow="Package" title={packageKey} />
        <ErrorState error={head.error} retryHref={packageHref(packageKey)} />
      </Page>
    );
  }

  const pkg = head.data;
  if (!pkg) {
    return (
      <MissingEntity
        kind="package"
        identifier={packageKey}
        browseHref="/packages"
        browseLabel="Browse packages"
      />
    );
  }

  const soleMaintainer = pkg.maintainers.length === 1;
  const without2fa = pkg.maintainers.filter((m) => !m.twoFactorEnabled).length;
  const vulnerableReleases = pkg.versions.filter((v) => v.advisories.length > 0).length;

  return (
    <Page>
      <PageHeader
        eyebrow={
          <>
            <Link href="/packages" className="link">
              Packages
            </Link>{" "}
            / {ecosystemLabel(pkg.ecosystem)}
          </>
        }
        title={<span className="u-mono text-[26px] sm:text-[30px]">{pkg.name}</span>}
        lede={pkg.description}
        actions={
          <Link href={`/explorer?seed=package&id=${encodeURIComponent(pkg.key)}`} className="btn">
            Open in explorer
          </Link>
        }
      />

      <div className="stagger mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Weekly downloads"
          value={compactNumber(pkg.weeklyDownloads)}
          sub={`first published ${relativeDay(pkg.firstPublished)}`}
        />
        <Stat
          label="Releases indexed"
          value={pkg.versions.length}
          sub={`${vulnerableReleases} carry an advisory`}
          tone={vulnerableReleases > 0 ? "high" : "neutral"}
        />
        <Stat
          label="Bus factor"
          value={pkg.maintainers.length}
          tone={soleMaintainer ? "critical" : "neutral"}
          sub={soleMaintainer ? "one person can publish anything" : `${without2fa} without 2FA`}
        />
        <Stat
          label="Registry"
          value={ecosystemLabel(pkg.ecosystem)}
          sub={pkg.deprecated ? "marked deprecated" : "actively published"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section
          title="Release history"
          hint="Newest first. Licence is recorded per release, because packages relicense."
        >
          <Panel padded={false} className="overflow-hidden">
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Published</th>
                    <th>Licence</th>
                    <th>Advisories</th>
                  </tr>
                </thead>
                <tbody>
                  {pkg.versions.map((version) => (
                    <tr key={version.key}>
                      <td className="u-mono text-[12.5px] text-fg">{version.version}</td>
                      <td className="text-[12px] text-fg-subtle">{formatDay(version.publishedAt)}</td>
                      <td>
                        <span className="u-mono text-[11.5px] text-fg-muted">{version.license ?? "—"}</span>
                        {version.licenseCategory && version.licenseCategory !== "permissive" ? (
                          <div className="mt-0.5">
                            <Tag tone="warn">{version.licenseCategory}</Tag>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {version.advisories.length === 0 ? (
                          <span className="text-[12px] text-fg-ghost">clean</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {version.advisories.map((advisory) => (
                              <Link key={advisory.id} href={`/advisories/${encodeURIComponent(advisory.id)}`}>
                                <SeverityTag severity={advisory.severity} compact />
                              </Link>
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

        <Section title="Who can publish" hint="Everyone here can push a release that lands in production.">
          <Panel padded={false} className="overflow-hidden">
            <ul>
              {pkg.maintainers.map((maintainer) => (
                <li key={maintainer.handle} className="border-b border-rule/60 px-4 py-3 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/explorer?seed=maintainer&id=${encodeURIComponent(maintainer.handle)}`}
                      className="link u-mono text-[12.5px]"
                    >
                      {maintainer.handle}
                    </Link>
                    <Tag tone={maintainer.role === "owner" ? "accent" : "quiet"}>{maintainer.role}</Tag>
                  </div>
                  <p className="mt-1 text-[12px] text-fg-subtle">{maintainer.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {maintainer.twoFactorEnabled ? (
                      <Tag tone="quiet">2FA on</Tag>
                    ) : (
                      <Tag tone="warn">no 2FA</Tag>
                    )}
                    <span className="u-mono text-[10.5px] text-fg-ghost">
                      {maintainer.publicPackages} packages
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <a
            href={pkg.repoUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="link mt-3 inline-block text-[12.5px]"
          >
            View on {ecosystemLabel(pkg.ecosystem)} ↗
          </a>
        </Section>
      </div>

      <Suspense fallback={<TableSkeleton rows={6} cols={4} />}>
        <Downstream packageKey={pkg.key} />
      </Suspense>
    </Page>
  );
}
