import neo4j, { type Driver, type QueryResult, type Session } from "neo4j-driver";

import { describeTarget, readDbConfig } from "./config";
import { DbError, toDbError } from "./errors";

/**
 * One driver per Node.js process.
 *
 * A Neo4j/Bolt `Driver` owns a TCP connection pool and is designed to be
 * long-lived. On a serverless platform the module scope is reused across warm
 * invocations, so we stash the instance on `globalThis` to survive both hot
 * module replacement in dev and isolate reuse in production.
 */
const GLOBAL_KEY = Symbol.for("understory.cognodb.driver");

type DriverSlot = { driver: Driver | null };

const slot: DriverSlot = ((globalThis as unknown as Record<symbol, DriverSlot>)[GLOBAL_KEY] ??= {
  driver: null,
});

export function getDriver(): Driver {
  if (slot.driver) return slot.driver;

  const result = readDbConfig();
  if (!result.ok) {
    throw new DbError({
      kind: "not_configured",
      message: "The graph database is not configured.",
      detail: `Missing or invalid environment variables: ${result.missing.join(", ")}`,
      retryable: false,
    });
  }

  const { uri, user, password, maxPoolSize } = result.config;

  // Note: encryption/trust are carried by the URI scheme (bolt+s://). Passing
  // an explicit `encrypted` option alongside a +s scheme is a driver error.
  slot.driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: maxPoolSize,
    connectionAcquisitionTimeout: 10_000,
    connectionTimeout: 10_000,
    // Serverless pools can hold sockets a proxy has already dropped; ping any
    // connection idle for longer than this before handing it out.
    connectionLivenessCheckTimeout: 30_000,
    maxTransactionRetryTime: 8_000,
    userAgent: "understory/1.0 (+https://github.com/garvbahl37-gif/understory)",
    logging: {
      level: process.env.COGNODB_DEBUG === "1" ? "debug" : "warn",
      logger: (level, message) => console.log(`[neo4j:${level}] ${message}`),
    },
  });

  return slot.driver;
}

export async function closeDriver(): Promise<void> {
  if (!slot.driver) return;
  const driver = slot.driver;
  slot.driver = null;
  await driver.close();
}

export type HealthReport = {
  status: "ok" | "degraded" | "down";
  target: string;
  database: string;
  latencyMs?: number;
  server?: { address?: string; agent?: string; protocolVersion?: string };
  error?: ReturnType<DbError["toJSON"]>;
};

/** Round-trips a trivial query so the health check proves the whole path works. */
export async function checkHealth(): Promise<HealthReport> {
  const config = readDbConfig();
  if (!config.ok) {
    return {
      status: "down",
      target: "not-configured",
      database: "-",
      error: {
        kind: "not_configured",
        message: "The graph database is not configured.",
        detail: `Missing or invalid environment variables: ${config.missing.join(", ")}`,
        retryable: false,
      },
    };
  }

  const target = describeTarget(config.config.uri);
  const started = Date.now();

  try {
    const driver = getDriver();
    const info = await driver.getServerInfo({ database: config.config.database });
    return {
      status: "ok",
      target,
      database: config.config.database,
      latencyMs: Date.now() - started,
      server: {
        address: info.address,
        agent: info.agent,
        protocolVersion: info.protocolVersion === undefined ? undefined : String(info.protocolVersion),
      },
    };
  } catch (error) {
    const dbError = toDbError(error);
    return {
      status: dbError.kind === "timeout" ? "degraded" : "down",
      target,
      database: config.config.database,
      latencyMs: Date.now() - started,
      error: dbError.toJSON(),
    };
  }
}

type ReadOptions = {
  /** Overrides the per-query timeout from configuration. */
  timeoutMs?: number;
  /** Surfaces in CognoDB's query log — invaluable when debugging a slow page. */
  label?: string;
};

/**
 * Runs a read-only, parameterised Cypher statement.
 *
 * This is the *only* place in the application that touches a Bolt session, so
 * timeouts, retries, access mode and error normalisation are guaranteed to be
 * applied uniformly. Callers never build Cypher by concatenation — the
 * statement is a constant and every value arrives through `params`.
 */
export async function readQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {},
  options: ReadOptions = {},
): Promise<T[]> {
  const config = readDbConfig();
  if (!config.ok) {
    throw new DbError({
      kind: "not_configured",
      message: "The graph database is not configured.",
      detail: `Missing or invalid environment variables: ${config.missing.join(", ")}`,
      retryable: false,
    });
  }

  const driver = getDriver();
  let session: Session | null = null;

  try {
    session = driver.session({
      database: config.config.database,
      defaultAccessMode: neo4j.session.READ,
    });

    const result: QueryResult = await session.executeRead((tx) => tx.run(cypher, params), {
      timeout: options.timeoutMs ?? config.config.queryTimeoutMs,
      metadata: { app: "understory", query: options.label ?? "anonymous" },
    });

    return result.records.map((record) => record.toObject() as T);
  } catch (error) {
    throw toDbError(error);
  } finally {
    await session?.close().catch(() => undefined);
  }
}

/** Write path — used exclusively by the seed script, never by the web app. */
export async function writeQuery(
  cypher: string,
  params: Record<string, unknown> = {},
  options: ReadOptions = {},
): Promise<QueryResult> {
  const config = readDbConfig();
  if (!config.ok) {
    throw new DbError({
      kind: "not_configured",
      message: "The graph database is not configured.",
      detail: `Missing or invalid environment variables: ${config.missing.join(", ")}`,
      retryable: false,
    });
  }

  const driver = getDriver();
  const session = driver.session({
    database: config.config.database,
    defaultAccessMode: neo4j.session.WRITE,
  });

  try {
    return await session.executeWrite((tx) => tx.run(cypher, params), {
      timeout: options.timeoutMs ?? 120_000,
      metadata: { app: "understory-seed", query: options.label ?? "seed" },
    });
  } catch (error) {
    throw toDbError(error);
  } finally {
    await session.close().catch(() => undefined);
  }
}
