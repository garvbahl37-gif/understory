import type { QueryDefinition } from "../registry";

import { advisoryQueries } from "./advisories";
import { graphQueries } from "./graph";
import { licenseQueries } from "./licenses";
import { overviewQueries } from "./overview";
import { packageQueries } from "./packages";
import { riskQueries } from "./risk";
import { serviceQueries } from "./services";

export * from "./advisories";
export * from "./graph";
export * from "./licenses";
export * from "./overview";
export * from "./packages";
export * from "./risk";
export * from "./services";

const ALL = [
  ...Object.values(overviewQueries),
  ...Object.values(advisoryQueries),
  ...Object.values(serviceQueries),
  ...Object.values(packageQueries),
  ...Object.values(riskQueries),
  ...Object.values(licenseQueries),
  ...Object.values(graphQueries),
] as QueryDefinition[];

/** Every statement the application can run, keyed by its stable id. */
export const QUERY_CATALOG: Readonly<Record<string, QueryDefinition>> = Object.freeze(
  Object.fromEntries(ALL.map((q) => [q.id, q])),
);

export const QUERY_LIST: readonly QueryDefinition[] = Object.freeze(
  [...ALL].sort((a, b) => a.id.localeCompare(b.id)),
);

/**
 * The subset shown in the in-app query console.
 *
 * The explorer's edge-list fragments are deliberately excluded — they are
 * plumbing, and a reader browsing the catalogue wants the questions, not the
 * fifteen small queries that draw a picture.
 */
export const FEATURED_QUERY_IDS = [
  "advisory.blastRadius",
  "license.contamination",
  "risk.inheritedExposure",
  "risk.chokepoints",
  "risk.maintainerBlastRadius",
  "risk.typosquats",
  "advisory.upgradePath",
  "package.downstreamServices",
  "service.transitiveFootprint",
  "service.advisories",
  "overview.exposedServices",
  "overview.topReachPackages",
  "team.list",
  "service.licenseMix",
  "advisory.list",
  "license.summary",
  "overview.nodeCounts",
  "overview.relationshipCounts",
] as const;

export function getQuery(id: string): QueryDefinition | undefined {
  return QUERY_CATALOG[id];
}
