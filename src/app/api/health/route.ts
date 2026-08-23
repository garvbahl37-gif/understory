import { NextResponse } from "next/server";

import { checkHealth } from "@/lib/db/driver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Round-trips a real request to CognoDB. Returns 200 when healthy and 503 when
 * not, so an uptime check can use it directly, while the body carries enough
 * detail for the in-app status page.
 */
export async function GET() {
  const report = await checkHealth();
  return NextResponse.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
