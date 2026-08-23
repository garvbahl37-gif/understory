/**
 * Runs every statement in the query catalogue against the live database.
 *
 *   npm run verify
 *
 * This is the closest thing to a test suite that a query layer can have: it
 * proves each statement parses, that the parameters the app sends satisfy each
 * schema, and that the traversals actually return something. It also prints
 * timings, which is how the traversal depths in the catalogue were tuned for a
 * 0.5 vCPU instance.
 */
import { loadEnv } from "@/lib/load-env";

loadEnv();

import { closeDriver, readQuery } from "@/lib/db/driver";
import { describeTarget, readDbConfig, resetDbConfigCache } from "@/lib/db/config";
import { toDbError } from "@/lib/db/errors";
import { QUERY_LIST } from "@/lib/queries/catalog";
import { runQuery } from "@/lib/queries/run";

type Result = {
  id: string;
  status: "pass" | "empty" | "fail";
  rows: number;
  ms: number;
  detail?: string;
};

/**
 * The catalogue's examples name real-looking entities, but maintainer handles
 * and some keys are generated. Resolve live ones so the run exercises real data
 * rather than failing on a stale identifier.
 */
async function resolveLiveParams() {
  const [advisory] = await readQuery<{ id: string }>(
    "MATCH (a:Advisory)-[:AFFECTS]->(:Version) RETURN a.id AS id ORDER BY a.cvss DESC LIMIT 1",
  );
  const [pkg] = await readQuery<{ key: string }>(
    "MATCH (s:Service)-[:USES]->(:Version)<-[:HAS_VERSION]-(p:Package) RETURN p.key AS key ORDER BY p.weeklyDownloads DESC LIMIT 1",
  );
  const [service] = await readQuery<{ slug: string }>(
    "MATCH (s:Service) RETURN s.slug AS slug ORDER BY s.slug LIMIT 1",
  );
  const [maintainer] = await readQuery<{ handle: string }>(
    "MATCH (m:Maintainer)-[:MAINTAINS]->(:Package) RETURN m.handle AS handle ORDER BY m.publicPackages DESC LIMIT 1",
  );
  const [affected] = await readQuery<{ id: string; key: string }>(
    "MATCH (a:Advisory)-[:AFFECTS]->(v:Version) RETURN a.id AS id, v.key AS key ORDER BY a.cvss DESC LIMIT 1",
  );

  return {
    advisoryId: advisory?.id,
    packageKey: pkg?.key,
    slug: service?.slug,
    handle: maintainer?.handle,
    upgrade: affected ? { advisoryId: affected.id, versionKey: affected.key } : undefined,
  };
}

async function main() {
  resetDbConfigCache();
  const config = readDbConfig();
  if (!config.ok) {
    console.error(`\n✗ ${config.message}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nUnderstory — query verification against ${describeTarget(config.config.uri)}\n`);

  const live = await resolveLiveParams();
  const results: Result[] = [];

  for (const definition of QUERY_LIST) {
    const params: Record<string, unknown> = { ...(definition.example as Record<string, unknown>) };
    if ("advisoryId" in params && live.advisoryId) params.advisoryId = live.advisoryId;
    if ("packageKey" in params && live.packageKey) params.packageKey = live.packageKey;
    if ("slug" in params && live.slug) params.slug = live.slug;
    if ("handle" in params && live.handle) params.handle = live.handle;
    if (definition.id === "advisory.upgradePath" && live.upgrade) {
      params.advisoryId = live.upgrade.advisoryId;
      params.versionKey = live.upgrade.versionKey;
    }

    const started = Date.now();
    try {
      const rows = await runQuery(definition, params, { timeoutMs: 30_000 });
      const ms = Date.now() - started;
      results.push({ id: definition.id, status: rows.length > 0 ? "pass" : "empty", rows: rows.length, ms });
    } catch (error) {
      const dbError = toDbError(error);
      results.push({
        id: definition.id,
        status: "fail",
        rows: 0,
        ms: Date.now() - started,
        detail: `${dbError.kind}: ${dbError.detail ?? dbError.message}`,
      });
    }
  }

  const icon = { pass: "✓", empty: "○", fail: "✗" } as const;
  const slowest = [...results]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 3)
    .map((r) => r.id);

  for (const result of results) {
    const flag = slowest.includes(result.id) && result.ms > 400 ? "  ← slowest" : "";
    console.log(
      `  ${icon[result.status]} ${result.id.padEnd(34)} ${String(result.rows).padStart(5)} rows  ${String(result.ms).padStart(6)}ms${flag}`,
    );
    if (result.detail) console.log(`      ${result.detail}`);
  }

  const failed = results.filter((r) => r.status === "fail");
  const empty = results.filter((r) => r.status === "empty");
  console.log(
    `\n${results.length - failed.length}/${results.length} statements executed successfully` +
      (empty.length ? `; ${empty.length} returned no rows (○)` : "") +
      "\n",
  );

  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    const dbError = toDbError(error);
    console.error(`\n✗ ${dbError.kind}: ${dbError.message}`);
    if (dbError.detail) console.error(`  ${dbError.detail}\n`);
    process.exitCode = 1;
  })
  .finally(closeDriver);
