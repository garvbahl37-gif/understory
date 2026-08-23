/**
 * Prints a census of the generated dataset without touching the database.
 * Handy for sizing the graph against the free-tier limits before loading it.
 */
import { generate, summarise } from "./generate";

const dataset = generate();
const totals = summarise(dataset);

const nodeRows: Array<[string, number]> = [
  ["License", dataset.licenses.length],
  ["Team", dataset.teams.length],
  ["Service", dataset.services.length],
  ["Package", dataset.packages.length],
  ["Version", dataset.versions.length],
  ["Maintainer", dataset.maintainers.length],
  ["Advisory", dataset.advisories.length],
];

const relRows: Array<[string, number]> = [
  ["OWNS", dataset.owns.length],
  ["CALLS", dataset.calls.length],
  ["USES", dataset.uses.length],
  ["HAS_VERSION", dataset.hasVersion.length],
  ["DEPENDS_ON", dataset.dependsOn.length],
  ["SUPERSEDES", dataset.supersedes.length],
  ["LICENSED_UNDER", dataset.licensedUnder.length],
  ["MAINTAINS", dataset.maintains.length],
  ["PUBLISHED", dataset.published.length],
  ["AFFECTS", dataset.affects.length],
  ["SIMILAR_TO", dataset.similarTo.length],
];

const pad = (s: string, n: number) => s.padEnd(n, " ");
console.log("\nNodes");
for (const [label, count] of nodeRows) console.log(`  ${pad(label, 14)} ${String(count).padStart(6)}`);
console.log("\nRelationships");
for (const [type, count] of relRows) console.log(`  ${pad(type, 16)} ${String(count).padStart(6)}`);
console.log(`\nTotal: ${totals.nodes} nodes, ${totals.relationships} relationships\n`);

const single = dataset.packages.filter(
  (p) => dataset.maintains.filter((m) => m.to === p.key).length === 1,
).length;
const no2fa = dataset.maintainers.filter((m) => !m.twoFactorEnabled).length;
console.log(`Single-maintainer packages: ${single} of ${dataset.packages.length}`);
console.log(`Maintainers without 2FA:    ${no2fa} of ${dataset.maintainers.length}`);
console.log(`Real advisories:            ${dataset.advisories.filter((a) => a.verified).length}`);
console.log(`Synthetic advisories:       ${dataset.advisories.filter((a) => !a.verified).length}\n`);

// ── reachability diagnostics ────────────────────────────────────────────────
// Confirms the graph actually has the depth the queries are written for, and
// that every advisory is reachable from something we run.

const depsByVersion = new Map<string, string[]>();
for (const edge of dataset.dependsOn) {
  const list = depsByVersion.get(edge.from) ?? [];
  list.push(edge.to);
  depsByVersion.set(edge.from, list);
}

const usesByService = new Map<string, string[]>();
for (const edge of dataset.uses) {
  const list = usesByService.get(edge.from) ?? [];
  list.push(edge.to);
  usesByService.set(edge.from, list);
}

/** Breadth-first closure of a service's dependency tree, capped at `maxDepth`. */
function closure(serviceSlug: string, maxDepth = 8): Map<string, number> {
  const seen = new Map<string, number>();
  let frontier: Array<readonly [string, number]> = (usesByService.get(serviceSlug) ?? []).map(
    (v) => [v, 0] as readonly [string, number],
  );
  for (const [key, depth] of frontier) if (!seen.has(key)) seen.set(key, depth);

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: Array<readonly [string, number]> = [];
    for (const [key] of frontier) {
      for (const child of depsByVersion.get(key) ?? []) {
        if (seen.has(child)) continue;
        seen.set(child, depth);
        next.push([child, depth]);
      }
    }
    frontier = next;
  }
  return seen;
}

const affectedVersions = new Set(dataset.affects.map((a) => a.to));
const advisoriesByVersion = new Map<string, string[]>();
for (const edge of dataset.affects) {
  const list = advisoriesByVersion.get(edge.to) ?? [];
  list.push(edge.from);
  advisoriesByVersion.set(edge.to, list);
}

let deepest = { service: "", depth: 0 };
const reachedAdvisories = new Set<string>();
const footprints: Array<[string, number, number]> = [];

for (const service of dataset.services) {
  const reach = closure(service.slug);
  let maxDepth = 0;
  let hits = 0;
  for (const [key, depth] of reach) {
    if (depth > maxDepth) maxDepth = depth;
    if (affectedVersions.has(key)) {
      hits += 1;
      for (const id of advisoriesByVersion.get(key) ?? []) reachedAdvisories.add(id);
    }
  }
  if (maxDepth > deepest.depth) deepest = { service: service.slug, depth: maxDepth };
  footprints.push([service.slug, reach.size, hits]);
}

footprints.sort((a, b) => b[1] - a[1]);
console.log("Deepest dependency chain:", deepest.service, `${deepest.depth} hops`);
console.log("Largest footprints:");
for (const [slug, size, hits] of footprints.slice(0, 5)) {
  console.log(`  ${slug.padEnd(24)} ${String(size).padStart(4)} versions   ${hits} vulnerable`);
}
const unreachable = dataset.advisories.filter((a) => !reachedAdvisories.has(a.id));
console.log(
  `\nAdvisories reachable from at least one service: ${reachedAdvisories.size}/${dataset.advisories.length}`,
);
if (unreachable.length > 0) console.log("  unreachable:", unreachable.map((a) => a.id).join(", "));
