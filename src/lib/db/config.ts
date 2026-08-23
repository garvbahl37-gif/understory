import { z } from "zod";

/**
 * Connection configuration for the CognoDB (Bolt / openCypher) instance.
 *
 * Nothing here is ever hard-coded: every value comes from the environment.
 * `.env.example` documents the contract; `.env.local` (git-ignored) supplies it
 * locally and the hosting provider's env store supplies it in production.
 */
const schema = z.object({
  /** e.g. bolt+s://<instance-id>.databases.cognodb.cloud */
  COGNODB_URI: z
    .string()
    .min(1, "COGNODB_URI is required")
    .refine(
      (v) => /^(bolt|bolt\+s|bolt\+ssc|neo4j|neo4j\+s|neo4j\+ssc):\/\//.test(v),
      "COGNODB_URI must start with bolt://, bolt+s://, neo4j:// or neo4j+s://",
    ),
  COGNODB_USER: z.string().min(1).default("cognodb"),
  COGNODB_PASSWORD: z.string().min(1, "COGNODB_PASSWORD is required"),
  /** CognoDB exposes a single database; kept configurable for local Neo4j parity. */
  COGNODB_DATABASE: z.string().min(1).default("neo4j"),
  /** Hard ceiling on any single query, in milliseconds. */
  COGNODB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  /**
   * The free (c0) tier allows up to 200 connections. Serverless platforms spin
   * up many isolates, so we keep each instance's pool deliberately small.
   */
  COGNODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(12),
});

export type DbConfig = {
  uri: string;
  user: string;
  password: string;
  database: string;
  queryTimeoutMs: number;
  maxPoolSize: number;
};

export type ConfigResult = { ok: true; config: DbConfig } | { ok: false; missing: string[]; message: string };

let cached: ConfigResult | null = null;

/**
 * Parses and caches the database configuration.
 *
 * Returns a result object rather than throwing so that the UI can render a
 * precise "you haven't configured the database yet" state instead of a 500.
 */
export function readDbConfig(): ConfigResult {
  if (cached) return cached;

  const parsed = schema.safeParse({
    COGNODB_URI: process.env.COGNODB_URI,
    COGNODB_USER: process.env.COGNODB_USER,
    COGNODB_PASSWORD: process.env.COGNODB_PASSWORD,
    COGNODB_DATABASE: process.env.COGNODB_DATABASE,
    COGNODB_QUERY_TIMEOUT_MS: process.env.COGNODB_QUERY_TIMEOUT_MS,
    COGNODB_MAX_POOL_SIZE: process.env.COGNODB_MAX_POOL_SIZE,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => String(i.path[0] ?? "unknown"));
    cached = {
      ok: false,
      missing: [...new Set(missing)],
      message: parsed.error.issues.map((i) => `${String(i.path[0] ?? "config")}: ${i.message}`).join("; "),
    };
    return cached;
  }

  cached = {
    ok: true,
    config: {
      uri: parsed.data.COGNODB_URI,
      user: parsed.data.COGNODB_USER,
      password: parsed.data.COGNODB_PASSWORD,
      database: parsed.data.COGNODB_DATABASE,
      queryTimeoutMs: parsed.data.COGNODB_QUERY_TIMEOUT_MS,
      maxPoolSize: parsed.data.COGNODB_MAX_POOL_SIZE,
    },
  };
  return cached;
}

/** Test seam — lets the seed/verify scripts re-read env after dotenv loads. */
export function resetDbConfigCache() {
  cached = null;
}

/** Redacts credentials so a URI can safely appear in logs and the health page. */
export function describeTarget(uri: string): string {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return "unparseable-uri";
  }
}
