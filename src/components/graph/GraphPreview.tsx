"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { RadialTree } from "@/components/graph/RadialTree";
import { Skeleton } from "@/components/ui/primitives";
import type { DbErrorShape } from "@/lib/db/errors";
import type { GraphPayload } from "@/lib/domain/types";

/**
 * An embedded radial tree for the detail pages.
 *
 * Fetches the same `/api/graph` subgraph the explorer uses, so the picture on a
 * detail page and the picture in the explorer are the same query — one of them
 * is just pre-seeded. Failures degrade to a quiet line rather than an alarm:
 * the drawing is an aid, and the tables beside it already carry the answer.
 */
export function GraphPreview({
  seed,
  id,
  depth = 3,
  caption,
  exploreHref,
}: {
  seed: "service" | "package" | "advisory" | "maintainer";
  id: string;
  depth?: number;
  caption: string;
  exploreHref: string;
}) {
  const [payload, setPayload] = useState<GraphPayload | null>(null);
  const [error, setError] = useState<DbErrorShape | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/graph?seed=${seed}&id=${encodeURIComponent(id)}&maxDepth=${depth}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        if (data.error) setError(data.error as DbErrorShape);
        else setPayload(data as GraphPayload);
      })
      .catch(() => {
        if (!cancelled)
          setError({ kind: "unreachable", message: "Could not draw the subgraph.", retryable: true });
      })
      .finally(() => {
        if (!cancelled) setDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [seed, id, depth]);

  if (error) {
    return (
      <div className="panel px-5 py-4">
        <p className="text-[12.5px] text-fg-subtle">
          The diagram could not be drawn. Everything it would show is in the tables on this page.
        </p>
      </div>
    );
  }

  if (!done || !payload) {
    return (
      <div
        className="flex h-[620px] items-center justify-center rounded-[10px] border border-rule bg-well"
        role="status"
        aria-label="Drawing the subgraph"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-[160px] w-[160px]">
            {[0, 1, 2].map((ring) => (
              <span
                key={ring}
                className="breathe absolute rounded-full border border-rule"
                style={{
                  inset: `${ring * 26}px`,
                  animationDelay: `${ring * 260}ms`,
                }}
              />
            ))}
            <Skeleton className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full" />
          </div>
          <span className="u-mono text-[10px] uppercase tracking-[0.13em] text-fg-faint">
            walking the graph
          </span>
        </div>
      </div>
    );
  }

  if (payload.nodes.length <= 1) {
    return (
      <div className="panel px-5 py-6">
        <p className="text-[13px] text-fg-subtle">Nothing connects to this within {depth} hops.</p>
      </div>
    );
  }

  return (
    <div>
      <RadialTree payload={payload} />
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-3">
        <p className="max-w-[68ch] text-[12px] text-fg-subtle">{caption}</p>
        <Link href={exploreHref} className="link shrink-0 text-[12px]">
          Open in the explorer →
        </Link>
      </div>
    </div>
  );
}
