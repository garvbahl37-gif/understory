import Link from "next/link";
import { Suspense } from "react";

import { ErrorState } from "@/components/ui/ErrorState";
import { FilterBar } from "@/components/ui/FilterBar";
import {
  EmptyState,
  Meter,
  Page,
  PageHeader,
  Panel,
  Section,
  TableSkeleton,
  Tag,
  TierMark,
} from "@/components/ui/primitives";
import { SERVICE_TIERS, type ServiceSummary, type ServiceTier } from "@/lib/domain/types";
import { serviceList, teamList } from "@/lib/queries/catalog";
import { load } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Services",
  description: "Everything Meridian Pay runs, with the exposure hiding under each manifest.",
};

type TeamRow = {
  slug: string;
  name: string;
  mission: string;
  services: number;
  advisoryHits: number;
  criticalHits: number;
};

const FILTERS = [
  {
    param: "tier",
    label: "Tier",
    multiple: true,
    options: [
      { value: "critical", label: "tier 1" },
      { value: "standard", label: "tier 2" },
      { value: "internal", label: "internal" },
    ],
  },
];

async function ServiceTable({ tier, q }: { tier: string; q: string }) {
  const tiers = tier
    .split(",")
    .filter((v): v is ServiceTier => (SERVICE_TIERS as readonly string[]).includes(v));

  const result = await load(() =>
    runQuery<typeof serviceList.params, ServiceSummary>(serviceList, { tiers, search: q, limit: 100 }),
  );

  if (!result.ok) return <ErrorState error={result.error} retryHref="/services" />;
  const rows = result.data;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No service matches those filters"
        body="Clear the search or widen the tier filter."
      />
    );
  }

  const maxAdvisories = Math.max(1, ...rows.map((row) => row.advisories));

  return (
    <Panel padded={false} className="overflow-hidden">
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Owner</th>
              <th>Stack</th>
              <th className="num">Declared deps</th>
              <th className="num">Advisories reachable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.slug}>
                <td className="max-w-[340px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/services/${row.slug}`} className="link font-medium">
                      {row.name}
                    </Link>
                    {row.shipsExternally ? <Tag tone="warn">external</Tag> : null}
                  </div>
                  <p className="mt-1 text-[12px] leading-snug text-lichen">{row.description}</p>
                  <div className="mt-1.5">
                    <TierMark tier={row.tier} />
                  </div>
                </td>
                <td className="text-[12.5px] text-lichen">{row.teamName ?? "—"}</td>
                <td>
                  <Tag tone="quiet">{row.language}</Tag>
                </td>
                <td className="num text-bone-dim">{row.directDependencies}</td>
                <td className="num">
                  <Meter
                    value={row.advisories}
                    max={maxAdvisories}
                    tone={row.criticalAdvisories > 0 ? "var(--sev-critical)" : "var(--chalk)"}
                  />
                  {row.criticalAdvisories > 0 ? (
                    <div className="u-num mt-1 text-[10.5px] text-critical">
                      {row.criticalAdvisories} critical
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

async function Teams() {
  const result = await load(() => runQuery<typeof teamList.params, TeamRow>(teamList, {}));
  if (!result.ok) return null;

  const max = Math.max(1, ...result.data.map((row) => row.advisoryHits));

  return (
    <Section
      title="Exposure by team"
      hint="Ownership is one hop from a service; exposure is four hops past that. One statement walks both."
    >
      <Panel padded={false} className="overflow-hidden">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Remit</th>
                <th className="num">Services</th>
                <th className="num">Advisory hits</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((row) => (
                <tr key={row.slug}>
                  <td className="font-medium text-bone">{row.name}</td>
                  <td className="max-w-[380px] text-[12.5px] text-lichen">{row.mission}</td>
                  <td className="num text-bone-dim">{row.services}</td>
                  <td className="num">
                    <Meter
                      value={row.advisoryHits}
                      max={max}
                      tone={row.criticalHits > 0 ? "var(--sev-critical)" : "var(--chalk)"}
                    />
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

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; q?: string }>;
}) {
  const { tier = "", q = "" } = await searchParams;

  return (
    <Page>
      <PageHeader
        eyebrow="Inventory"
        title="What we run, and what it is standing on"
        lede="The declared-dependency count is what a team wrote down. The advisory count is what the graph found underneath it. The gap between those two numbers is the whole reason this application exists."
      />

      <Suspense fallback={null}>
        <FilterBar groups={FILTERS} searchParam="q" searchPlaceholder="Service name…" />
      </Suspense>

      <Suspense key={`${tier}|${q}`} fallback={<TableSkeleton rows={10} cols={5} />}>
        <ServiceTable tier={tier} q={q} />
      </Suspense>

      <div className="mt-8">
        <Suspense fallback={<TableSkeleton rows={6} cols={4} />}>
          <Teams />
        </Suspense>
      </div>
    </Page>
  );
}
