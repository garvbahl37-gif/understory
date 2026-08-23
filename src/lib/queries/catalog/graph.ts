import { z } from "zod";

import { defineQuery } from "../registry";

/**
 * Queries that feed the interactive explorer.
 *
 * Every one of them returns the same three columns — `source`, `rel`, `target`
 * — so the renderer only ever has to understand a deduplicated edge list. Nodes
 * are derived from the endpoints, which means a subgraph can be assembled from
 * several independent fragments without any of them needing to agree on which
 * nodes exist.
 */
const depthParams = {
  maxDepth: z.number().int().min(1).max(5).default(3),
  edgeLimit: z.number().int().min(10).max(1200).default(500),
};

export const serviceDependencyEdges = defineQuery({
  id: "graph.serviceDependencyEdges",
  title: "Explorer — dependency edges below a service",
  question: "Draw everything this service stands on, out to N hops.",
  why: "Unwinding the relationships of a variable-length path and deduplicating them is the cheapest way to hand a renderer a subgraph. There is no relational equivalent that returns edges rather than rows.",
  cypher: `
MATCH route = (root:Service {slug: $slug})-[:USES|DEPENDS_ON*1..5]->(:Version)
WHERE length(route) <= $maxDepth
UNWIND relationships(route) AS r
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80), ...depthParams }),
  example: { slug: "checkout-api", maxDepth: 3, edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
  traversal: "Service → up to 5 × (USES | DEPENDS_ON) → Version",
});

export const serviceOwnerEdges = defineQuery({
  id: "graph.serviceOwnerEdges",
  title: "Explorer — who owns this service",
  question: "Which team is on the hook for this?",
  why: "Ownership is one edge away, so it costs nothing to draw it alongside the dependency tree.",
  cypher: `
MATCH (:Team)-[r:OWNS]->(:Service {slug: $slug})
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80) }),
  example: { slug: "checkout-api" },
  tags: ["graph-shape"],
});

export const serviceCallEdges = defineQuery({
  id: "graph.serviceCallEdges",
  title: "Explorer — service call edges",
  question: "What does this service talk to, and what talks to it?",
  why: "A second, completely different network laid over the same nodes. Heterogeneous edges are the whole point of a property graph.",
  cypher: `
MATCH (a:Service)-[r:CALLS]-(b:Service)
WHERE a.slug = $slug
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80), edgeLimit: depthParams.edgeLimit }),
  example: { slug: "checkout-api", edgeLimit: 500 },
  tags: ["graph-shape"],
});

export const serviceAdvisoryEdges = defineQuery({
  id: "graph.serviceAdvisoryEdges",
  title: "Explorer — advisories inside a service's subgraph",
  question: "Highlight the vulnerable nodes in what we just drew.",
  why: "The advisory edges attach to versions discovered by the traversal, so the highlight is always consistent with the picture.",
  cypher: `
MATCH route = (root:Service {slug: $slug})-[:USES|DEPENDS_ON*1..5]->(v:Version)
WHERE length(route) <= $maxDepth
MATCH (v)<-[r:AFFECTS]-(:Advisory)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ slug: z.string().min(1).max(80), ...depthParams }),
  example: { slug: "checkout-api", maxDepth: 3, edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const packageVersionEdges = defineQuery({
  id: "graph.packageVersionEdges",
  title: "Explorer — a package's releases",
  question: "Show the releases this package has published.",
  why: "One hop that anchors the rest of the drawing.",
  cypher: `
MATCH (:Package {key: $packageKey})-[r:HAS_VERSION]->(:Version)
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200), edgeLimit: depthParams.edgeLimit }),
  example: { packageKey: "npm:lodash", edgeLimit: 500 },
  tags: ["graph-shape"],
});

export const packageDownstreamEdges = defineQuery({
  id: "graph.packageDownstreamEdges",
  title: "Explorer — what a package depends on",
  question: "Draw everything beneath this package.",
  why: "Outward traversal from every release of the package.",
  cypher: `
MATCH (:Package {key: $packageKey})-[:HAS_VERSION]->(v:Version)
MATCH route = (v)-[:DEPENDS_ON*1..5]->(:Version)
WHERE length(route) <= $maxDepth
UNWIND relationships(route) AS r
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200), ...depthParams }),
  example: { packageKey: "npm:lodash", maxDepth: 3, edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const packageUpstreamEdges = defineQuery({
  id: "graph.packageUpstreamEdges",
  title: "Explorer — what depends on a package",
  question: "Draw everything that stands on this package.",
  why: "Exactly the same edge, traversed the other way. A graph makes reverse reachability free; a relational index does not.",
  cypher: `
MATCH (:Package {key: $packageKey})-[:HAS_VERSION]->(v:Version)
MATCH route = (:Version)-[:DEPENDS_ON*1..5]->(v)
WHERE length(route) <= $maxDepth
UNWIND relationships(route) AS r
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200), ...depthParams }),
  example: { packageKey: "npm:lodash", maxDepth: 3, edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const packageConsumerEdges = defineQuery({
  id: "graph.packageConsumerEdges",
  title: "Explorer — services reaching a package",
  question: "Which of our services connect into this part of the graph?",
  why: "Attaches the operational half of the model to the registry half.",
  cypher: `
MATCH (:Package {key: $packageKey})-[:HAS_VERSION]->(pv:Version)
MATCH (entry:Version)-[:DEPENDS_ON*0..5]->(pv)
MATCH (:Service)-[r:USES]->(entry)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200), edgeLimit: depthParams.edgeLimit }),
  example: { packageKey: "npm:lodash", edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const packageAdvisoryEdges = defineQuery({
  id: "graph.packageAdvisoryEdges",
  title: "Explorer — advisories on a package",
  question: "Which releases of this package are known bad?",
  why: "One hop from the release nodes already on screen.",
  cypher: `
MATCH (:Package {key: $packageKey})-[:HAS_VERSION]->(v:Version)
MATCH (v)<-[r:AFFECTS]-(:Advisory)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ packageKey: z.string().min(1).max(200), edgeLimit: depthParams.edgeLimit }),
  example: { packageKey: "npm:lodash", edgeLimit: 500 },
  tags: ["graph-shape"],
});

export const advisoryAffectsEdges = defineQuery({
  id: "graph.advisoryAffectsEdges",
  title: "Explorer — what an advisory affects",
  question: "Which releases does this advisory cover?",
  why: "The seed of the blast-radius drawing.",
  cypher: `
MATCH (:Advisory {id: $advisoryId})-[r:AFFECTS]->(:Version)
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ advisoryId: z.string().min(1).max(64), edgeLimit: depthParams.edgeLimit }),
  example: { advisoryId: "CVE-2021-44228", edgeLimit: 500 },
  tags: ["graph-shape"],
});

export const advisoryUpstreamEdges = defineQuery({
  id: "graph.advisoryUpstreamEdges",
  title: "Explorer — the blast radius subgraph",
  question: "Draw every dependency chain that leads to this advisory.",
  why: "This is the blast-radius answer rendered as a picture instead of a table — the same traversal, a different projection.",
  cypher: `
MATCH (:Advisory {id: $advisoryId})-[:AFFECTS]->(vulnerable:Version)
MATCH route = (:Version)-[:DEPENDS_ON*1..5]->(vulnerable)
WHERE length(route) <= $maxDepth
UNWIND relationships(route) AS r
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ advisoryId: z.string().min(1).max(64), ...depthParams }),
  example: { advisoryId: "CVE-2021-44228", maxDepth: 3, edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const advisoryConsumerEdges = defineQuery({
  id: "graph.advisoryConsumerEdges",
  title: "Explorer — services in an advisory's blast radius",
  question: "Attach the affected services to the drawing.",
  why: "Closes the loop between a CVE and the things we actually run.",
  cypher: `
MATCH (:Advisory {id: $advisoryId})-[:AFFECTS]->(vulnerable:Version)
MATCH (entry:Version)-[:DEPENDS_ON*0..5]->(vulnerable)
MATCH (:Service)-[r:USES]->(entry)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ advisoryId: z.string().min(1).max(64), edgeLimit: depthParams.edgeLimit }),
  example: { advisoryId: "CVE-2021-44228", edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const maintainerEdges = defineQuery({
  id: "graph.maintainerEdges",
  title: "Explorer — a maintainer's packages",
  question: "What does this person control?",
  why: "The first hop of an account-compromise story.",
  cypher: `
MATCH (:Maintainer {handle: $handle})-[r:MAINTAINS]->(:Package)
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ handle: z.string().min(1).max(80), edgeLimit: depthParams.edgeLimit }),
  example: { handle: "j-halloran", edgeLimit: 500 },
  tags: ["graph-shape"],
});

export const maintainerReleaseEdges = defineQuery({
  id: "graph.maintainerReleaseEdges",
  title: "Explorer — releases under a maintainer",
  question: "Which releases could this account publish over?",
  why: "Two hops out from the person to the artefacts that would carry a payload.",
  cypher: `
MATCH (:Maintainer {handle: $handle})-[:MAINTAINS]->(:Package)-[r:HAS_VERSION]->(:Version)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ handle: z.string().min(1).max(80), edgeLimit: depthParams.edgeLimit }),
  example: { handle: "j-halloran", edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

export const maintainerConsumerEdges = defineQuery({
  id: "graph.maintainerConsumerEdges",
  title: "Explorer — services exposed to a maintainer",
  question: "Which services would a malicious release from this account reach?",
  why: "The far end of the compromise path, in the same picture as the near end.",
  cypher: `
MATCH (:Maintainer {handle: $handle})-[:MAINTAINS]->(:Package)-[:HAS_VERSION]->(v:Version)
MATCH (entry:Version)-[:DEPENDS_ON*0..4]->(v)
MATCH (:Service)-[r:USES]->(entry)
WITH DISTINCT r
RETURN startNode(r) AS source, r AS rel, endNode(r) AS target
LIMIT $edgeLimit
`.trim(),
  params: z.object({ handle: z.string().min(1).max(80), edgeLimit: depthParams.edgeLimit }),
  example: { handle: "j-halloran", edgeLimit: 500 },
  tags: ["multi-hop", "graph-shape"],
});

/** Powers the explorer's seed picker and the global search box. */
export const seedCandidates = defineQuery({
  id: "graph.seedCandidates",
  title: "Explorer — searchable starting points",
  question: "What can I start an exploration from?",
  why: "One statement searches four different node labels. A heterogeneous graph makes that trivial; a relational schema turns it into a four-way UNION over tables that share no columns.",
  cypher: `
MATCH (s:Service)
WHERE $search = '' OR toLower(s.name) CONTAINS toLower($search) OR toLower(s.slug) CONTAINS toLower($search)
RETURN 'Service' AS label, s.slug AS id, s.name AS caption, s.tier AS sub, 3 AS weight, 0 AS rank
ORDER BY caption ASC
LIMIT $perLabel
UNION ALL
MATCH (p:Package)
WHERE $search = '' OR toLower(p.name) CONTAINS toLower($search)
RETURN 'Package' AS label, p.key AS id, p.name AS caption, p.ecosystem AS sub, 2 AS weight, p.weeklyDownloads AS rank
ORDER BY rank DESC
LIMIT $perLabel
UNION ALL
MATCH (a:Advisory)
WHERE $search = '' OR toLower(a.id) CONTAINS toLower($search) OR toLower(a.title) CONTAINS toLower($search)
RETURN 'Advisory' AS label, a.id AS id, a.id AS caption, a.severity AS sub, 1 AS weight, a.cvss AS rank
ORDER BY rank DESC
LIMIT $perLabel
UNION ALL
MATCH (m:Maintainer)
WHERE $search = '' OR toLower(m.handle) CONTAINS toLower($search) OR toLower(m.name) CONTAINS toLower($search)
RETURN 'Maintainer' AS label, m.handle AS id, m.handle AS caption, m.name AS sub, 0 AS weight, m.publicPackages AS rank
ORDER BY rank DESC
LIMIT $perLabel
`.trim(),
  params: z.object({
    search: z.string().max(120).default(""),
    perLabel: z.number().int().min(1).max(25).default(6),
  }),
  example: { search: "", perLabel: 6 },
  tags: ["lookup", "graph-shape"],
});

export const graphQueries = {
  serviceDependencyEdges,
  serviceOwnerEdges,
  serviceCallEdges,
  serviceAdvisoryEdges,
  packageVersionEdges,
  packageDownstreamEdges,
  packageUpstreamEdges,
  packageConsumerEdges,
  packageAdvisoryEdges,
  advisoryAffectsEdges,
  advisoryUpstreamEdges,
  advisoryConsumerEdges,
  maintainerEdges,
  maintainerReleaseEdges,
  maintainerConsumerEdges,
  seedCandidates,
};
