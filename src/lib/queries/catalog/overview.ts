import { z } from "zod";

import { defineQuery } from "../registry";

/**
 * Node census. A full label scan is normally a smell, but at this dataset's
 * scale (a few thousand nodes) it is cheaper than maintaining counters, and it
 * stays honest if the seed data changes.
 */
export const nodeCounts = defineQuery({
  id: "overview.nodeCounts",
  title: "Node census",
  question: "How many of each kind of thing are in the graph?",
  why: "A single scan reports the whole heterogeneous schema. A relational equivalent needs one COUNT per table plus a UNION to line them up.",
  cypher: `
MATCH (n)
RETURN labels(n)[0] AS label, count(*) AS count
ORDER BY count DESC
`.trim(),
  params: z.object({}),
  example: {},
  tags: ["aggregation", "graph-shape"],
});

export const relationshipCounts = defineQuery({
  id: "overview.relationshipCounts",
  title: "Relationship census",
  question: "How are those things connected, and how often?",
  why: "Relationships are first-class here. In SQL these are eleven different tables (or eleven different foreign keys) that have to be counted separately.",
  cypher: `
MATCH ()-[r]->()
RETURN type(r) AS type, count(*) AS count
ORDER BY count DESC
`.trim(),
  params: z.object({}),
  example: {},
  tags: ["aggregation", "graph-shape"],
});

export const severityBreakdown = defineQuery({
  id: "overview.severityBreakdown",
  title: "Advisories by severity",
  question: "What is the shape of the advisory backlog?",
  why: "Plain aggregation — included because a good console shows the boring queries too.",
  cypher: `
MATCH (a:Advisory)
RETURN a.severity AS severity,
       count(*) AS advisories,
       count(CASE WHEN a.exploitKnown THEN 1 END) AS exploitKnown
ORDER BY advisories DESC
`.trim(),
  params: z.object({}),
  example: {},
  tags: ["aggregation"],
});

/**
 * The dashboard's headline number. `DEPENDS_ON*0..4` is the whole point: a
 * service is exposed if a vulnerable version sits anywhere in its resolved
 * dependency closure, not just in its manifest.
 */
export const exposedServices = defineQuery({
  id: "overview.exposedServices",
  title: "Most exposed services",
  question: "Which services carry the most known-vulnerable code, counting dependencies of dependencies?",
  why: "Exposure is a reachability question over a variable-depth graph. SQL needs a recursive CTE that re-walks the whole dependency table on every request.",
  cypher: `
MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v:Version)
MATCH (a:Advisory)-[:AFFECTS]->(v)
WITH DISTINCT s, a
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
RETURN s.slug AS slug,
       s.name AS name,
       s.tier AS tier,
       s.shipsExternally AS shipsExternally,
       t.name AS teamName,
       count(a) AS advisories,
       count(CASE WHEN a.severity = 'CRITICAL' THEN 1 END) AS criticalAdvisories
ORDER BY criticalAdvisories DESC, advisories DESC, name ASC
LIMIT $limit
`.trim(),
  params: z.object({ limit: z.number().int().min(1).max(100).default(8) }),
  example: { limit: 8 },
  tags: ["multi-hop", "aggregation"],
  traversal: "Service → Version → up to 4 × DEPENDS_ON → Version ← Advisory",
});

/**
 * "Reach" is the number of distinct services a package can be found beneath.
 * It is the supply-chain analogue of betweenness: high reach means a single
 * bad release ruins a lot of people's afternoon.
 */
export const topReachPackages = defineQuery({
  id: "overview.topReachPackages",
  title: "Widest reach packages",
  question: "Which packages sit underneath the largest number of our services?",
  why: "Counting distinct endpoints of variable-length paths. Relationally this is a recursive CTE followed by a DISTINCT over an intermediate result set that can be orders of magnitude larger than the answer.",
  cypher: `
MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v:Version)
MATCH (p:Package)-[:HAS_VERSION]->(v)
WITH DISTINCT p, s
RETURN p.key AS packageKey,
       p.name AS name,
       p.ecosystem AS ecosystem,
       p.weeklyDownloads AS weeklyDownloads,
       count(s) AS dependentServices,
       count(CASE WHEN s.tier = 'critical' THEN 1 END) AS criticalServices
ORDER BY dependentServices DESC, weeklyDownloads DESC
LIMIT $limit
`.trim(),
  params: z.object({ limit: z.number().int().min(1).max(100).default(10) }),
  example: { limit: 10 },
  tags: ["multi-hop", "aggregation"],
  traversal: "Service → Version → up to 4 × DEPENDS_ON → Version ← Package",
});

export const recentAdvisories = defineQuery({
  id: "overview.recentAdvisories",
  title: "Newest advisories",
  question: "What landed most recently?",
  why: "A simple ordered lookup, plus a one-hop join to name the packages involved.",
  cypher: `
MATCH (a:Advisory)-[:AFFECTS]->(:Version)<-[:HAS_VERSION]-(p:Package)
WITH a, collect(DISTINCT p.name) AS packages
RETURN a.id AS id,
       a.title AS title,
       a.severity AS severity,
       a.cvss AS cvss,
       a.publishedAt AS publishedAt,
       a.exploitKnown AS exploitKnown,
       a.verified AS verified,
       packages AS affectedPackages
ORDER BY a.publishedAt DESC
LIMIT $limit
`.trim(),
  params: z.object({ limit: z.number().int().min(1).max(50).default(6) }),
  example: { limit: 6 },
  tags: ["lookup", "aggregation"],
});

export const overviewQueries = {
  nodeCounts,
  relationshipCounts,
  severityBreakdown,
  exposedServices,
  topReachPackages,
  recentAdvisories,
};
