import type {
  GraphEdge,
  GraphNode,
  GraphPayload,
  NodeLabel,
  RelationshipType,
  Severity,
  ServiceTier,
} from "@/lib/domain/types";
import type { PlainNode, PlainRelationship } from "@/lib/db/serialize";

import {
  advisoryAffectsEdges,
  advisoryConsumerEdges,
  advisoryUpstreamEdges,
  maintainerConsumerEdges,
  maintainerEdges,
  maintainerReleaseEdges,
  packageAdvisoryEdges,
  packageConsumerEdges,
  packageDownstreamEdges,
  packageUpstreamEdges,
  packageVersionEdges,
  serviceAdvisoryEdges,
  serviceCallEdges,
  serviceDependencyEdges,
  serviceOwnerEdges,
} from "./catalog/graph";
import { runQuery } from "./run";

export type SeedKind = "service" | "package" | "advisory" | "maintainer";

type EdgeRow = { source: PlainNode; rel: PlainRelationship; target: PlainNode };

/**
 * Assembles a renderable subgraph from several small edge-list queries.
 *
 * Each fragment is a single, simple statement — easier to reason about, easier
 * to profile, and portable across openCypher implementations. They run
 * concurrently and are merged here, where nodes are derived from the edges so
 * the two can never disagree.
 */
export async function buildNeighbourhood(
  kind: SeedKind,
  id: string,
  options: { maxDepth?: number; edgeLimit?: number } = {},
): Promise<GraphPayload> {
  const maxDepth = options.maxDepth ?? 3;
  const edgeLimit = options.edgeLimit ?? 500;

  const fragments = (() => {
    switch (kind) {
      case "service":
        return [
          runQuery<typeof serviceDependencyEdges.params, EdgeRow>(serviceDependencyEdges, {
            slug: id,
            maxDepth,
            edgeLimit,
          }),
          runQuery<typeof serviceOwnerEdges.params, EdgeRow>(serviceOwnerEdges, { slug: id }),
          runQuery<typeof serviceCallEdges.params, EdgeRow>(serviceCallEdges, { slug: id, edgeLimit }),
          runQuery<typeof serviceAdvisoryEdges.params, EdgeRow>(serviceAdvisoryEdges, {
            slug: id,
            maxDepth,
            edgeLimit,
          }),
        ];
      case "package":
        return [
          runQuery<typeof packageVersionEdges.params, EdgeRow>(packageVersionEdges, {
            packageKey: id,
            edgeLimit,
          }),
          runQuery<typeof packageDownstreamEdges.params, EdgeRow>(packageDownstreamEdges, {
            packageKey: id,
            maxDepth,
            edgeLimit,
          }),
          runQuery<typeof packageUpstreamEdges.params, EdgeRow>(packageUpstreamEdges, {
            packageKey: id,
            maxDepth,
            edgeLimit,
          }),
          runQuery<typeof packageConsumerEdges.params, EdgeRow>(packageConsumerEdges, {
            packageKey: id,
            edgeLimit,
          }),
          runQuery<typeof packageAdvisoryEdges.params, EdgeRow>(packageAdvisoryEdges, {
            packageKey: id,
            edgeLimit,
          }),
        ];
      case "advisory":
        return [
          runQuery<typeof advisoryAffectsEdges.params, EdgeRow>(advisoryAffectsEdges, {
            advisoryId: id,
            edgeLimit,
          }),
          runQuery<typeof advisoryUpstreamEdges.params, EdgeRow>(advisoryUpstreamEdges, {
            advisoryId: id,
            maxDepth,
            edgeLimit,
          }),
          runQuery<typeof advisoryConsumerEdges.params, EdgeRow>(advisoryConsumerEdges, {
            advisoryId: id,
            edgeLimit,
          }),
        ];
      case "maintainer":
        return [
          runQuery<typeof maintainerEdges.params, EdgeRow>(maintainerEdges, { handle: id, edgeLimit }),
          runQuery<typeof maintainerReleaseEdges.params, EdgeRow>(maintainerReleaseEdges, {
            handle: id,
            edgeLimit,
          }),
          runQuery<typeof maintainerConsumerEdges.params, EdgeRow>(maintainerConsumerEdges, {
            handle: id,
            edgeLimit,
          }),
        ];
    }
  })();

  const settled = await Promise.all(fragments);
  const rows = settled.flat();

  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  for (const row of rows) {
    if (!row?.rel || !row.source || !row.target) continue;
    const source = describeNode(row.source);
    const target = describeNode(row.target);
    if (!source || !target) continue;

    nodes.set(source.id, nodes.get(source.id) ?? source);
    nodes.set(target.id, nodes.get(target.id) ?? target);

    edges.set(row.rel.elementId, {
      id: row.rel.elementId,
      source: source.id,
      target: target.id,
      type: row.rel.type as RelationshipType,
      meta: row.rel.properties,
    });
  }

  const seedLabel: NodeLabel =
    kind === "service"
      ? "Service"
      : kind === "package"
        ? "Package"
        : kind === "advisory"
          ? "Advisory"
          : "Maintainer";

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated: rows.length >= edgeLimit,
    seed: { id: seedIdentity(kind, id), label: seedLabel },
  };
}

/** Node identity in the payload is the business key, not the internal element id. */
function describeNode(node: PlainNode): GraphNode | null {
  const label = (node.labels[0] ?? "") as NodeLabel;
  const props = node.properties as Record<string, string | number | boolean | null>;

  switch (label) {
    case "Service":
      return {
        id: `Service:${props.slug}`,
        label,
        caption: String(props.name ?? props.slug),
        sub: String(props.tier ?? ""),
        tier: (props.tier as ServiceTier) ?? null,
        meta: { slug: props.slug, shipsExternally: props.shipsExternally },
      };
    case "Team":
      return { id: `Team:${props.slug}`, label, caption: String(props.name ?? props.slug), sub: "team" };
    case "Package":
      return {
        id: `Package:${props.key}`,
        label,
        caption: String(props.name ?? props.key),
        sub: String(props.ecosystem ?? ""),
        meta: { key: props.key, weeklyDownloads: props.weeklyDownloads },
      };
    case "Version":
      return {
        id: `Version:${props.key}`,
        label,
        caption: `${props.name}@${props.version}`,
        sub: String(props.ecosystem ?? ""),
        meta: { key: props.key, packageKey: props.packageKey },
      };
    case "Advisory":
      return {
        id: `Advisory:${props.id}`,
        label,
        caption: String(props.id),
        sub: String(props.severity ?? ""),
        severity: (props.severity as Severity) ?? null,
        meta: { cvss: props.cvss, verified: props.verified },
      };
    case "Maintainer":
      return { id: `Maintainer:${props.handle}`, label, caption: String(props.handle), sub: "maintainer" };
    case "License":
      return {
        id: `License:${props.spdxId}`,
        label,
        caption: String(props.spdxId),
        sub: String(props.category ?? ""),
      };
    default:
      return null;
  }
}

function seedIdentity(kind: SeedKind, id: string): string {
  switch (kind) {
    case "service":
      return `Service:${id}`;
    case "package":
      return `Package:${id}`;
    case "advisory":
      return `Advisory:${id}`;
    case "maintainer":
      return `Maintainer:${id}`;
  }
}
