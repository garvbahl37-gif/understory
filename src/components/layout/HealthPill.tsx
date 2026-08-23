"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  target?: string;
  server?: { agent?: string };
};

/**
 * A live connection indicator, in the corner of every page.
 *
 * It exists because "graceful behaviour when the database is unreachable" is a
 * requirement, and the honest way to meet it is to show the reader the state of
 * the connection at all times rather than only at the moment something breaks.
 */
export function HealthPill() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as Health;
        if (!cancelled) setHealth(data);
      } catch {
        if (!cancelled) setHealth({ status: "down" });
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const color =
    health?.status === "ok"
      ? "var(--sev-low)"
      : health?.status === "degraded"
        ? "var(--sev-medium)"
        : health === null
          ? "var(--lichen-dim)"
          : "var(--sev-critical)";

  const label =
    checking && !health
      ? "checking"
      : health?.status === "ok"
        ? "connected"
        : health?.status === "degraded"
          ? "degraded"
          : "unreachable";

  return (
    <Link
      href="/health"
      className="block rounded border border-rule bg-[var(--peat-raised)] px-3 py-2.5 transition-colors hover:border-rule-strong"
    >
      <span className="flex items-center gap-2">
        <span
          className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${health?.status === "ok" ? "" : "breathe"}`}
          style={{ background: color }}
        />
        <span className="u-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color }}>
          {label}
        </span>
      </span>
      <span className="u-mono mt-1.5 block text-[10px] leading-tight text-lichen-dim">
        CognoDB
        {health?.latencyMs !== undefined ? ` · ${health.latencyMs}ms` : ""}
      </span>
    </Link>
  );
}
