import { z } from "zod";

import { SEVERITIES } from "@/lib/domain/types";

import { defineQuery } from "../registry";

const severityEnum = z.enum(SEVERITIES);

/**
 * Conditional filtering without building strings.
 *
 * `size($severities) = 0 OR a.severity IN $severities` lets one frozen
 * statement serve "all severities" and "just the critical ones" alike. That is
 * how this codebase keeps every filter parameterised instead of splicing
 * predicates into the Cypher at runtime.
 */
export const advisoryList = defineQuery({
  id: "advisory.list",
  title: "Advisory inventory with live impact",
  question: "What advisories apply to us, and how many services does each one actually reach?",
  why: "The impact column is a reachability count, not a join. Two advisories can affect the same package and have wildly different blast radii depending on where that package sits in the dependency graph.",
  cypher: `
MATCH (a:Advisory)
WHERE (size($severities) = 0 OR a.severity IN $severities)
  AND ($search = ''
       OR toLower(a.id) CONTAINS toLower($search)
       OR toLower(a.title) CONTAINS toLower($search))
MATCH (a)-[:AFFECTS]->(v:Version)<-[:HAS_VERSION]-(p:Package)
WITH a,
     count(DISTINCT v) AS affectedVersions,
     collect(DISTINCT p.name) AS affectedPackages
OPTIONAL MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(:Version)<-[:AFFECTS]-(a)
WITH a, affectedVersions, affectedPackages, collect(DISTINCT s) AS services
RETURN a.id AS id,
       a.source AS source,
       a.title AS title,
       a.severity AS severity,
       a.cvss AS cvss,
       a.cwe AS cwe,
       a.publishedAt AS publishedAt,
       a.exploitKnown AS exploitKnown,
       a.verified AS verified,
       affectedVersions,
       affectedPackages,
       size(services) AS affectedServices,
       size([x IN services WHERE x.tier = 'critical']) AS criticalServices
ORDER BY affectedServices DESC, a.cvss DESC, a.publishedAt DESC
LIMIT $limit
`.trim(),
  params: z.object({
    severities: z.array(severityEnum).default([]),
    search: z.string().max(120).default(""),
    limit: z.number().int().min(1).max(200).default(60),
  }),
  example: { severities: [], search: "", limit: 60 },
  tags: ["multi-hop", "aggregation"],
  traversal: "Advisory ← Version ← up to 4 × DEPENDS_ON ← Version ← Service",
});

export const advisoryDetail = defineQuery({
  id: "advisory.detail",
  title: "Advisory detail",
  question: "What exactly does this advisory say, and which released versions does it cover?",
  why: "One hop, but it collects the affected version window per package — the thing you need before you can plan an upgrade.",
  cypher: `
MATCH (a:Advisory {id: $advisoryId})
OPTIONAL MATCH (a)-[af:AFFECTS]->(v:Version)<-[:HAS_VERSION]-(p:Package)
WITH a, p, collect({
       version: v.version,
       key: v.key,
       publishedAt: v.publishedAt,
       fixedIn: af.fixedIn,
       introducedIn: af.introducedIn
     }) AS versions
WITH a, collect(CASE WHEN p IS NULL THEN NULL ELSE {
       packageKey: p.key,
       name: p.name,
       ecosystem: p.ecosystem,
       weeklyDownloads: p.weeklyDownloads,
       versions: versions
     } END) AS packages
RETURN a.id AS id,
       a.source AS source,
       a.title AS title,
       a.summary AS summary,
       a.severity AS severity,
       a.cvss AS cvss,
       a.cwe AS cwe,
       a.vector AS vector,
       a.publishedAt AS publishedAt,
       a.exploitKnown AS exploitKnown,
       a.verified AS verified,
       a.reference AS reference,
       [x IN packages WHERE x IS NOT NULL] AS packages
`.trim(),
  params: z.object({ advisoryId: z.string().min(1).max(64) }),
  example: { advisoryId: "CVE-2021-44228" },
  tags: ["lookup", "aggregation"],
});

/**
 * The flagship query.
 *
 * For a given advisory it answers, in one round trip: which services are
 * affected, who owns them, how deep the vulnerable package is buried, and the
 * exact package-by-package chain that gets you there. `shortestPath` picks the
 * most direct route so the answer is one clean explanation per service rather
 * than every one of the dozens of paths that may exist.
 *
 * One wrinkle worth knowing about. openCypher engines disagree on whether
 * `shortestPath` yields the zero-length path when both endpoints resolve to the
 * same node, and CognoDB's does not — which would silently drop every *direct*
 * dependency from the answer, the single most important case. So the zero-hop
 * case is handled explicitly and `shortestPath` starts at one hop. That is also
 * measurably faster than a plain `*0..6` expansion: 0.9s against 2.3s on the
 * widest advisory in this dataset.
 */
export const blastRadius = defineQuery({
  id: "advisory.blastRadius",
  title: "Blast radius",
  question:
    "If this advisory is real, exactly which of our services are affected — and through which chain of dependencies?",
  why: "This is the query a graph database exists for. The answer is a path, not a row: 'checkout-api depends on axios, which depends on follow-redirects, which is the vulnerable package.' Reproducing that in SQL means a recursive CTE that carries a path array, guards against cycles by hand, and still cannot express 'shortest' without a window function over the whole expansion.",
  cypher: `
MATCH (a:Advisory {id: $advisoryId})-[:AFFECTS]->(vulnerable:Version)
MATCH (s:Service)-[u:USES]->(entry:Version)
WHERE (size($scopes) = 0 OR u.scope IN $scopes)
  AND (size($tiers) = 0 OR s.tier IN $tiers)
OPTIONAL MATCH route = shortestPath((entry)-[:DEPENDS_ON*1..6]->(vulnerable))
WITH s, u, entry, vulnerable, route,
     CASE WHEN entry = vulnerable THEN 0 ELSE length(route) END AS hops
WHERE hops IS NOT NULL AND hops <= $maxDepth
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
WITH s, t, u, entry, vulnerable, hops,
     CASE WHEN route IS NULL THEN [vulnerable.key] ELSE [n IN nodes(route) | n.key] END AS chain
ORDER BY hops ASC, vulnerable.key ASC
WITH s, t,
     collect({
       hops: hops,
       scope: u.scope,
       entryPackage: entry.key,
       vulnerableVersion: vulnerable.key,
       chain: chain
     }) AS routes
RETURN s.slug AS serviceSlug,
       s.name AS serviceName,
       s.tier AS tier,
       s.shipsExternally AS shipsExternally,
       t.slug AS teamSlug,
       t.name AS teamName,
       routes[0].hops AS hops,
       routes[0].scope AS scope,
       routes[0].entryPackage AS entryPackage,
       routes[0].vulnerableVersion AS vulnerableVersion,
       routes[0].chain AS chain,
       size(routes) AS distinctRoutes
ORDER BY hops ASC, tier ASC, serviceName ASC
`.trim(),
  params: z.object({
    advisoryId: z.string().min(1).max(64),
    maxDepth: z.number().int().min(0).max(6).default(6),
    scopes: z.array(z.enum(["runtime", "dev", "optional", "peer"])).default([]),
    tiers: z.array(z.enum(["critical", "standard", "internal"])).default([]),
  }),
  example: { advisoryId: "CVE-2021-44228", maxDepth: 6, scopes: [], tiers: [] },
  tags: ["multi-hop", "shortest-path", "cross-domain"],
  traversal:
    "Advisory → Version, then shortestPath back through up to 6 × DEPENDS_ON to a Service's direct dependency",
});

/**
 * Remediation as a graph walk.
 *
 * `SUPERSEDES` chains releases together, so "how far do I have to jump to get
 * clean?" becomes a shortest path between two versions of the same package
 * where the destination is not affected by this advisory.
 *
 * The obvious way to write "not affected" is the pattern predicate
 * `WHERE NOT (a)-[:AFFECTS]->(target)`. Do not: on CognoDB a pattern predicate
 * does not bind an endpoint that is already bound in the surrounding scope, so
 * that expression asks "does this advisory affect *anything*?" and quietly
 * discards every row. Collecting the affected keys first and testing list
 * membership is portable, obvious to a reader, and correct.
 */
export const upgradePath = defineQuery({
  id: "advisory.upgradePath",
  title: "Shortest safe upgrade",
  question: "What is the nearest release that fixes this, and how many releases ahead is it?",
  why: "Release history is a chain in the graph. Finding the closest unaffected release is a shortest-path search over that chain — one statement instead of a version-sorting subquery plus an anti-join.",
  cypher: `
MATCH (a:Advisory {id: $advisoryId})-[af:AFFECTS]->(current:Version {key: $versionKey})
MATCH (a)-[:AFFECTS]->(affected:Version)
WITH a, af, current, collect(affected.key) AS affectedKeys
MATCH (pkg:Package)-[:HAS_VERSION]->(current)
MATCH (pkg)-[:HAS_VERSION]->(target:Version)
WHERE NOT target.key IN affectedKeys
  AND target.publishedAt > current.publishedAt
MATCH hopPath = shortestPath((target)-[:SUPERSEDES*1..24]->(current))
RETURN current.key AS currentVersion,
       target.key AS fixedVersion,
       target.version AS fixedSemver,
       length(hopPath) AS releasesAhead,
       [n IN nodes(hopPath) | n.version] AS releaseChain,
       af.fixedIn AS declaredFixedIn
ORDER BY releasesAhead ASC
LIMIT 1
`.trim(),
  params: z.object({
    advisoryId: z.string().min(1).max(64),
    versionKey: z.string().min(1).max(200),
  }),
  example: { advisoryId: "CVE-2021-23337", versionKey: "npm:lodash@4.17.15" },
  tags: ["shortest-path", "lookup"],
  traversal: "Version ← up to 24 × SUPERSEDES ← Version, filtered by a NOT EXISTS pattern",
});

export const advisoryQueries = {
  advisoryList,
  advisoryDetail,
  blastRadius,
  upgradePath,
};
