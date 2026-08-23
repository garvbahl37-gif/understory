import type { Ecosystem, Severity } from "@/lib/domain/types";

import { REAL_ADVISORIES, type AdvisoryRow } from "./data/advisories";
import { CURRENT_VERSIONS } from "./data/current-versions";
import { LICENSES } from "./data/licenses";
import { SERVICE_CALLS, SERVICES, TEAMS } from "./data/org";
import { NPM_PACKAGES } from "./data/packages-npm";
import { CARGO_PACKAGES, GO_PACKAGES, MAVEN_PACKAGES, PYPI_PACKAGES } from "./data/packages-other";
import { FIRST_NAMES, LAST_NAMES, SYNTHETIC_TARGETS, TYPOSQUATS } from "./data/people";
import type { PackageRow } from "./data/types";

// ── deterministic randomness ────────────────────────────────────────────────
// The whole dataset is a pure function of this seed, so two people running the
// loader get byte-identical graphs and screenshots stay reproducible.

const SEED = 0x5eed_1a7e;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

// ── semver ──────────────────────────────────────────────────────────────────

type Semver = { major: number; minor: number; patch: number };

function parseSemver(input: string): Semver {
  const [major = 0, minor = 0, patch = 0] = input
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return { major, minor, patch };
}

const formatSemver = (v: Semver) => `${v.major}.${v.minor}.${v.patch}`;

function compareSemver(a: Semver, b: Semver): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const lt = (a: string, b: string) => compareSemver(parseSemver(a), parseSemver(b)) < 0;
const gte = (a: string, b: string) => compareSemver(parseSemver(a), parseSemver(b)) >= 0;

/** The release immediately before a fix, so the graph straddles every boundary. */
function previous(version: string): string {
  const v = parseSemver(version);
  if (v.patch > 0) return formatSemver({ ...v, patch: v.patch - 1 });
  if (v.minor > 0) return formatSemver({ major: v.major, minor: v.minor - 1, patch: 0 });
  if (v.major > 0) return formatSemver({ major: v.major - 1, minor: 33, patch: 0 });
  return "0.0.1";
}

const nextPatch = (version: string) => {
  const v = parseSemver(version);
  return formatSemver({ ...v, patch: v.patch + 1 });
};

const bumpMinor = (version: string, by: number) => {
  const v = parseSemver(version);
  return formatSemver({ major: v.major, minor: Math.max(0, v.minor - by), patch: 0 });
};

// ── dates ───────────────────────────────────────────────────────────────────

/** Fixed "today" so the dataset never drifts between runs. */
export const AS_OF = new Date("2026-02-01T00:00:00.000Z");

const dayMs = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBefore = (days: number) => isoDay(new Date(AS_OF.getTime() - days * dayMs));

// ── node shapes written to the database ─────────────────────────────────────

export type LicenseNode = {
  spdxId: string;
  name: string;
  category: string;
  osiApproved: boolean;
  obligation: string;
};
export type TeamNode = { slug: string; name: string; mission: string; headcount: number };
export type ServiceNode = {
  slug: string;
  name: string;
  tier: string;
  language: string;
  ecosystem: string;
  shipsExternally: boolean;
  description: string;
  repo: string;
  deployedAt: string;
};
export type PackageNode = {
  key: string;
  name: string;
  ecosystem: Ecosystem;
  description: string;
  weeklyDownloads: number;
  repoUrl: string;
  firstPublished: string;
  deprecated: boolean;
  suspicious: boolean;
};
export type VersionNode = {
  key: string;
  packageKey: string;
  name: string;
  ecosystem: Ecosystem;
  version: string;
  major: number;
  minor: number;
  patch: number;
  publishedAt: string;
  yanked: boolean;
};
export type MaintainerNode = {
  handle: string;
  name: string;
  joinedAt: string;
  twoFactorEnabled: boolean;
  publicPackages: number;
};
export type AdvisoryNode = {
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
};

export type Edge<T = Record<string, unknown>> = { from: string; to: string; props: T };

export type GraphDataset = {
  licenses: LicenseNode[];
  teams: TeamNode[];
  services: ServiceNode[];
  packages: PackageNode[];
  versions: VersionNode[];
  maintainers: MaintainerNode[];
  advisories: AdvisoryNode[];
  owns: Edge[];
  calls: Edge<{ protocol: string; criticality: string }>[];
  uses: Edge<{ scope: string; declaredRange: string; lockfile: string }>[];
  hasVersion: Edge[];
  dependsOn: Edge<{ scope: string; declaredRange: string }>[];
  supersedes: Edge[];
  licensedUnder: Edge[];
  maintains: Edge<{ role: string; since: string }>[];
  published: Edge<{ at: string }>[];
  affects: Edge<{ introducedIn: string | null; fixedIn: string }>[];
  similarTo: Edge<{ distance: number; kind: string }>[];
};

// ── ecosystem tables ────────────────────────────────────────────────────────

const TABLES: Array<{ ecosystem: Ecosystem; rows: PackageRow[] }> = [
  { ecosystem: "npm", rows: NPM_PACKAGES },
  { ecosystem: "pypi", rows: PYPI_PACKAGES },
  { ecosystem: "maven", rows: MAVEN_PACKAGES },
  { ecosystem: "cargo", rows: CARGO_PACKAGES },
  { ecosystem: "go", rows: GO_PACKAGES },
];

const pkgKey = (ecosystem: string, name: string) => `${ecosystem}:${name}`;
const versionKey = (ecosystem: string, name: string, version: string) => `${ecosystem}:${name}@${version}`;

const REPO_HOST: Record<Ecosystem, (name: string) => string> = {
  npm: (n) => `https://www.npmjs.com/package/${n}`,
  pypi: (n) => `https://pypi.org/project/${n}/`,
  maven: (n) => `https://central.sonatype.com/artifact/${n.replace(":", "/")}`,
  cargo: (n) => `https://crates.io/crates/${n}`,
  go: (n) => `https://pkg.go.dev/${n}`,
};

const SEVERITY_BY_CVSS = (cvss: number): Severity =>
  cvss >= 9 ? "CRITICAL" : cvss >= 7 ? "HIGH" : cvss >= 4 ? "MEDIUM" : "LOW";

const SYNTHETIC_TEMPLATES: Record<
  string,
  { title: string; summary: string; cwe: string; range: [number, number] }
> = {
  "prototype-pollution": {
    title: "prototype pollution through an unguarded property path",
    summary:
      "A caller-controlled property path is written without checking for __proto__ or constructor, letting an attacker modify the behaviour of every object in the process.",
    cwe: "CWE-1321 Prototype Pollution",
    range: [7.3, 9.1],
  },
  "resource-exhaustion": {
    title: "unbounded allocation on a crafted input",
    summary:
      "Input size is not validated before buffering, so a single request can pin memory or CPU until the worker is recycled.",
    cwe: "CWE-400 Uncontrolled Resource Consumption",
    range: [5.3, 7.5],
  },
  redos: {
    title: "catastrophic backtracking in an internal regular expression",
    summary:
      "A pattern with nested quantifiers takes exponential time on near-matching input, turning a parsing call into a hung event loop.",
    cwe: "CWE-1333 Inefficient Regular Expression Complexity",
    range: [5.3, 7.5],
  },
  "path-traversal": {
    title: "path traversal when resolving a caller-supplied name",
    summary:
      "A relative path is joined to a base directory without normalisation, so ../ sequences escape the intended root.",
    cwe: "CWE-22 Path Traversal",
    range: [6.5, 8.6],
  },
  "information-exposure": {
    title: "sensitive header or field retained across a trust boundary",
    summary:
      "Authorisation material survives a redirect or is copied into an error payload, disclosing it to a party that should never have seen it.",
    cwe: "CWE-200 Exposure of Sensitive Information",
    range: [4.3, 6.5],
  },
  "header-injection": {
    title: "response header injection through unescaped input",
    summary:
      "A caller-supplied value is written into a header without stripping CR/LF, allowing header and response splitting.",
    cwe: "CWE-113 HTTP Response Splitting",
    range: [5.4, 7.4],
  },
  deserialization: {
    title: "unsafe deserialisation of attacker-controlled data",
    summary:
      "Type information embedded in the payload is honoured during decoding, so an attacker can instantiate arbitrary classes.",
    cwe: "CWE-502 Deserialization of Untrusted Data",
    range: [8.1, 9.8],
  },
  "sql-injection": {
    title: "unparameterised identifier interpolation",
    summary:
      "An identifier is interpolated into a statement rather than bound, so a caller who controls it can change the query's meaning.",
    cwe: "CWE-89 SQL Injection",
    range: [8.1, 9.8],
  },
  xss: {
    title: "cross-site scripting via an incompletely escaped context",
    summary:
      "Escaping is correct for element text but not for attribute or script contexts, allowing markup to break out.",
    cwe: "CWE-79 Cross-site Scripting",
    range: [5.4, 6.5],
  },
  "race-condition": {
    title: "time-of-check to time-of-use race on shared state",
    summary:
      "Two goroutines or threads can observe an inconsistent view of shared state, producing a crash or an incorrect authorisation decision.",
    cwe: "CWE-362 Race Condition",
    range: [4.7, 7.0],
  },
  "request-smuggling": {
    title: "inconsistent message framing enables request smuggling",
    summary:
      "Conflicting Content-Length and Transfer-Encoding headers are resolved differently here than by common proxies, letting an attacker desynchronise the connection.",
    cwe: "CWE-444 HTTP Request Smuggling",
    range: [7.5, 9.1],
  },
  "privilege-escalation": {
    title: "worker process retains elevated privileges after fork",
    summary:
      "Privileges are not dropped along every code path, so a compromised worker keeps capabilities it should have shed.",
    cwe: "CWE-269 Improper Privilege Management",
    range: [7.0, 8.4],
  },
  "memory-safety": {
    title: "out-of-bounds read in an FFI boundary",
    summary:
      "A length is trusted from the caller before being used to index a foreign buffer, producing a read past the end of the allocation.",
    cwe: "CWE-125 Out-of-bounds Read",
    range: [7.1, 9.1],
  },
  "supply-chain": {
    title: "build script executes network-fetched content",
    summary:
      "The crate's build script downloads and runs content at compile time, so a registry or CDN compromise becomes code execution on every build machine.",
    cwe: "CWE-829 Inclusion of Functionality from Untrusted Control Sphere",
    range: [8.4, 9.6],
  },
};

// ── the generator ───────────────────────────────────────────────────────────

export function generate(): GraphDataset {
  const packages: PackageNode[] = [];
  const versions: VersionNode[] = [];
  const hasVersion: Edge[] = [];
  const supersedes: Edge[] = [];
  const licensedUnder: Edge[] = [];
  const dependsOn: Edge<{ scope: string; declaredRange: string }>[] = [];
  const affects: Edge<{ introducedIn: string | null; fixedIn: string }>[] = [];
  const uses: Edge<{ scope: string; declaredRange: string; lockfile: string }>[] = [];
  const maintains: Edge<{ role: string; since: string }>[] = [];
  const published: Edge<{ at: string }>[] = [];
  const similarTo: Edge<{ distance: number; kind: string }>[] = [];

  const rowByKey = new Map<string, { row: PackageRow; ecosystem: Ecosystem }>();
  for (const { ecosystem, rows } of TABLES) {
    for (const row of rows) rowByKey.set(pkgKey(ecosystem, row[0]), { row, ecosystem });
  }

  // 1. Build the advisory list: real records plus synthetic ones aimed at deep
  //    transitive leaves, where the interesting traversals live.
  const advisoryRows: AdvisoryRow[] = [...REAL_ADVISORIES];
  let syntheticIndex = 0;
  for (const [ecosystem, name, kind] of SYNTHETIC_TARGETS) {
    const entry = rowByKey.get(pkgKey(ecosystem, name));
    if (!entry) continue;
    const template = SYNTHETIC_TEMPLATES[kind];
    if (!template) continue;

    syntheticIndex += 1;
    const cvss = Math.round((template.range[0] + rand() * (template.range[1] - template.range[0])) * 10) / 10;
    const year = 2024 + (syntheticIndex % 2);
    advisoryRows.push({
      id: `UNDR-${year}-${String(1000 + syntheticIndex)}`,
      source: "SYNTHETIC",
      title: `${name} — ${template.title}`,
      summary: template.summary,
      severity: SEVERITY_BY_CVSS(cvss),
      cvss,
      cwe: template.cwe,
      publishedAt: daysBefore(randInt(40, 700)),
      exploitKnown: chance(0.18),
      verified: false,
      targets: [{ ecosystem: ecosystem as Ecosystem, package: name, fixedIn: "" }],
    });
  }

  // 2. Work out which release boundaries each package must straddle so that
  //    every advisory has both affected and fixed versions in the graph.
  const boundaries = new Map<string, string[]>();
  for (const advisory of advisoryRows) {
    for (const target of advisory.targets) {
      const key = pkgKey(target.ecosystem, target.package);
      if (!rowByKey.has(key)) continue;
      if (!target.fixedIn) continue;
      const list = boundaries.get(key) ?? [];
      list.push(target.fixedIn);
      boundaries.set(key, list);
    }
  }

  // 3. Package and version nodes.
  const versionsByPackage = new Map<string, VersionNode[]>();

  const makePackage = (
    ecosystem: Ecosystem,
    row: PackageRow,
    options: { suspicious?: boolean; downloadsOverride?: number; firstPublished?: string } = {},
  ) => {
    const [name, downloadsM, , , description, deprecated] = row;
    const key = pkgKey(ecosystem, name);
    const weeklyDownloads =
      options.downloadsOverride ?? Math.round(downloadsM * 1_000_000 * (0.7 + rand() * 0.6));
    const node: PackageNode = {
      key,
      name,
      ecosystem,
      description,
      weeklyDownloads,
      repoUrl: REPO_HOST[ecosystem](name),
      firstPublished: options.firstPublished ?? daysBefore(randInt(900, 4600)),
      deprecated: Boolean(deprecated),
      suspicious: Boolean(options.suspicious),
    };
    packages.push(node);
    return node;
  };

  const makeVersions = (pkg: PackageNode, row: PackageRow) => {
    const fixes = (boundaries.get(pkg.key) ?? [])
      .slice()
      .sort((a, b) => compareSemver(parseSemver(a), parseSemver(b)));
    const anchor = CURRENT_VERSIONS[pkg.key];

    const collected = new Set<string>();
    if (fixes.length > 0) {
      // Anchor the history on the published fix boundaries so that every
      // advisory has both affected and remediated releases to point at.
      collected.add(bumpMinor(fixes[0], 2));
      for (const fix of fixes) {
        collected.add(previous(fix));
        collected.add(formatSemver(parseSemver(fix)));
      }
      const newestFix = fixes[fixes.length - 1];
      collected.add(
        anchor && gte(anchor, newestFix) ? formatSemver(parseSemver(anchor)) : nextPatch(newestFix),
      );
    } else if (anchor) {
      // Walk backwards from the real current release.
      let cursor = formatSemver(parseSemver(anchor));
      collected.add(cursor);
      for (let i = 0; i < randInt(2, 4); i += 1) {
        const v = parseSemver(cursor);
        if (v.patch > 0) cursor = formatSemver({ ...v, patch: Math.max(0, v.patch - randInt(1, 3)) });
        else if (v.minor > 0)
          cursor = formatSemver({ major: v.major, minor: v.minor - 1, patch: randInt(0, 4) });
        else if (v.major > 0)
          cursor = formatSemver({ major: v.major - 1, minor: randInt(1, 12), patch: randInt(0, 4) });
        else break;
        collected.add(cursor);
      }
    } else {
      // Nothing to anchor on: a short, plausible release history.
      const base = { major: randInt(0, 6), minor: randInt(0, 14), patch: 0 };
      const count = randInt(3, 5);
      for (let i = 0; i < count; i += 1) {
        collected.add(formatSemver({ ...base, patch: i * randInt(1, 3) }));
      }
    }

    const ordered = [...collected].sort((a, b) => compareSemver(parseSemver(a), parseSemver(b))).slice(-7);

    // Newest release lands recently; each earlier one steps further back.
    let ageDays = randInt(20, 260);
    const nodes: VersionNode[] = [];
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const version = ordered[i];
      const parsed = parseSemver(version);
      nodes.unshift({
        key: versionKey(pkg.ecosystem, pkg.name, version),
        packageKey: pkg.key,
        name: pkg.name,
        ecosystem: pkg.ecosystem,
        version,
        major: parsed.major,
        minor: parsed.minor,
        patch: parsed.patch,
        publishedAt: daysBefore(ageDays),
        yanked: false,
      });
      ageDays += randInt(45, 210);
    }

    versionsByPackage.set(pkg.key, nodes);
    versions.push(...nodes);

    for (const node of nodes) hasVersion.push({ from: pkg.key, to: node.key, props: {} });
    for (let i = 1; i < nodes.length; i += 1) {
      supersedes.push({ from: nodes[i].key, to: nodes[i - 1].key, props: {} });
    }

    // Licence per release. A handful of packages relicense mid-history, which
    // is exactly the situation the contamination query is built to catch.
    const declared = row[2];
    const relicenses = chance(0.06);
    const laterLicense = pick([
      "MPL-2.0",
      "GPL-3.0-only",
      "AGPL-3.0-only",
      "BUSL-1.1",
      "LGPL-3.0-only",
      "NOASSERTION",
    ]);
    nodes.forEach((node, index) => {
      const spdx = relicenses && index >= Math.ceil(nodes.length / 2) ? laterLicense : declared;
      licensedUnder.push({ from: node.key, to: spdx, props: {} });
    });
  };

  for (const { ecosystem, rows } of TABLES) {
    for (const row of rows) {
      const pkg = makePackage(ecosystem, row);
      makeVersions(pkg, row);
    }
  }

  // 4. Typosquat suspects: freshly published, barely downloaded, name-adjacent.
  for (const [suspectName, targetName, ecosystem, distance, kind] of TYPOSQUATS) {
    const targetKey = pkgKey(ecosystem, targetName);
    if (!rowByKey.has(targetKey)) continue;
    const row: PackageRow = [
      suspectName,
      0,
      "MIT",
      [],
      `Unverified registry entry whose name is ${distance} character${distance === 1 ? "" : "s"} away from ${targetName}.`,
    ];
    const pkg = makePackage(ecosystem as Ecosystem, row, {
      suspicious: true,
      downloadsOverride: randInt(40, 2600),
      firstPublished: daysBefore(randInt(15, 240)),
    });
    makeVersions(pkg, row);
    similarTo.push({ from: pkg.key, to: targetKey, props: { distance, kind } });
  }

  // 5. Version-to-version dependency edges.
  //    Each release picks a concrete release of each dependency: usually a
  //    recent one, sometimes a stale one — which is how real lockfiles look and
  //    why transitive exposure is never uniform across a fleet.
  const rangePrefix = (ecosystem: Ecosystem) =>
    ecosystem === "npm" ? "^" : ecosystem === "cargo" ? "^" : ecosystem === "pypi" ? ">=" : "";

  for (const { ecosystem, rows } of TABLES) {
    for (const row of rows) {
      const [name, , , deps] = row;
      const parentVersions = versionsByPackage.get(pkgKey(ecosystem, name)) ?? [];

      for (const depName of deps) {
        const depKey = pkgKey(ecosystem, depName);
        const depVersions = versionsByPackage.get(depKey);
        if (!depVersions || depVersions.length === 0) continue;

        for (const parent of parentVersions) {
          // Older releases of the parent tend to pin older releases of the child.
          const parentPosition = parentVersions.indexOf(parent) / Math.max(1, parentVersions.length - 1);
          const drift = chance(0.35) ? randInt(1, 2) : 0;
          const target = Math.round(parentPosition * (depVersions.length - 1)) - drift;
          const chosen = depVersions[Math.min(depVersions.length - 1, Math.max(0, target))];
          dependsOn.push({
            from: parent.key,
            to: chosen.key,
            props: {
              scope: "runtime",
              declaredRange: `${rangePrefix(ecosystem)}${chosen.version}`,
            },
          });
        }
      }
    }
  }

  // 6. Advisory nodes and their AFFECTS edges.
  const advisories: AdvisoryNode[] = [];
  for (const advisory of advisoryRows) {
    let matched = false;

    for (const target of advisory.targets) {
      const key = pkgKey(target.ecosystem, target.package);
      const pkgVersions = versionsByPackage.get(key);
      if (!pkgVersions || pkgVersions.length === 0) continue;

      // Synthetic advisories have no declared fix; treat the newest release as
      // the fix so the graph always offers a remediation path.
      const fixedIn = target.fixedIn || pkgVersions[pkgVersions.length - 1].version;
      const affected = pkgVersions.filter(
        (v) => lt(v.version, fixedIn) && (!target.introducedIn || gte(v.version, target.introducedIn)),
      );
      if (affected.length === 0) continue;

      matched = true;
      for (const version of affected) {
        affects.push({
          from: advisory.id,
          to: version.key,
          props: { introducedIn: target.introducedIn ?? null, fixedIn },
        });
      }
    }

    if (!matched) continue;
    advisories.push({
      id: advisory.id,
      source: advisory.source,
      title: advisory.title,
      summary: advisory.summary,
      severity: advisory.severity,
      cvss: advisory.cvss,
      cwe: advisory.cwe,
      publishedAt: advisory.publishedAt,
      exploitKnown: advisory.exploitKnown,
      verified: advisory.verified,
      reference: advisory.reference ?? null,
    });
  }

  // 7. Maintainers. Popular packages attract more of them; a deliberate quarter
  //    of the registry is one person and a laptop.
  const maintainers: MaintainerNode[] = [];
  const handleSeen = new Set<string>();
  const makeMaintainer = (): MaintainerNode => {
    let handle = "";
    let name = "";
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const candidate = `${first[0]}-${last}`.toLowerCase();
      if (!handleSeen.has(candidate)) {
        handle = candidate;
        name = `${first} ${last}`;
        break;
      }
    }
    if (!handle) {
      handle = `dev-${maintainers.length + 1}`;
      name = `Contributor ${maintainers.length + 1}`;
    }
    handleSeen.add(handle);
    const node: MaintainerNode = {
      handle,
      name,
      joinedAt: daysBefore(randInt(400, 5200)),
      twoFactorEnabled: chance(0.72),
      publicPackages: 0,
    };
    maintainers.push(node);
    return node;
  };

  const pool = Array.from({ length: 190 }, makeMaintainer);

  for (const pkg of packages) {
    const popularity = pkg.weeklyDownloads;
    // The real registry is long-tailed: a handful of packages have a proper
    // team behind them and the median one has a single person and a laptop.
    let count: number;
    if (pkg.suspicious) {
      count = 1;
    } else {
      const roll = rand();
      count = roll < 0.44 ? 1 : roll < 0.74 ? 2 : roll < 0.9 ? 3 : randInt(4, 6);
      if (popularity > 80_000_000) count += 1;
    }

    const chosen = new Set<MaintainerNode>();
    while (chosen.size < count) chosen.add(pick(pool));

    let first = true;
    for (const maintainer of chosen) {
      maintainer.publicPackages += 1;
      maintains.push({
        from: maintainer.handle,
        to: pkg.key,
        props: { role: first ? "owner" : "publisher", since: daysBefore(randInt(120, 3800)) },
      });
      first = false;
    }

    const owners = [...chosen];
    for (const version of versionsByPackage.get(pkg.key) ?? []) {
      const publisher = owners[Math.floor(rand() * owners.length)];
      published.push({ from: publisher.handle, to: version.key, props: { at: version.publishedAt } });
    }
  }

  // Suspicious packages are published by brand-new accounts with no 2FA.
  for (const pkg of packages.filter((p) => p.suspicious)) {
    for (const edge of maintains.filter((m) => m.to === pkg.key)) {
      const maintainer = maintainers.find((m) => m.handle === edge.from);
      if (maintainer) {
        maintainer.twoFactorEnabled = false;
        maintainer.joinedAt = daysBefore(randInt(20, 200));
      }
    }
  }

  // 8. The organisation.
  const teams: TeamNode[] = TEAMS.map((team) => ({ ...team, headcount: randInt(4, 14) }));
  const services: ServiceNode[] = [];
  const owns: Edge[] = [];

  for (const service of SERVICES) {
    services.push({
      slug: service.slug,
      name: service.name,
      tier: service.tier,
      language: service.language,
      ecosystem: service.ecosystem,
      shipsExternally: service.shipsExternally,
      description: service.description,
      repo: `https://github.com/meridian-pay/${service.slug}`,
      deployedAt: daysBefore(randInt(1, 90)),
    });
    owns.push({ from: service.team, to: service.slug, props: {} });

    for (const depName of service.deps) {
      const depVersions = versionsByPackage.get(pkgKey(service.ecosystem, depName));
      if (!depVersions || depVersions.length === 0) continue;

      // Roughly half the fleet is behind on any given dependency. That is what
      // makes the blast-radius numbers interesting rather than uniform.
      const behind = chance(0.52) ? randInt(1, Math.max(1, depVersions.length - 1)) : 0;
      const chosen = depVersions[Math.max(0, depVersions.length - 1 - behind)];
      uses.push({
        from: service.slug,
        to: chosen.key,
        props: {
          scope: chance(0.12) ? "dev" : "runtime",
          declaredRange: `${rangePrefix(service.ecosystem)}${chosen.version}`,
          lockfile:
            service.ecosystem === "npm"
              ? "package-lock.json"
              : service.ecosystem === "pypi"
                ? "requirements.lock"
                : service.ecosystem === "maven"
                  ? "pom.xml"
                  : service.ecosystem === "cargo"
                    ? "Cargo.lock"
                    : "go.sum",
        },
      });
    }
  }

  // 9. Make sure the dataset actually exercises what it indexes.
  //
  //    Version choices above are random, so an advisory can end up with no
  //    exposed service purely by luck. Where a service *does* declare the
  //    affected package, nudge it onto an affected release. Advisories whose
  //    package nothing depends on are left alone on purpose — "you are not
  //    exposed to this one" is a real answer the UI needs to be able to give.
  const versionByKey = new Map(versions.map((v) => [v.key, v]));
  const childrenOf = new Map<string, string[]>();
  for (const edge of dependsOn) {
    const list = childrenOf.get(edge.from) ?? [];
    list.push(edge.to);
    childrenOf.set(edge.from, list);
  }

  const closureOf = (serviceSlug: string, maxDepth = 6): Set<string> => {
    const seen = new Set<string>();
    let frontier = uses.filter((u) => u.from === serviceSlug).map((u) => u.to);
    for (const key of frontier) seen.add(key);
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const key of frontier) {
        for (const child of childrenOf.get(key) ?? []) {
          if (seen.has(child)) continue;
          seen.add(child);
          next.push(child);
        }
      }
      frontier = next;
    }
    return seen;
  };

  const affectedByAdvisory = new Map<string, string[]>();
  for (const edge of affects) {
    const list = affectedByAdvisory.get(edge.from) ?? [];
    list.push(edge.to);
    affectedByAdvisory.set(edge.from, list);
  }

  const exposedVersions = () => {
    const all = new Set<string>();
    for (const service of services) for (const key of closureOf(service.slug)) all.add(key);
    return all;
  };

  let exposed = exposedVersions();
  for (const advisory of advisories) {
    const affectedKeys = affectedByAdvisory.get(advisory.id) ?? [];
    if (affectedKeys.some((key) => exposed.has(key))) continue;

    const affectedPackages = new Set(affectedKeys.map((key) => versionByKey.get(key)?.packageKey ?? ""));
    const newestAffected = (packageKey: string | undefined) =>
      affectedKeys
        .map((key) => versionByKey.get(key))
        .filter((v): v is VersionNode => v !== undefined && v.packageKey === packageKey)
        .sort((a, b) => compareSemver(parseSemver(b.version), parseSemver(a.version)))[0];

    // First choice: a service declares the package directly.
    const direct = uses.find((u) => affectedPackages.has(versionByKey.get(u.to)?.packageKey ?? ""));
    if (direct) {
      const swapTo = newestAffected(versionByKey.get(direct.to)?.packageKey);
      if (swapTo) {
        direct.to = swapTo.key;
        direct.props.declaredRange = `${rangePrefix(swapTo.ecosystem)}${swapTo.version}`;
        exposed = exposedVersions();
        continue;
      }
    }

    // Second choice: something already inside a service's closure depends on
    // the package. Repointing that edge is what a stale lockfile looks like.
    const transitive = dependsOn.find(
      (edge) => exposed.has(edge.from) && affectedPackages.has(versionByKey.get(edge.to)?.packageKey ?? ""),
    );
    if (!transitive) continue; // genuinely not exposed

    const swapTo = newestAffected(versionByKey.get(transitive.to)?.packageKey);
    if (!swapTo) continue;
    transitive.to = swapTo.key;
    transitive.props.declaredRange = `${rangePrefix(swapTo.ecosystem)}${swapTo.version}`;
    exposed = exposedVersions();
  }

  const calls: Edge<{ protocol: string; criticality: string }>[] = SERVICE_CALLS.map(
    ([from, to, protocol, criticality]) => ({ from, to, props: { protocol, criticality } }),
  );

  return {
    licenses: LICENSES.map((l) => ({ ...l })),
    teams,
    services,
    packages,
    versions,
    maintainers,
    advisories,
    owns,
    calls,
    uses,
    hasVersion,
    dependsOn,
    supersedes,
    licensedUnder,
    maintains,
    published,
    affects,
    similarTo,
  };
}

export function summarise(dataset: GraphDataset) {
  const nodes =
    dataset.licenses.length +
    dataset.teams.length +
    dataset.services.length +
    dataset.packages.length +
    dataset.versions.length +
    dataset.maintainers.length +
    dataset.advisories.length;
  const relationships =
    dataset.owns.length +
    dataset.calls.length +
    dataset.uses.length +
    dataset.hasVersion.length +
    dataset.dependsOn.length +
    dataset.supersedes.length +
    dataset.licensedUnder.length +
    dataset.maintains.length +
    dataset.published.length +
    dataset.affects.length +
    dataset.similarTo.length;
  return { nodes, relationships };
}
