import { NextResponse } from "next/server";
import { z } from "zod";

import { toDbError } from "@/lib/db/errors";
import { buildNeighbourhood } from "@/lib/queries/graph";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  seed: z.enum(["service", "package", "advisory", "maintainer"]),
  id: z.string().min(1).max(220),
  maxDepth: z.coerce.number().int().min(1).max(5).default(3),
  edgeLimit: z.coerce.number().int().min(10).max(1200).default(500),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    seed: params.get("seed"),
    id: params.get("id"),
    maxDepth: params.get("maxDepth") ?? undefined,
    edgeLimit: params.get("edgeLimit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          kind: "query",
          message: "Those explorer parameters are not valid.",
          detail: parsed.error.issues.map((i) => i.message).join("; "),
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  try {
    const payload = await buildNeighbourhood(parsed.data.seed, parsed.data.id, {
      maxDepth: parsed.data.maxDepth,
      edgeLimit: parsed.data.edgeLimit,
    });
    return NextResponse.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: toDbError(error).toJSON() }, { status: 503 });
  }
}
