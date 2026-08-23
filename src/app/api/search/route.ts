import { NextResponse } from "next/server";

import { toDbError } from "@/lib/db/errors";
import { seedCandidates } from "@/lib/queries/catalog";
import { runQuery } from "@/lib/queries/run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Candidate = { label: string; id: string; caption: string; sub: string | null; weight: number };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  try {
    const rows = await runQuery<typeof seedCandidates.params, Candidate>(seedCandidates, {
      search: query.slice(0, 120),
      perLabel: 6,
    });
    // Services first, then packages, advisories, people — the order someone
    // scanning a result list actually wants.
    rows.sort((a, b) => b.weight - a.weight);
    return NextResponse.json({ results: rows }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const dbError = toDbError(error);
    return NextResponse.json({ results: [], error: dbError.toJSON() }, { status: 503 });
  }
}
