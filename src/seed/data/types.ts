import type { Ecosystem } from "@/lib/domain/types";

/**
 * A compact tuple keeps these tables readable at a glance. The loader expands
 * them into nodes and edges.
 *
 * [name, weeklyDownloads (millions), spdxId, dependency names, description, deprecated?]
 */
export type PackageRow = [
  name: string,
  weeklyDownloadsMillions: number,
  license: string,
  deps: string[],
  description: string,
  deprecated?: boolean,
];

export type EcosystemTable = { ecosystem: Ecosystem; rows: PackageRow[] };
