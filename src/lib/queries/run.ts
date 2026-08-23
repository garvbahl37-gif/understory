import type { z } from "zod";

import { readQuery } from "@/lib/db/driver";
import { DbError } from "@/lib/db/errors";
import { toPlainRows } from "@/lib/db/serialize";

import type { QueryDefinition } from "./registry";

/**
 * The single place a catalogued query is executed.
 *
 * Parameters are validated against the query's own schema before they reach
 * the driver, and results are normalised out of Bolt's wire types on the way
 * back. Because both halves happen here, a page or API route never sees a raw
 * `Integer` and never passes an unvalidated value to the database.
 */
export async function runQuery<P extends z.ZodTypeAny, T = Record<string, unknown>>(
  definition: QueryDefinition<P>,
  params: z.input<P>,
  options: { timeoutMs?: number } = {},
): Promise<T[]> {
  const parsed = definition.params.safeParse(params);
  if (!parsed.success) {
    throw new DbError({
      kind: "query",
      message: "Those parameters are not valid for this query.",
      detail: parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; "),
      retryable: false,
    });
  }

  const rows = await readQuery<Record<string, unknown>>(
    definition.cypher,
    parsed.data as Record<string, unknown>,
    { label: definition.id, timeoutMs: options.timeoutMs },
  );

  return toPlainRows<T>(rows);
}

/** Convenience for queries that return exactly zero or one row. */
export async function runQuerySingle<P extends z.ZodTypeAny, T = Record<string, unknown>>(
  definition: QueryDefinition<P>,
  params: z.input<P>,
  options: { timeoutMs?: number } = {},
): Promise<T | null> {
  const rows = await runQuery<P, T>(definition, params, options);
  return rows[0] ?? null;
}
