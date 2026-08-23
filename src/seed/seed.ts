/**
 * Loads the generated graph into CognoDB.
 *
 *   npm run seed            load (idempotent — MERGE everywhere)
 *   npm run seed -- --reset wipe the database first
 *   npm run seed -- --dry-run  build the dataset and print it, touch nothing
 *
 * Everything is parameterised and batched. The free (c0) instance has 256 MB of
 * RAM, so we send a few hundred rows per transaction rather than one enormous
 * statement, and we report progress as we go because a slow network makes a
 * silent loader feel broken.
 */
import { loadEnv } from "@/lib/load-env";

loadEnv();

import { closeDriver, readQuery, writeQuery } from "@/lib/db/driver";
import { describeTarget, readDbConfig, resetDbConfigCache } from "@/lib/db/config";
import { toDbError } from "@/lib/db/errors";

import { generate, summarise, type GraphDataset } from "./generate";

const BATCH = 400;

const argv = new Set(process.argv.slice(2));
const RESET = argv.has("--reset");
const DRY_RUN = argv.has("--dry-run");

// ── console helpers ─────────────────────────────────────────────────────────

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const info = (message: string) => console.log(`  ${message}`);
const step = (message: string) => console.log(`\n▸ ${message}`);

function progress(label: string, done: number, total: number) {
  const width = 24;
  const filled = total === 0 ? width : Math.round((done / total) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const line = `  ${label.padEnd(18)} ${bar} ${String(done).padStart(5)}/${total}`;
  process.stdout.write(`\r${line}${done === total ? "\n" : ""}`);
}

// ── schema ──────────────────────────────────────────────────────────────────

/**
 * Uniqueness constraints double as indexes, which is what makes every
 * `MATCH (n:Label {key: $k})` in the query catalogue a single-node seek rather
 * than a scan. If the server does not support a given statement we warn and
 * carry on rather than abandoning the load.
 */
const CONSTRAINTS: Array<[string, string]> = [
  ["team_slug", "CREATE CONSTRAINT team_slug IF NOT EXISTS FOR (n:Team) REQUIRE n.slug IS UNIQUE"],
  ["service_slug", "CREATE CONSTRAINT service_slug IF NOT EXISTS FOR (n:Service) REQUIRE n.slug IS UNIQUE"],
  ["package_key", "CREATE CONSTRAINT package_key IF NOT EXISTS FOR (n:Package) REQUIRE n.key IS UNIQUE"],
  ["version_key", "CREATE CONSTRAINT version_key IF NOT EXISTS FOR (n:Version) REQUIRE n.key IS UNIQUE"],
  [
    "maintainer_handle",
    "CREATE CONSTRAINT maintainer_handle IF NOT EXISTS FOR (n:Maintainer) REQUIRE n.handle IS UNIQUE",
  ],
  ["advisory_id", "CREATE CONSTRAINT advisory_id IF NOT EXISTS FOR (n:Advisory) REQUIRE n.id IS UNIQUE"],
  ["license_spdx", "CREATE CONSTRAINT license_spdx IF NOT EXISTS FOR (n:License) REQUIRE n.spdxId IS UNIQUE"],
];

const INDEXES: Array<[string, string]> = [
  ["package_name", "CREATE INDEX package_name IF NOT EXISTS FOR (n:Package) ON (n.name)"],
  ["package_ecosystem", "CREATE INDEX package_ecosystem IF NOT EXISTS FOR (n:Package) ON (n.ecosystem)"],
  ["version_package", "CREATE INDEX version_package IF NOT EXISTS FOR (n:Version) ON (n.packageKey)"],
  ["advisory_severity", "CREATE INDEX advisory_severity IF NOT EXISTS FOR (n:Advisory) ON (n.severity)"],
  ["service_tier", "CREATE INDEX service_tier IF NOT EXISTS FOR (n:Service) ON (n.tier)"],
  ["license_category", "CREATE INDEX license_category IF NOT EXISTS FOR (n:License) ON (n.category)"],
];

async function applySchema() {
  step("Schema");
  for (const [name, statement] of [...CONSTRAINTS, ...INDEXES]) {
    try {
      await writeQuery(statement, {}, { label: `schema:${name}` });
      info(`✓ ${name}`);
    } catch (error) {
      info(`⚠ ${name} — ${toDbError(error).message} (continuing)`);
    }
  }
}

async function wipe() {
  step("Reset");
  let removed = 0;
  for (;;) {
    const rows = await writeQuery(
      "MATCH (n) WITH n LIMIT 2000 DETACH DELETE n RETURN count(n) AS deleted",
      {},
      { label: "seed:wipe" },
    );
    const deleted = rows.records[0]?.get("deleted")?.toNumber?.() ?? 0;
    if (deleted === 0) break;
    removed += deleted;
    process.stdout.write(`\r  deleted ${removed} nodes`);
  }
  process.stdout.write(`\r  deleted ${removed} nodes\n`);
}

// ── batched loading ─────────────────────────────────────────────────────────

async function load<T>(label: string, rows: T[], cypher: string) {
  if (rows.length === 0) {
    progress(label, 0, 0);
    return;
  }
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const slice = rows.slice(offset, offset + BATCH);
    await writeQuery(cypher, { rows: slice }, { label: `seed:${label}` });
    progress(label, Math.min(offset + BATCH, rows.length), rows.length);
  }
}

async function loadNodes(dataset: GraphDataset) {
  step("Nodes");

  await load(
    "License",
    dataset.licenses,
    `
UNWIND $rows AS row
MERGE (n:License {spdxId: row.spdxId})
SET n.name = row.name,
    n.category = row.category,
    n.osiApproved = row.osiApproved,
    n.obligation = row.obligation`,
  );

  await load(
    "Team",
    dataset.teams,
    `
UNWIND $rows AS row
MERGE (n:Team {slug: row.slug})
SET n.name = row.name, n.mission = row.mission, n.headcount = row.headcount`,
  );

  await load(
    "Service",
    dataset.services,
    `
UNWIND $rows AS row
MERGE (n:Service {slug: row.slug})
SET n.name = row.name,
    n.tier = row.tier,
    n.language = row.language,
    n.ecosystem = row.ecosystem,
    n.shipsExternally = row.shipsExternally,
    n.description = row.description,
    n.repo = row.repo,
    n.deployedAt = row.deployedAt`,
  );

  await load(
    "Package",
    dataset.packages,
    `
UNWIND $rows AS row
MERGE (n:Package {key: row.key})
SET n.name = row.name,
    n.ecosystem = row.ecosystem,
    n.description = row.description,
    n.weeklyDownloads = row.weeklyDownloads,
    n.repoUrl = row.repoUrl,
    n.firstPublished = row.firstPublished,
    n.deprecated = row.deprecated,
    n.suspicious = row.suspicious`,
  );

  await load(
    "Version",
    dataset.versions,
    `
UNWIND $rows AS row
MERGE (n:Version {key: row.key})
SET n.packageKey = row.packageKey,
    n.name = row.name,
    n.ecosystem = row.ecosystem,
    n.version = row.version,
    n.major = row.major,
    n.minor = row.minor,
    n.patch = row.patch,
    n.publishedAt = row.publishedAt,
    n.yanked = row.yanked`,
  );

  await load(
    "Maintainer",
    dataset.maintainers,
    `
UNWIND $rows AS row
MERGE (n:Maintainer {handle: row.handle})
SET n.name = row.name,
    n.joinedAt = row.joinedAt,
    n.twoFactorEnabled = row.twoFactorEnabled,
    n.publicPackages = row.publicPackages`,
  );

  await load(
    "Advisory",
    dataset.advisories,
    `
UNWIND $rows AS row
MERGE (n:Advisory {id: row.id})
SET n.source = row.source,
    n.title = row.title,
    n.summary = row.summary,
    n.severity = row.severity,
    n.cvss = row.cvss,
    n.cwe = row.cwe,
    n.publishedAt = row.publishedAt,
    n.exploitKnown = row.exploitKnown,
    n.verified = row.verified,
    n.reference = row.reference`,
  );
}

async function loadRelationships(dataset: GraphDataset) {
  step("Relationships");

  await load(
    "OWNS",
    dataset.owns,
    `
UNWIND $rows AS row
MATCH (t:Team {slug: row.from})
MATCH (s:Service {slug: row.to})
MERGE (t)-[:OWNS]->(s)`,
  );

  await load(
    "CALLS",
    dataset.calls,
    `
UNWIND $rows AS row
MATCH (a:Service {slug: row.from})
MATCH (b:Service {slug: row.to})
MERGE (a)-[r:CALLS]->(b)
SET r.protocol = row.props.protocol, r.criticality = row.props.criticality`,
  );

  await load(
    "USES",
    dataset.uses,
    `
UNWIND $rows AS row
MATCH (s:Service {slug: row.from})
MATCH (v:Version {key: row.to})
MERGE (s)-[r:USES]->(v)
SET r.scope = row.props.scope,
    r.declaredRange = row.props.declaredRange,
    r.lockfile = row.props.lockfile`,
  );

  await load(
    "HAS_VERSION",
    dataset.hasVersion,
    `
UNWIND $rows AS row
MATCH (p:Package {key: row.from})
MATCH (v:Version {key: row.to})
MERGE (p)-[:HAS_VERSION]->(v)`,
  );

  await load(
    "DEPENDS_ON",
    dataset.dependsOn,
    `
UNWIND $rows AS row
MATCH (a:Version {key: row.from})
MATCH (b:Version {key: row.to})
MERGE (a)-[r:DEPENDS_ON]->(b)
SET r.scope = row.props.scope, r.declaredRange = row.props.declaredRange`,
  );

  await load(
    "SUPERSEDES",
    dataset.supersedes,
    `
UNWIND $rows AS row
MATCH (newer:Version {key: row.from})
MATCH (older:Version {key: row.to})
MERGE (newer)-[:SUPERSEDES]->(older)`,
  );

  await load(
    "LICENSED_UNDER",
    dataset.licensedUnder,
    `
UNWIND $rows AS row
MATCH (v:Version {key: row.from})
MATCH (l:License {spdxId: row.to})
MERGE (v)-[:LICENSED_UNDER]->(l)`,
  );

  await load(
    "MAINTAINS",
    dataset.maintains,
    `
UNWIND $rows AS row
MATCH (m:Maintainer {handle: row.from})
MATCH (p:Package {key: row.to})
MERGE (m)-[r:MAINTAINS]->(p)
SET r.role = row.props.role, r.since = row.props.since`,
  );

  await load(
    "PUBLISHED",
    dataset.published,
    `
UNWIND $rows AS row
MATCH (m:Maintainer {handle: row.from})
MATCH (v:Version {key: row.to})
MERGE (m)-[r:PUBLISHED]->(v)
SET r.at = row.props.at`,
  );

  await load(
    "AFFECTS",
    dataset.affects,
    `
UNWIND $rows AS row
MATCH (a:Advisory {id: row.from})
MATCH (v:Version {key: row.to})
MERGE (a)-[r:AFFECTS]->(v)
SET r.introducedIn = row.props.introducedIn, r.fixedIn = row.props.fixedIn`,
  );

  await load(
    "SIMILAR_TO",
    dataset.similarTo,
    `
UNWIND $rows AS row
MATCH (a:Package {key: row.from})
MATCH (b:Package {key: row.to})
MERGE (a)-[r:SIMILAR_TO]->(b)
SET r.distance = row.props.distance, r.kind = row.props.kind`,
  );
}

async function verifyCounts() {
  step("Verification");
  const nodes = await readQuery<{ label: string; count: unknown }>(
    "MATCH (n) RETURN labels(n)[0] AS label, count(*) AS count ORDER BY count DESC",
    {},
    { label: "seed:verify-nodes" },
  );
  const rels = await readQuery<{ type: string; count: unknown }>(
    "MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count ORDER BY count DESC",
    {},
    { label: "seed:verify-rels" },
  );
  const num = (v: unknown) =>
    typeof v === "object" && v && "toNumber" in v ? (v as { toNumber(): number }).toNumber() : Number(v);

  let nodeTotal = 0;
  for (const row of nodes) {
    nodeTotal += num(row.count);
    info(`${String(row.label).padEnd(16)} ${String(num(row.count)).padStart(6)}`);
  }
  let relTotal = 0;
  for (const row of rels) {
    relTotal += num(row.count);
    info(`${String(row.type).padEnd(16)} ${String(num(row.count)).padStart(6)}`);
  }
  return { nodeTotal, relTotal };
}

// ── entrypoint ──────────────────────────────────────────────────────────────

async function main() {
  resetDbConfigCache();

  console.log("\nUnderstory — graph loader");
  const dataset = generate();
  const expected = summarise(dataset);
  info(`generated ${expected.nodes} nodes and ${expected.relationships} relationships`);

  if (DRY_RUN) {
    info("dry run: nothing was written");
    return;
  }

  const config = readDbConfig();
  if (!config.ok) {
    console.error(`\n✗ ${config.message}`);
    console.error("  Copy .env.example to .env.local and fill in your CognoDB details.\n");
    process.exitCode = 1;
    return;
  }
  info(`target ${describeTarget(config.config.uri)}`);

  if (RESET) await wipe();
  await applySchema();
  await loadNodes(dataset);
  await loadRelationships(dataset);

  const actual = await verifyCounts();
  console.log(`\n✓ loaded ${actual.nodeTotal} nodes and ${actual.relTotal} relationships in ${elapsed()}\n`);
  if (actual.nodeTotal !== expected.nodes) {
    console.warn(`⚠ expected ${expected.nodes} nodes; the database reports ${actual.nodeTotal}.`);
  }
}

main()
  .catch((error) => {
    const dbError = toDbError(error);
    console.error(`\n✗ ${dbError.kind}: ${dbError.message}`);
    if (dbError.detail) console.error(`  ${dbError.detail}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDriver();
  });
