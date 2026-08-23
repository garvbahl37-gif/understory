import Link from "next/link";

import { ErrorState } from "@/components/ui/ErrorState";
import { Page, PageHeader, Panel, Section, Tag } from "@/components/ui/primitives";
import { NODE_LABELS, RELATIONSHIP_TYPES, type LabelCount, type TypeCount } from "@/lib/domain/types";
import { plainNumber } from "@/lib/format";
import { nodeCounts, relationshipCounts } from "@/lib/queries/catalog";
import { loadAll } from "@/lib/queries/load";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Data model",
  description: "The labels, relationship types and properties that make up the supply chain graph.",
};

const LABEL_NOTES: Record<string, { blurb: string; keys: string; props: string }> = {
  Team: {
    blurb: "A group that owns services and answers the page.",
    keys: "slug",
    props: "name, mission, headcount",
  },
  Service: {
    blurb: "Something Meridian Pay runs. The surface of the graph.",
    keys: "slug",
    props: "name, tier, language, ecosystem, shipsExternally, repo, deployedAt",
  },
  Package: {
    blurb: "A registry entry, identified across five ecosystems by one key.",
    keys: "key (ecosystem:name)",
    props: "name, ecosystem, description, weeklyDownloads, repoUrl, firstPublished, deprecated, suspicious",
  },
  Version: {
    blurb:
      "One published release. Dependencies are edges between these, not between packages — which is the whole reason the depth numbers are trustworthy.",
    keys: "key (ecosystem:name@semver)",
    props: "packageKey, version, major, minor, patch, publishedAt, yanked",
  },
  Maintainer: {
    blurb: "A registry account that can publish a release.",
    keys: "handle",
    props: "name, joinedAt, twoFactorEnabled, publicPackages",
  },
  Advisory: {
    blurb:
      "A published CVE or a synthetic record generated for this demo. The distinction is a property, not a guess.",
    keys: "id",
    props: "source, title, summary, severity, cvss, cwe, publishedAt, exploitKnown, verified, reference",
  },
  License: {
    blurb: "An SPDX licence with the obligation it creates.",
    keys: "spdxId",
    props: "name, category, osiApproved, obligation",
  },
};

const REL_NOTES: Record<string, { from: string; to: string; blurb: string; props?: string }> = {
  OWNS: { from: "Team", to: "Service", blurb: "Who answers for it." },
  CALLS: {
    from: "Service",
    to: "Service",
    blurb: "The runtime call graph — a second network over the same nodes.",
    props: "protocol, criticality",
  },
  USES: {
    from: "Service",
    to: "Version",
    blurb: "A declared dependency, resolved to a concrete release.",
    props: "scope, declaredRange, lockfile",
  },
  HAS_VERSION: { from: "Package", to: "Version", blurb: "Release history." },
  DEPENDS_ON: {
    from: "Version",
    to: "Version",
    blurb: "The edge every interesting query in this application traverses.",
    props: "scope, declaredRange",
  },
  SUPERSEDES: {
    from: "Version",
    to: "Version",
    blurb: "Newer release to older. Turns 'what should I upgrade to?' into a shortest path.",
  },
  LICENSED_UNDER: {
    from: "Version",
    to: "License",
    blurb: "Per release, because packages relicense mid-history.",
  },
  MAINTAINS: { from: "Maintainer", to: "Package", blurb: "Who can publish.", props: "role, since" },
  PUBLISHED: { from: "Maintainer", to: "Version", blurb: "Who actually pushed this one.", props: "at" },
  AFFECTS: {
    from: "Advisory",
    to: "Version",
    blurb: "Which exact releases are vulnerable.",
    props: "introducedIn, fixedIn",
  },
  SIMILAR_TO: {
    from: "Package",
    to: "Package",
    blurb: "Name adjacency, computed at load time and stored as an edge.",
    props: "distance, kind",
  },
};

export default async function ModelPage() {
  const result = await loadAll({
    labels: runQuery<typeof nodeCounts.params, LabelCount>(nodeCounts, {}),
    types: runQuery<typeof relationshipCounts.params, TypeCount>(relationshipCounts, {}),
  });

  const labelCount = new Map(result.ok ? result.data.labels.map((row) => [row.label, row.count]) : []);
  const typeCount = new Map(result.ok ? result.data.types.map((row) => [row.type, row.count]) : []);

  return (
    <Page>
      <PageHeader
        eyebrow="Under the hood"
        title="Seven labels, eleven edges"
        lede="The model is deliberately small. Everything interesting comes from the fact that these pieces connect — a service reaches a licence through five hops of dependency, and a person reaches a service through four. Adding a new kind of edge here costs one pattern, not one migration."
      />

      <Section title="Shape">
        <Panel className="overflow-x-auto">
          <pre className="u-mono min-w-[640px] text-[11.5px] leading-[1.75] text-bone-dim">
            {`                        ┌──────────┐
                        │   Team   │
                        └────┬─────┘
                             │ OWNS
                             ▼
        CALLS  ┌─────────────────────────┐
     ┌────────▶│         Service         │
     └─────────┤  tier · shipsExternally │
               └────────────┬────────────┘
                            │ USES  {scope, declaredRange, lockfile}
                            ▼
  ┌──────────┐  HAS_VERSION  ┌─────────────────────┐   DEPENDS_ON
  │ Package  │──────────────▶│       Version       │◀────────────┐
  │  key     │               │  key · publishedAt  │─────────────┘
  └────┬─────┘               └──┬──────────┬───┬───┘   {scope, range}
       │ ▲                      │          │   │
       │ │ MAINTAINS            │ SUPERSEDES   │ LICENSED_UNDER
       │ │ {role, since}        │ (newer→older)│
       │ │                      ▼          │   ▼
       │ │                 ┌─────────┐     │  ┌──────────┐
       │ │                 │ Version │     │  │ License  │
       │ │                 └─────────┘     │  │ category │
       │ │                                 │  └──────────┘
       │ │  ┌─────────────┐   PUBLISHED    │
       │ └──┤ Maintainer  │────────────────┘
       │    │ twoFactor   │
       │    └─────────────┘
       │
       │ SIMILAR_TO {distance, kind}        ┌──────────────┐
       └───────────▶ Package                │   Advisory   │
                                            │ severity·cvss│
                            AFFECTS ────────┴──────┬───────┘
                        {introducedIn, fixedIn}    │
                                                   ▼
                                              Version`}
          </pre>
        </Panel>
      </Section>

      {!result.ok ? (
        <div className="mb-8">
          <ErrorState error={result.error} retryHref="/model" />
        </div>
      ) : null}

      <Section title="Node labels" hint="Counts are live from the database.">
        <div className="grid gap-3 md:grid-cols-2">
          {NODE_LABELS.map((label) => {
            const note = LABEL_NOTES[label];
            return (
              <Panel key={label}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="u-mono text-[14px] text-chalk">{label}</h3>
                  <span className="u-num text-[13px] text-bone">
                    {plainNumber(labelCount.get(label) ?? 0)}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{note?.blurb}</p>
                <dl className="mt-3 space-y-1.5 border-t border-rule pt-3 text-[11.5px]">
                  <div className="flex gap-3">
                    <dt className="w-16 shrink-0 text-lichen">key</dt>
                    <dd className="u-mono text-bone-dim">{note?.keys}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="w-16 shrink-0 text-lichen">props</dt>
                    <dd className="u-mono break-words text-lichen">{note?.props}</dd>
                  </div>
                </dl>
              </Panel>
            );
          })}
        </div>
      </Section>

      <Section title="Relationship types">
        <Panel padded={false} className="overflow-hidden">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From → to</th>
                  <th>What it means</th>
                  <th>Properties</th>
                  <th className="num">Count</th>
                </tr>
              </thead>
              <tbody>
                {RELATIONSHIP_TYPES.map((type) => {
                  const note = REL_NOTES[type];
                  return (
                    <tr key={type}>
                      <td className="u-mono text-[12px] text-chalk">{type}</td>
                      <td className="u-mono whitespace-nowrap text-[11.5px] text-bone-dim">
                        {note?.from} → {note?.to}
                      </td>
                      <td className="max-w-[400px] text-[12.5px] text-lichen">{note?.blurb}</td>
                      <td className="u-mono text-[11px] text-lichen-faint">{note?.props ?? "—"}</td>
                      <td className="num text-bone-dim">{plainNumber(typeCount.get(type) ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>

      <Section
        title="Constraints and indexes"
        hint="Created by the loader; a uniqueness constraint is also the index that makes every key lookup a seek."
      >
        <Panel>
          <pre className="u-mono overflow-x-auto text-[11.5px] leading-[1.8] text-bone-dim">
            {`CREATE CONSTRAINT service_slug      FOR (n:Service)    REQUIRE n.slug   IS UNIQUE
CREATE CONSTRAINT package_key       FOR (n:Package)    REQUIRE n.key    IS UNIQUE
CREATE CONSTRAINT version_key       FOR (n:Version)    REQUIRE n.key    IS UNIQUE
CREATE CONSTRAINT maintainer_handle FOR (n:Maintainer) REQUIRE n.handle IS UNIQUE
CREATE CONSTRAINT advisory_id       FOR (n:Advisory)   REQUIRE n.id     IS UNIQUE
CREATE CONSTRAINT license_spdx      FOR (n:License)    REQUIRE n.spdxId IS UNIQUE
CREATE CONSTRAINT team_slug         FOR (n:Team)       REQUIRE n.slug   IS UNIQUE

CREATE INDEX package_name       FOR (n:Package)  ON (n.name)
CREATE INDEX package_ecosystem  FOR (n:Package)  ON (n.ecosystem)
CREATE INDEX version_package    FOR (n:Version)  ON (n.packageKey)
CREATE INDEX advisory_severity  FOR (n:Advisory) ON (n.severity)
CREATE INDEX service_tier       FOR (n:Service)  ON (n.tier)
CREATE INDEX license_category   FOR (n:License)  ON (n.category)`}
          </pre>
        </Panel>
      </Section>

      <Section title="Where the data comes from">
        <Panel>
          <ul className="space-y-3 text-[13px] leading-relaxed text-bone-dim">
            <li>
              <Tag tone="chalk">real</Tag>{" "}
              <span className="ml-1">
                Package names, registries and the dependency edges between them. These are the actual trees —{" "}
                <code className="u-mono text-[12px]">express</code> really does pull in thirty-one packages,
                and{" "}
                <code className="u-mono text-[12px]">
                  qs → side-channel → get-intrinsic → hasown → function-bind
                </code>{" "}
                is a real chain.
              </span>
            </li>
            <li>
              <Tag tone="chalk">real</Tag>{" "}
              <span className="ml-1">
                Thirty-seven published advisories, with their true affected packages and fix boundaries.
                Log4Shell, Text4Shell, Spring4Shell, the lodash prototype-pollution family, the urllib3
                redirect leaks.
              </span>
            </li>
            <li>
              <Tag tone="warn">synthetic</Tag>{" "}
              <span className="ml-1">
                Meridian Pay itself — the teams, services, manifests and call graph. Maintainer identities.
                Thirty additional advisories, deliberately aimed at deep transitive leaves and marked{" "}
                <code className="u-mono text-[12px]">verified: false</code> everywhere they appear.
              </span>
            </li>
            <li>
              <Tag tone="warn">synthetic</Tag>{" "}
              <span className="ml-1">
                Intermediate version numbers. Release histories are anchored on real current versions and real
                fix boundaries; the releases in between are plausible fill.
              </span>
            </li>
          </ul>
          <p className="mt-4 border-t border-rule pt-4 text-[12.5px] text-lichen">
            The whole dataset is a pure function of one seed constant, so two people running the loader get
            identical graphs. See{" "}
            <Link href="/queries" className="link">
              the query catalogue
            </Link>{" "}
            for what is done with it.
          </p>
        </Panel>
      </Section>
    </Page>
  );
}
