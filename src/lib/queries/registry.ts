import type { z } from "zod";

/**
 * The query catalogue.
 *
 * Every Cypher statement the application can execute is declared here as a
 * frozen constant paired with a Zod schema for its parameters. Nothing else in
 * the codebase writes Cypher.
 *
 * Two things fall out of that discipline:
 *
 *  1. **No string-concatenated Cypher, ever.** A statement is a literal; every
 *     value reaches the database through the driver's parameter channel, so
 *     injection is structurally impossible and CognoDB can reuse query plans.
 *  2. **The docs cannot drift.** The in-app query console and the README both
 *     render from this same registry, so what you read is what runs.
 */
export type QueryDefinition<P extends z.ZodTypeAny = z.ZodTypeAny> = {
  /** Stable identifier, also used as the Bolt transaction metadata label. */
  id: string;
  title: string;
  /** The plain-English question this answers, for non-technical readers. */
  question: string;
  /** Why this is a graph problem rather than a relational one. */
  why: string;
  cypher: string;
  params: P;
  /** Parameters used by the console's "run" button and by the smoke tests. */
  example: z.input<P>;
  tags: QueryTag[];
  /** Longest traversal this statement can perform, for the reader's benefit. */
  traversal?: string;
};

export const QUERY_TAGS = [
  "multi-hop",
  "shortest-path",
  "aggregation",
  "cross-domain",
  "lookup",
  "graph-shape",
] as const;
export type QueryTag = (typeof QUERY_TAGS)[number];

export function defineQuery<P extends z.ZodTypeAny>(def: QueryDefinition<P>): QueryDefinition<P> {
  return Object.freeze(def);
}
