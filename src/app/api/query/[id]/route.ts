import { NextResponse } from "next/server";

import { toDbError } from "@/lib/db/errors";
import { getQuery } from "@/lib/queries/catalog";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The query console's backend.
 *
 * It cannot run arbitrary Cypher. The `id` selects a statement from the frozen
 * catalogue, and the body is validated against that statement's own parameter
 * schema before anything reaches the driver. The result is a console that is
 * genuinely useful for exploring the data and structurally incapable of being
 * used to write to the database or to read outside the modelled surface.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const definition = getQuery(id);

  if (!definition) {
    return NextResponse.json(
      { error: { kind: "query", message: `There is no query called “${id}”.`, retryable: false } },
      { status: 404 },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json(
      { error: { kind: "query", message: "The request body was not valid JSON.", retryable: false } },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const rows = await runQuery(definition, body as never, { timeoutMs: 25_000 });
    return NextResponse.json(
      { id: definition.id, rows, rowCount: rows.length, ms: Date.now() - started },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const dbError = toDbError(error);
    return NextResponse.json(
      { error: dbError.toJSON(), ms: Date.now() - started },
      { status: dbError.kind === "query" ? 400 : 503 },
    );
  }
}
