import { z } from "zod";

import { LICENSE_CATEGORIES } from "@/lib/domain/types";

import { defineQuery } from "../registry";

/**
 * The flagship "a relational database would find this awkward" query.
 *
 * It crosses three otherwise unrelated parts of the model in one statement:
 *
 *   licensing        (Version)-[:LICENSED_UNDER]->(License)
 *   dependency depth (Version)-[:DEPENDS_ON*]->(Version)      ← variable length
 *   ownership        (Team)-[:OWNS]->(Service)
 *
 * and it returns *the path*, because "you have a GPL obligation" is useless
 * without "…and here is the four-package chain that put it there".
 */
export const licenseContamination = defineQuery({
  id: "license.contamination",
  title: "Copyleft contamination paths",
  question:
    "Which products we ship to customers have picked up a copyleft obligation from somewhere in their dependency tree — and through exactly which chain?",
  why: "Three unrelated concerns joined by a variable-depth traversal, returning the offending path. In SQL: a recursive CTE over dependencies, joined to licences, joined to services, joined to teams, with a hand-rolled path accumulator and cycle guard. Here it is nine lines and the path comes for free.",
  cypher: `
MATCH (l:License)<-[:LICENSED_UNDER]-(obligated:Version)
WHERE l.category IN $categories
MATCH (s:Service)-[:USES]->(entry:Version)
WHERE s.shipsExternally = true
MATCH route = shortestPath((entry)-[:DEPENDS_ON*0..6]->(obligated))
WHERE length(route) <= $maxDepth
OPTIONAL MATCH (t:Team)-[:OWNS]->(s)
WITH s, t, l, obligated, route, length(route) AS hops
ORDER BY hops ASC
WITH s, t, l,
     collect({version: obligated.key, hops: hops, chain: [n IN nodes(route) | n.key]}) AS routes,
     count(DISTINCT obligated) AS distinctVersions
RETURN s.slug AS serviceSlug,
       s.name AS serviceName,
       s.tier AS tier,
       t.name AS teamName,
       l.spdxId AS license,
       l.name AS licenseName,
       l.category AS category,
       routes[0].version AS version,
       routes[0].hops AS hops,
       routes[0].chain AS chain,
       distinctVersions
ORDER BY hops ASC, serviceName ASC, license ASC
`.trim(),
  params: z.object({
    categories: z
      .array(z.enum(LICENSE_CATEGORIES))
      .default(["strong-copyleft", "network-copyleft", "source-available", "unknown"]),
    maxDepth: z.number().int().min(0).max(6).default(6),
  }),
  example: {
    categories: ["strong-copyleft", "network-copyleft", "source-available", "unknown"],
    maxDepth: 6,
  },
  tags: ["multi-hop", "shortest-path", "cross-domain"],
  traversal: "License ← Version ← shortestPath over up to 6 × DEPENDS_ON ← Service ← Team",
});

export const licenseSummary = defineQuery({
  id: "license.summary",
  title: "Licence distribution",
  question: "What is the overall licence mix across every release we have indexed?",
  why: "The denominator for the contamination table.",
  cypher: `
MATCH (l:License)
OPTIONAL MATCH (l)<-[:LICENSED_UNDER]-(v:Version)
WITH l, count(v) AS versions
OPTIONAL MATCH (l)<-[:LICENSED_UNDER]-(:Version)<-[:HAS_VERSION]-(p:Package)
RETURN l.spdxId AS spdxId,
       l.name AS name,
       l.category AS category,
       l.osiApproved AS osiApproved,
       versions,
       count(DISTINCT p) AS packages
ORDER BY versions DESC
`.trim(),
  params: z.object({}),
  example: {},
  tags: ["aggregation"],
});

export const licenseQueries = { licenseContamination, licenseSummary };
