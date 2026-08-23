import Link from "next/link";
import { Suspense } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import {
  EmptyState,
  Meter,
  Page,
  PageHeader,
  Panel,
  Section,
  SeverityTag,
  TableSkeleton,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import type {
  ChokepointRow,
  InheritedExposureRow,
  MaintainerRiskRow,
  Severity,
  TyposquatRow,
} from "@/lib/domain/types";
import { compactNumber, packageHref, relativeDay } from "@/lib/format";
import { chokepoints, inheritedExposure, maintainerBlastRadius, typosquats } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Structural risk",
  description: "Chokepoints, maintainer blast radius, typosquat adjacency and inherited exposure.",
};

async function Chokepoints() {
  const result = await load(() =>
    runQuery<typeof chokepoints.params, ChokepointRow>(chokepoints, {
      maxBusFactor: 2,
      minServices: 2,
      limit: 14,
    }),
  );
  if (!result.ok) return <ErrorState error={result.error} retryHref="/risk" />;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No chokepoints"
        body="Every package beneath two or more services has at least three maintainers. Unusual, and good."
      />
    );
  }

  const max = Math.max(1, ...result.data.map((row) => row.riskScore));

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Package</th>
              <th>Maintainers</th>
              <th className="num">Services beneath</th>
              <th className="num">Tier 1</th>
              <th className="num">Risk</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.packageKey}>
                <td>
                  <Link href={packageHref(row.packageKey)} className="link u-mono text-[12.5px]">
                    {row.name}
                  </Link>
                  <div className="mt-1 flex items-center gap-2">
                    <Tag tone="quiet">{row.ecosystem}</Tag>
                    <span className="u-mono text-[10.5px] text-lichen-faint">
                      {compactNumber(row.weeklyDownloads)}/wk
                    </span>
                  </div>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {row.maintainerHandles.map((handle) => (
                      <Link
                        key={handle}
                        href={`/explorer?seed=maintainer&id=${encodeURIComponent(handle)}`}
                        className="u-mono text-[11px] text-chalk hover:text-chalk-bright"
                      >
                        {handle}
                      </Link>
                    ))}
                  </div>
                  {row.maintainersWithout2fa > 0 ? (
                    <div className="mt-1.5">
                      <Tag tone="warn">{row.maintainersWithout2fa} without 2FA</Tag>
                    </div>
                  ) : null}
                </td>
                <td className="num text-bone">{row.dependentServices}</td>
                <td className="num">
                  {row.criticalServices > 0 ? (
                    <span className="u-num text-critical">{row.criticalServices}</span>
                  ) : (
                    <span className="u-num text-lichen-faint">—</span>
                  )}
                </td>
                <td className="num">
                  <Meter value={row.riskScore} max={max} tone="var(--sev-high)" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function Maintainers() {
  const result = await load(() =>
    runQuery<typeof maintainerBlastRadius.params, MaintainerRiskRow>(maintainerBlastRadius, {
      minServices: 3,
      limit: 12,
    }),
  );
  if (!result.ok) return null;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No individual reaches three services"
        body="No single registry account sits beneath enough of the estate to be worth modelling as a compromise scenario."
      />
    );
  }

  const max = Math.max(1, ...result.data.map((row) => row.dependentServices));

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Packages they can publish</th>
              <th className="num">Services reachable</th>
              <th className="num">Tier 1</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={row.handle}>
                <td>
                  <Link
                    href={`/explorer?seed=maintainer&id=${encodeURIComponent(row.handle)}`}
                    className="link u-mono text-[12.5px]"
                  >
                    {row.handle}
                  </Link>
                  <p className="mt-0.5 text-[12px] text-lichen">{row.name}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {row.twoFactorEnabled ? <Tag tone="quiet">2FA on</Tag> : <Tag tone="warn">no 2FA</Tag>}
                    <span className="u-mono text-[10.5px] text-lichen-faint">
                      joined {relativeDay(row.joinedAt)}
                    </span>
                  </div>
                </td>
                <td className="u-mono max-w-[300px] text-[11.5px] text-lichen">
                  {row.topPackages.join(", ")}
                  {row.packages > row.topPackages.length ? ` +${row.packages - row.topPackages.length}` : ""}
                </td>
                <td className="num">
                  <Meter
                    value={row.dependentServices}
                    max={max}
                    tone={row.twoFactorEnabled ? "var(--chalk)" : "var(--sev-critical)"}
                  />
                </td>
                <td className="num text-bone-dim">{row.criticalServices}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function Typosquats() {
  const result = await load(() =>
    runQuery<typeof typosquats.params, TyposquatRow>(typosquats, { minServices: 1, limit: 20 }),
  );
  if (!result.ok) return null;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="Nothing name-adjacent"
        body="No registry entry within a short edit distance of a package we actually depend on."
      />
    );
  }

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Registry entry</th>
              <th>Looks like</th>
              <th>Why it matters</th>
              <th className="num">Services at risk</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((row) => (
              <tr key={`${row.suspectKey}->${row.legitKey}`}>
                <td>
                  <span className="u-mono text-[12.5px] text-high">{row.suspectName}</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Tag tone="quiet">{compactNumber(row.suspectDownloads)}/wk</Tag>
                    <span className="u-mono text-[10.5px] text-lichen-faint">
                      published {relativeDay(row.suspectFirstPublished)}
                    </span>
                  </div>
                </td>
                <td>
                  <Link href={packageHref(row.legitKey)} className="link u-mono text-[12.5px]">
                    {row.legitName}
                  </Link>
                  <div className="u-mono mt-1 text-[10.5px] text-lichen-faint">
                    {compactNumber(row.legitDownloads)}/wk
                  </div>
                </td>
                <td className="text-[12px] text-lichen">
                  <Tag tone="quiet">{row.kind}</Tag>
                  <span className="ml-2">
                    {row.editDistance} character{row.editDistance === 1 ? "" : "s"} apart
                    {row.suspectMaintainers.length
                      ? `, published by ${row.suspectMaintainers.join(", ")}`
                      : ""}
                  </span>
                </td>
                <td className="num text-bone">{row.servicesAtRisk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function Inherited() {
  const result = await load(() =>
    runQuery<typeof inheritedExposure.params, InheritedExposureRow>(inheritedExposure, {
      severities: ["CRITICAL", "HIGH"] as Severity[],
      limit: 20,
    }),
  );
  if (!result.ok) return null;
  if (result.data.length === 0) {
    return (
      <EmptyState
        title="No inherited exposure"
        body="Every tier-1 service that calls something exposed is exposed to the same thing itself, so there is no hidden second-order risk to surface."
      />
    );
  }

  return (
    <div className="space-y-3">
      {result.data.map((row) => (
        <Panel
          key={`${row.callerSlug}-${row.calleeSlug}-${row.advisoryId}`}
          padded={false}
          className="overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href={`/services/${row.callerSlug}`} className="link font-medium">
                {row.callerName}
              </Link>
              <TierMark tier={row.callerTier} />
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href={`/advisories/${encodeURIComponent(row.advisoryId)}`}
                className="link u-mono text-[12px]"
              >
                {row.advisoryId}
              </Link>
              <SeverityTag severity={row.severity} compact />
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="u-mono text-[12px] text-lichen">
              {row.callChain.map((slug, index) => (
                <span key={slug}>
                  {index > 0 ? <span className="text-lichen-faint"> → </span> : null}
                  <span className={index === row.callChain.length - 1 ? "text-critical" : "text-bone-dim"}>
                    {slug}
                  </span>
                </span>
              ))}
            </p>
            <p className="mt-2 text-[12.5px] text-lichen">
              <strong className="text-bone-dim">{row.callerName}</strong> is clean itself, but{" "}
              {row.callHops === 1 ? "calls" : `is ${row.callHops} calls away from`}{" "}
              <Link href={`/services/${row.calleeSlug}`} className="link">
                {row.calleeName}
              </Link>
              , which reaches{" "}
              <Link href={packageHref(row.packageKey)} className="link u-mono">
                {row.packageKey.split(":").slice(1).join(":")}
              </Link>
              .
            </p>
          </div>
        </Panel>
      ))}
    </div>
  );
}

export default function RiskPage() {
  return (
    <Page>
      <PageHeader
        eyebrow="Analysis"
        title="Risk that is structural, not incidental"
        lede="A CVE is an event. These four are properties of the shape of the graph — they are true today whether or not anything has been disclosed, and they are the reason the next event will be worse than it needs to be."
      />

      <Section
        title="Single-maintainer chokepoints"
        hint="Packages beneath at least two services with a bus factor of two or fewer. The score weights tier-1 reach and multiplies when nobody on the roster has two-factor enabled."
      >
        <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
          <Chokepoints />
        </Suspense>
      </Section>

      <Section
        title="Maintainer blast radius"
        hint="If this account were compromised tomorrow, how much of the estate could one malicious release reach? Five relationship types in one traversal: person, package, release, dependency closure, service."
      >
        <Suspense fallback={<TableSkeleton rows={6} cols={4} />}>
          <Maintainers />
        </Suspense>
      </Section>

      <Section
        title="Typosquat radar"
        hint="Name similarity is stored as an edge, so this is a two-hop walk rather than a self-join with an edit-distance predicate across the whole registry."
      >
        <Suspense fallback={<TableSkeleton rows={6} cols={4} />}>
          <Typosquats />
        </Suspense>
      </Section>

      <Section
        title="Inherited exposure"
        hint="Tier-1 services that are clean in their own dependency tree but call something that is not. Two independent traversals — the call graph and the dependency graph — composed in a single statement."
      >
        <Suspense fallback={<TableSkeleton rows={4} cols={3} />}>
          <Inherited />
        </Suspense>
      </Section>
    </Page>
  );
}
