import { z } from "zod";

import { defineQuery } from "../registry";

export const serviceList = defineQuery({
  id: "service.list",
  title: "Service inventory",
  question: "What do we run, who owns it, and how healthy is its dependency tree?",
  why: "Ownership, manifest size and transitive exposure come from three different parts of the graph and are stitched together in one traversal.",
  cypher: `
MATCH (s:Service)
WHERE (size($tiers) = 0 OR s.tier IN $tiers)
  AND ($search = '' OR toLower(s.name) CONTAINS toLower($search) OR toLower(s.slug) CONTAINS toLower($search))
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
OPTIONAL MATCH (s)-[:USES]->(direct:Version)
WITH s, t, count(DISTINCT direct) AS directDependencies
OPTIONAL MATCH (s)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v:Version)<-[:AFFECTS]-(a:Advisory)
WITH s, t, directDependencies, collect(DISTINCT a) AS advisories
RETURN s.slug AS slug,
       s.name AS name,
       s.tier AS tier,
       s.language AS language,
       s.description AS description,
       s.shipsExternally AS shipsExternally,
       t.slug AS teamSlug,
       t.name AS teamName,
       directDependencies,
       size(advisories) AS advisories,
       size([x IN advisories WHERE x.severity = 'CRITICAL']) AS criticalAdvisories
ORDER BY criticalAdvisories DESC, advisories DESC, s.name ASC
LIMIT $limit
`.trim(),
  params: z.object({
    tiers: z.array(z.enum(["critical", "standard", "internal"])).default([]),
    search: z.string().max(120).default(""),
    limit: z.number().int().min(1).max(200).default(60),
  }),
  example: { tiers: [], search: "", limit: 60 },
  tags: ["multi-hop", "aggregation"],
  traversal: "Service → Version → up to 4 × DEPENDS_ON → Version ← Advisory",
});

export const serviceDetail = defineQuery({
  id: "service.detail",
  title: "Service profile",
  question: "Everything about one service in a single round trip.",
  why: "Owner, upstream callers, downstream callees and manifest size are four different relationship types radiating from one node — a single-node neighbourhood read.",
  cypher: `
MATCH (s:Service {slug: $slug})
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
OPTIONAL MATCH (s)-[:USES]->(direct:Version)
WITH s, t, count(DISTINCT direct) AS directDependencies
OPTIONAL MATCH (s)-[out:CALLS]->(callee:Service)
WITH s, t, directDependencies,
     collect(DISTINCT {slug: callee.slug, name: callee.name, tier: callee.tier, protocol: out.protocol}) AS calls
OPTIONAL MATCH (caller:Service)-[inbound:CALLS]->(s)
WITH s, t, directDependencies, calls,
     collect(DISTINCT {slug: caller.slug, name: caller.name, tier: caller.tier, protocol: inbound.protocol}) AS calledBy
RETURN s.slug AS slug,
       s.name AS name,
       s.tier AS tier,
       s.language AS language,
       s.repo AS repo,
       s.description AS description,
       s.shipsExternally AS shipsExternally,
       s.deployedAt AS deployedAt,
       t.slug AS teamSlug,
       t.name AS teamName,
       t.mission AS teamMission,
       directDependencies,
       [c IN calls WHERE c.slug IS NOT NULL] AS calls,
       [c IN calledBy WHERE c.slug IS NOT NULL] AS calledBy
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["lookup", "graph-shape"],
});

export const serviceDirectDependencies = defineQuery({
  id: "service.directDependencies",
  title: "Declared dependencies",
  question: "What is actually written in this service's manifest?",
  why: "One hop — the baseline that makes the transitive numbers next to it meaningful.",
  cypher: `
MATCH (s:Service {slug: $slug})-[u:USES]->(v:Version)<-[:HAS_VERSION]-(p:Package)
OPTIONAL MATCH (v)-[:LICENSED_UNDER]->(l:License)
OPTIONAL MATCH (a:Advisory)-[:AFFECTS]->(v)
WITH p, v, u, l, collect(DISTINCT a.severity) AS severities
RETURN p.key AS packageKey,
       p.name AS name,
       p.ecosystem AS ecosystem,
       v.key AS versionKey,
       v.version AS version,
       u.scope AS scope,
       u.declaredRange AS declaredRange,
       l.spdxId AS license,
       l.category AS licenseCategory,
       severities AS directAdvisorySeverities
ORDER BY u.scope ASC, p.name ASC
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["lookup"],
});

/**
 * The number every engineer underestimates: how much third-party code is
 * really running, once you count what your dependencies dragged in.
 */
export const serviceFootprint = defineQuery({
  id: "service.transitiveFootprint",
  title: "Transitive footprint",
  question: "How much third-party code is this service really running, and how deep does it go?",
  why: "The gap between 'nine dependencies' and 'two hundred packages' only exists in the closure. Computing it relationally means expanding the entire dependency table recursively and deduplicating the result.",
  cypher: `
MATCH (s:Service {slug: $slug})-[:USES]->(entry:Version)
MATCH route = (entry)-[:DEPENDS_ON*0..5]->(v:Version)
WITH s, v, min(length(route)) AS depth
MATCH (p:Package)-[:HAS_VERSION]->(v)
RETURN count(DISTINCT p) AS packages,
       count(DISTINCT v) AS versions,
       max(depth) AS maxDepth,
       count(DISTINCT CASE WHEN depth > 0 THEN v END) AS transitiveVersions
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["multi-hop", "aggregation"],
  traversal: "Service → Version → up to 5 × DEPENDS_ON → Version",
});

export const serviceAdvisories = defineQuery({
  id: "service.advisories",
  title: "Everything wrong with this service",
  question: "Which advisories reach this service, how deep is each one, and what is the shortest route?",
  why: "Same shape as the blast-radius query, pivoted: one service, every advisory. Both directions of the same traversal are natural in a graph and a different query plan entirely in SQL.",
  cypher: `
MATCH (s:Service {slug: $slug})-[u:USES]->(entry:Version)
MATCH (a:Advisory)-[:AFFECTS]->(vulnerable:Version)
OPTIONAL MATCH route = shortestPath((entry)-[:DEPENDS_ON*1..6]->(vulnerable))
WITH a, u, entry, vulnerable, route,
     CASE WHEN entry = vulnerable THEN 0 ELSE length(route) END AS hops
WHERE hops IS NOT NULL
WITH a, u, entry, vulnerable, hops,
     CASE WHEN route IS NULL THEN [vulnerable.key] ELSE [n IN nodes(route) | n.key] END AS chain
ORDER BY hops ASC
WITH a, collect({
       hops: hops,
       scope: u.scope,
       entryPackage: entry.key,
       vulnerableVersion: vulnerable.key,
       chain: chain
     }) AS routes
RETURN a.id AS advisoryId,
       a.title AS title,
       a.severity AS severity,
       a.cvss AS cvss,
       a.exploitKnown AS exploitKnown,
       a.verified AS verified,
       routes[0].hops AS hops,
       routes[0].scope AS scope,
       routes[0].entryPackage AS entryPackage,
       routes[0].vulnerableVersion AS vulnerableVersion,
       routes[0].chain AS chain,
       size(routes) AS distinctRoutes
ORDER BY a.cvss DESC, hops ASC
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["multi-hop", "shortest-path"],
  traversal: "Service → Version → shortestPath over up to 6 × DEPENDS_ON → vulnerable Version",
});

export const serviceLicenseMix = defineQuery({
  id: "service.licenseMix",
  title: "License mix",
  question: "What licences is this service shipping, counting everything underneath it?",
  why: "Licence obligations propagate down the dependency tree, so the honest answer is over the closure — not over the manifest.",
  cypher: `
MATCH (s:Service {slug: $slug})-[:USES]->(:Version)-[:DEPENDS_ON*0..5]->(v:Version)
MATCH (v)-[:LICENSED_UNDER]->(l:License)
WITH DISTINCT l, v
RETURN l.spdxId AS spdxId,
       l.name AS name,
       l.category AS category,
       count(v) AS versions
ORDER BY versions DESC
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["multi-hop", "aggregation", "cross-domain"],
  traversal: "Service → Version → up to 5 × DEPENDS_ON → Version → License",
});

export const teamList = defineQuery({
  id: "team.list",
  title: "Teams and their exposure",
  question: "Which team is carrying the most risk right now?",
  why: "Ownership lives one hop from the services, and exposure lives four hops past that. A graph walks both in one statement; SQL needs the recursive part materialised before it can group by team.",
  cypher: `
MATCH (t:Team)-[:OWNS]->(s:Service)
OPTIONAL MATCH (s)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v:Version)<-[:AFFECTS]-(a:Advisory)
WITH t, s, collect(DISTINCT a) AS advisories
RETURN t.slug AS slug,
       t.name AS name,
       t.mission AS mission,
       count(DISTINCT s) AS services,
       sum(size(advisories)) AS advisoryHits,
       sum(size([x IN advisories WHERE x.severity = 'CRITICAL'])) AS criticalHits
ORDER BY criticalHits DESC, advisoryHits DESC, name ASC
`.trim(),
  params: z.object({}),
  example: {},
  tags: ["multi-hop", "aggregation"],
});

export const serviceQueries = {
  serviceList,
  serviceDetail,
  serviceDirectDependencies,
  serviceFootprint,
  serviceAdvisories,
  serviceLicenseMix,
  teamList,
};
