import { z } from "zod";

import { defineQuery } from "../registry";

/**
 * Bus factor meets blast radius.
 *
 * The filter order matters: cheap structural predicates first (how many
 * maintainers does this package have?), expensive reachability second. Written
 * the other way round this query walks the entire dependency closure of every
 * service before discarding 90% of it.
 */
export const chokepoints = defineQuery({
  id: "risk.chokepoints",
  title: "Single-maintainer chokepoints",
  question: "Which packages are maintained by almost nobody, yet sit underneath a lot of what we run?",
  why: "Two independent graph facts — a package's maintainer count and the set of services that can reach it — combined and ranked. Neither is a row in a table; the second one does not exist until you traverse for it.",
  cypher: `
MATCH (m:Maintainer)-[:MAINTAINS]->(p:Package)
WITH p, collect(m) AS maintainers
WHERE size(maintainers) <= $maxBusFactor
MATCH (p)-[:HAS_VERSION]->(v:Version)
MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v)
WITH p, maintainers, collect(DISTINCT s) AS services
WHERE size(services) >= $minServices
WITH p, maintainers, services,
     size(maintainers) AS busFactor,
     size([x IN maintainers WHERE x.twoFactorEnabled = false]) AS maintainersWithout2fa,
     size(services) AS dependentServices,
     size([x IN services WHERE x.tier = 'critical']) AS criticalServices
RETURN p.key AS packageKey,
       p.name AS name,
       p.ecosystem AS ecosystem,
       p.weeklyDownloads AS weeklyDownloads,
       dependentServices,
       criticalServices,
       busFactor,
       maintainersWithout2fa,
       [x IN maintainers | x.handle] AS maintainerHandles,
       toInteger(round(
         (dependentServices + criticalServices * 2.0)
         * (1.0 / busFactor)
         * (CASE WHEN maintainersWithout2fa > 0 THEN 1.6 ELSE 1.0 END)
         * 10
       )) AS riskScore
ORDER BY riskScore DESC, dependentServices DESC
LIMIT $limit
`.trim(),
  params: z.object({
    maxBusFactor: z.number().int().min(1).max(10).default(2),
    minServices: z.number().int().min(1).max(50).default(2),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  example: { maxBusFactor: 2, minServices: 2, limit: 20 },
  tags: ["multi-hop", "aggregation", "cross-domain"],
  traversal: "Maintainer → Package → Version ← up to 4 × DEPENDS_ON ← Service",
});

/**
 * Account-compromise modelling. If this person's registry credentials leaked
 * tomorrow, how much of our estate could they reach with one malicious publish?
 */
export const maintainerBlastRadius = defineQuery({
  id: "risk.maintainerBlastRadius",
  title: "Maintainer blast radius",
  question: "If a maintainer's account were compromised, how much of our estate could one bad release reach?",
  why: "Human to package to release to dependency closure to service: five relationship types in one walk. A relational model needs four joins wrapped around a recursive CTE, and the answer still would not tell you which release carried the payload.",
  cypher: `
MATCH (m:Maintainer)-[:MAINTAINS]->(p:Package)-[:HAS_VERSION]->(v:Version)
MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(v)
WITH m, collect(DISTINCT p) AS reachedPackages, collect(DISTINCT s) AS services
WHERE size(services) >= $minServices
RETURN m.handle AS handle,
       m.name AS name,
       m.twoFactorEnabled AS twoFactorEnabled,
       m.publicPackages AS publicPackages,
       m.joinedAt AS joinedAt,
       size(reachedPackages) AS packages,
       size(services) AS dependentServices,
       size([x IN services WHERE x.tier = 'critical']) AS criticalServices,
       [x IN reachedPackages | x.name][0..6] AS topPackages
ORDER BY dependentServices DESC, criticalServices DESC, packages DESC
LIMIT $limit
`.trim(),
  params: z.object({
    minServices: z.number().int().min(1).max(50).default(2),
    limit: z.number().int().min(1).max(100).default(15),
  }),
  example: { minServices: 2, limit: 15 },
  tags: ["multi-hop", "aggregation", "cross-domain"],
  traversal: "Maintainer to Package to Version, then back up to 4 x DEPENDS_ON to Service",
});

/**
 * Name-adjacency as a first-class edge.
 *
 * `SIMILAR_TO` is computed at load time (Damerau–Levenshtein distance of 1, or
 * a scope/hyphen/typo variant) and stored. Because it is an edge, "is anything
 * that looks like a package we actually use sitting in the registry?" becomes a
 * traversal instead of a cross join with a string-distance function.
 */
export const typosquats = defineQuery({
  id: "risk.typosquats",
  title: "Typosquat radar",
  question: "Are there registry packages one keystroke away from something we genuinely depend on?",
  why: "Name similarity is stored as an edge, so this is a two-hop walk. Relationally it is a self-join across the whole package table with an edit-distance predicate — quadratic, unindexable, and it still cannot tell you whether the legitimate twin is one you actually ship.",
  cypher: `
MATCH (suspect:Package)-[sim:SIMILAR_TO]->(legit:Package)
MATCH (legit)-[:HAS_VERSION]->(lv:Version)
MATCH (s:Service)-[:USES]->(:Version)-[:DEPENDS_ON*0..4]->(lv)
WITH suspect, legit, sim, collect(DISTINCT s) AS services
WHERE size(services) >= $minServices
OPTIONAL MATCH (m:Maintainer)-[:MAINTAINS]->(suspect)
RETURN suspect.key AS suspectKey,
       suspect.name AS suspectName,
       suspect.weeklyDownloads AS suspectDownloads,
       suspect.firstPublished AS suspectFirstPublished,
       legit.key AS legitKey,
       legit.name AS legitName,
       legit.weeklyDownloads AS legitDownloads,
       sim.distance AS editDistance,
       sim.kind AS kind,
       size(services) AS servicesAtRisk,
       collect(DISTINCT m.handle) AS suspectMaintainers
ORDER BY servicesAtRisk DESC, sim.distance ASC, legit.weeklyDownloads DESC
LIMIT $limit
`.trim(),
  params: z.object({
    minServices: z.number().int().min(0).max(50).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  example: { minServices: 1, limit: 20 },
  tags: ["multi-hop", "cross-domain"],
  traversal: "Package → SIMILAR_TO → Package → Version ← up to 4 × DEPENDS_ON ← Service",
});

/**
 * Two different traversals, composed.
 *
 * Path one runs over the service call graph; path two runs over the dependency
 * graph. The interesting result is where they meet: a critical service that is
 * clean itself but talks to something that is not.
 */
export const inheritedExposure = defineQuery({
  id: "risk.inheritedExposure",
  title: "Inherited exposure",
  question: "Which critical services are clean themselves but call something that is not?",
  why: "Two unrelated traversals composed in a single statement — hops through the service call graph, then hops through the dependency graph. This is the query that is genuinely awkward to express relationally: two independent recursive expansions joined at their far ends.",
  cypher: `
MATCH (caller:Service)
WHERE caller.tier = 'critical'
MATCH callRoute = (caller)-[:CALLS*1..3]->(callee:Service)
WHERE callee <> caller
MATCH (callee)-[:USES]->(:Version)-[:DEPENDS_ON*0..3]->(v:Version)<-[:AFFECTS]-(a:Advisory)
WHERE a.severity IN $severities
  AND NOT (caller)-[:USES]->(:Version)-[:DEPENDS_ON*0..3]->(v)
MATCH (p:Package)-[:HAS_VERSION]->(v)
WITH caller, callee, a, p, callRoute, length(callRoute) AS callHops
ORDER BY callHops ASC
WITH caller, callee, a, p, collect(callRoute)[0] AS bestRoute, min(callHops) AS callHops
RETURN caller.slug AS callerSlug,
       caller.name AS callerName,
       caller.tier AS callerTier,
       callee.slug AS calleeSlug,
       callee.name AS calleeName,
       callHops,
       [n IN nodes(bestRoute) | n.slug] AS callChain,
       a.id AS advisoryId,
       a.title AS advisoryTitle,
       a.severity AS severity,
       p.key AS packageKey
ORDER BY callHops ASC, severity ASC, callerName ASC
LIMIT $limit
`.trim(),
  params: z.object({
    severities: z.array(z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"])).default(["CRITICAL", "HIGH"]),
    limit: z.number().int().min(1).max(100).default(25),
  }),
  example: { severities: ["CRITICAL", "HIGH"], limit: 25 },
  tags: ["multi-hop", "cross-domain"],
  traversal: "Service → up to 3 × CALLS → Service → Version → up to 3 × DEPENDS_ON → Version ← Advisory",
});

export const riskQueries = {
  chokepoints,
  maintainerBlastRadius,
  typosquats,
  inheritedExposure,
};
