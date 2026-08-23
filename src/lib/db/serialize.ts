import neo4j, { type Node as Neo4jNode, type Relationship, type Path } from "neo4j-driver";

/**
 * Bolt returns richer types than JSON can carry: 64-bit `Integer`s, temporal
 * values, spatial points, and graph entities. Rather than sprinkling
 * conversions through the query layer, everything crossing the wire to the
 * browser passes through here exactly once.
 */

export type PlainNode = {
  elementId: string;
  labels: string[];
  properties: Record<string, unknown>;
};

export type PlainRelationship = {
  elementId: string;
  type: string;
  start: string;
  end: string;
  properties: Record<string, unknown>;
};

export function isNeo4jNode(value: unknown): value is Neo4jNode {
  return value instanceof neo4j.types.Node;
}

export function isNeo4jRelationship(value: unknown): value is Relationship {
  return value instanceof neo4j.types.Relationship;
}

export function isNeo4jPath(value: unknown): value is Path {
  return value instanceof neo4j.types.Path;
}

/**
 * Recursively converts a driver value into something `JSON.stringify` can
 * handle without losing meaning.
 *
 * 64-bit integers become plain numbers when they fit in a JS safe integer and
 * strings when they do not, so a large count never silently rounds.
 */
export function toPlain(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  if (neo4j.isInt(value)) {
    return value.inSafeRange() ? value.toNumber() : value.toString();
  }

  if (
    neo4j.isDate(value) ||
    neo4j.isDateTime(value) ||
    neo4j.isLocalDateTime(value) ||
    neo4j.isLocalTime(value) ||
    neo4j.isTime(value) ||
    neo4j.isDuration(value) ||
    neo4j.isPoint(value)
  ) {
    return value.toString();
  }

  if (isNeo4jNode(value)) {
    return {
      elementId: value.elementId,
      labels: [...value.labels],
      properties: toPlain(value.properties) as Record<string, unknown>,
    } satisfies PlainNode;
  }

  if (isNeo4jRelationship(value)) {
    return {
      elementId: value.elementId,
      type: value.type,
      start: value.startNodeElementId,
      end: value.endNodeElementId,
      properties: toPlain(value.properties) as Record<string, unknown>,
    } satisfies PlainRelationship;
  }

  if (isNeo4jPath(value)) {
    return {
      length: value.length,
      start: toPlain(value.start),
      end: toPlain(value.end),
      segments: value.segments.map((segment) => ({
        start: toPlain(segment.start),
        relationship: toPlain(segment.relationship),
        end: toPlain(segment.end),
      })),
    };
  }

  if (Array.isArray(value)) return value.map(toPlain);

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "bigint") {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toPlain(inner);
    }
    return out;
  }

  return value;
}

/** Convenience wrapper for a full result set. */
export function toPlainRows<T = Record<string, unknown>>(rows: Record<string, unknown>[]): T[] {
  return rows.map((row) => toPlain(row) as T);
}

/** Narrow an unknown-but-expected-numeric driver value. */
export function asNumber(value: unknown, fallback = 0): number {
  const plain = toPlain(value);
  if (typeof plain === "number") return plain;
  if (typeof plain === "string") {
    const parsed = Number(plain);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
