import { z } from "zod";

import { ECOSYSTEMS } from "@/lib/domain/types";

import { defineQuery } from "../registry";

export const packageSearch = defineQuery({
  id: "package.search",
  title: "Package search",
  question: "Find a package by name across every ecosystem we pull from.",
  why: "Ecosystems are a property, not a table. One index-backed scan covers npm, PyPI, Maven, crates.io and Go modules — no UNION over five differently shaped tables.",
  cypher: `
MATCH (p:Package)
WHERE ($search = '' OR toLower(p.name) CONTAINS toLower($search))
  AND (size($ecosystems) = 0 OR p.ecosystem IN $ecosystems)
OPTIONAL MATCH (p)-[:HAS_VERSION]->(v:Version)
WITH p, count(DISTINCT v) AS versions
OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(p)
WITH p, versions, count(DISTINCT m) AS maintainers
OPTIONAL MATCH (a:Advisory)-[:AFFECTS]->(:Version)<-[:HAS_VERSION]-(p)
WITH p, versions, maintainers, count(DISTINCT a) AS advisories
RETURN p.key AS key,
       p.name AS name,
       p.ecosystem AS ecosystem,
       p.description AS description,
       p.weeklyDownloads AS weeklyDownloads,
       p.deprecated AS deprecated,
       versions,
       maintainers,
       advisories
ORDER BY advisories DESC, p.weeklyDownloads DESC, p.name ASC
LIMIT $limit
`.trim(),
  params: z.object({
    search: z.string().max(120).default(""),
    ecosystems: z.array(z.enum(ECOSYSTEMS)).default([]),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  example: { search: "", ecosystems: [], limit: 50 },
  tags: ["lookup", "aggregation"],
});

export const packageDetail = defineQuery({
  id: "package.detail",
  title: "Package profile",
  question: "Who publishes this package, what has it released, and what is wrong with it?",
  why: "Registry metadata, release history, maintainer roster and advisories are four separate concerns that happen to share one node.",
  cypher: `
MATCH (p:Package {key: $packageKey})
OPTIONAL MATCH (p)-[:HAS_VERSION]->(v:Version)
OPTIONAL MATCH (v)-[:LICENSED_UNDER]->(l:License)
OPTIONAL MATCH (a:Advisory)-[:AFFECTS]->(v)
WITH p, v, l, collect(DISTINCT {id: a.id, severity: a.severity}) AS advisories
ORDER BY v.publishedAt DESC
WITH p, collect(CASE WHEN v IS NULL THEN NULL ELSE {
       key: v.key,
       version: v.version,
       publishedAt: v.publishedAt,
       yanked: v.yanked,
       license: l.spdxId,
       licenseCategory: l.category,
       advisories: [x IN advisories WHERE x.id IS NOT NULL]
     } END) AS versions
OPTIONAL MATCH (m:Maintainer)-[mr:MAINTAINS]->(p)
WITH p, versions, collect(CASE WHEN m IS NULL THEN NULL ELSE {
       handle: m.handle,
       name: m.name,
       role: mr.role,
       since: mr.since,
       twoFactorEnabled: m.twoFactorEnabled,
       publicPackages: m.publicPackages
     } END) AS maintainers
RETURN p.key AS key,
       p.name AS name,
       p.ecosystem AS ecosystem,
       p.description AS description,
       p.repoUrl AS repoUrl,
       p.weeklyDownloads AS weeklyDownloads,
       p.firstPublished AS firstPublished,
       p.deprecated AS deprecated,
       [x IN versions WHERE x IS NOT NULL] AS versions,
       [x IN maintainers WHERE x IS NOT NULL] AS maintainers
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200) }),
  example: { packageKey: "npm:lodash" },
  tags: ["lookup", "aggregation"],
});

export const packageDependents = defineQuery({
  id: "package.dependents",
  title: "Who depends on this",
  question: "Which other packages pull this one in directly?",
  why: "One reverse hop. In a relational schema this is the same table read backwards; in a graph it is the same edge read backwards, which costs nothing extra.",
  cypher: `
MATCH (p:Package {key: $packageKey})-[:HAS_VERSION]->(v:Version)
MATCH (dependent:Version)-[d:DEPENDS_ON]->(v)
MATCH (dp:Package)-[:HAS_VERSION]->(dependent)
RETURN DISTINCT dp.key AS packageKey,
       dp.name AS name,
       dp.ecosystem AS ecosystem,
       dp.weeklyDownloads AS weeklyDownloads,
       dependent.version AS dependentVersion,
       d.declaredRange AS declaredRange,
       d.scope AS scope
ORDER BY dp.weeklyDownloads DESC, dp.name ASC
LIMIT $limit
`.trim(),
  params: z.object({
    packageKey: z.string().min(1).max(200),
    limit: z.number().int().min(1).max(200).default(40),
  }),
  example: { packageKey: "npm:lodash", limit: 40 },
  tags: ["lookup"],
});

/**
 * The question a package page should always answer but almost never does:
 * "does anything I run actually depend on this, and how far away is it?"
 */
export const packageDownstreamServices = defineQuery({
  id: "package.downstreamServices",
  title: "Services standing on this package",
  question: "Which of our services would notice if this package broke?",
  why: "A reverse reachability search of unbounded depth. This is the query that turns an abstract registry page into an operational answer, and it is exactly what recursive SQL makes painful.",
  cypher: `
MATCH (p:Package {key: $packageKey})-[:HAS_VERSION]->(v:Version)
MATCH (s:Service)-[:USES]->(entry:Version)
OPTIONAL MATCH route = shortestPath((entry)-[:DEPENDS_ON*1..6]->(v))
WITH s, entry, v, route,
     CASE WHEN entry = v THEN 0 ELSE length(route) END AS hops
WHERE hops IS NOT NULL
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
WITH s, t, v, hops,
     CASE WHEN route IS NULL THEN [v.key] ELSE [n IN nodes(route) | n.key] END AS chain
ORDER BY hops ASC
WITH s, t, collect({hops: hops, version: v.key, chain: chain}) AS routes
RETURN s.slug AS serviceSlug,
       s.name AS serviceName,
       s.tier AS tier,
       t.name AS teamName,
       routes[0].hops AS hops,
       routes[0].version AS viaVersion,
       routes[0].chain AS chain
ORDER BY hops ASC, tier ASC, serviceName ASC
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200) }),
  example: { packageKey: "npm:lodash" },
  tags: ["multi-hop", "shortest-path"],
  traversal: "Package → Version ← shortestPath over up to 6 × DEPENDS_ON ← Service's direct dependency",
});

export const packageQueries = {
  packageSearch,
  packageDetail,
  packageDependents,
  packageDownstreamServices,
};
