"use client";

import { useState } from "react";

import type { Severity } from "@/lib/domain/types";
import { SEVERITY_COLOR, plainNumber } from "@/lib/format";

/**
 * Two chart forms, both chosen for the job the data does rather than for
 * variety, and both built to the same rules: thin marks, a 2px surface gap
 * between fills, 4px rounded data-ends anchored to the baseline, recessive
 * axes, direct labels instead of a number on every mark, and identity never
 * carried by colour alone.
 */

// ── composition: what the advisory backlog is made of ───────────────────────

export function SeverityComposition({
  data,
  total,
}: {
  data: Array<{ severity: Severity; advisories: number }>;
  total: number;
}) {
  const [hover, setHover] = useState<Severity | null>(null);
  const ordered = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[])
    .map((severity) => ({ severity, advisories: data.find((d) => d.severity === severity)?.advisories ?? 0 }))
    .filter((d) => d.advisories > 0);

  if (total === 0) return null;

  return (
    <div>
      <div
        className="flex h-[10px] w-full gap-[2px] overflow-hidden"
        role="img"
        aria-label="Advisories by severity"
      >
        {ordered.map((slice, index) => (
          <div
            key={slice.severity}
            onMouseEnter={() => setHover(slice.severity)}
            onMouseLeave={() => setHover(null)}
            className="h-full transition-opacity duration-150"
            style={{
              width: `${(slice.advisories / total) * 100}%`,
              background: SEVERITY_COLOR[slice.severity],
              opacity: hover === null || hover === slice.severity ? 1 : 0.35,
              borderTopLeftRadius: index === 0 ? 4 : 0,
              borderBottomLeftRadius: index === 0 ? 4 : 0,
              borderTopRightRadius: index === ordered.length - 1 ? 4 : 0,
              borderBottomRightRadius: index === ordered.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {ordered.map((slice) => (
          <li
            key={slice.severity}
            className="flex items-center gap-2 transition-opacity duration-150"
            style={{ opacity: hover === null || hover === slice.severity ? 1 : 0.4 }}
            onMouseEnter={() => setHover(slice.severity)}
            onMouseLeave={() => setHover(null)}
          >
            <span
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-sm"
              style={{ background: SEVERITY_COLOR[slice.severity] }}
            />
            <span className="u-mono text-[10.5px] uppercase tracking-[0.1em] text-lichen">
              {slice.severity.toLowerCase()}
            </span>
            <span className="u-num text-[12px] text-bone">{slice.advisories}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── magnitude over an ordered bin: how deep the exposure sits ───────────────

export function DepthHistogram({
  bins,
  caption,
}: {
  bins: Array<{ depth: number; count: number }>;
  caption?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  if (bins.every((bin) => bin.count === 0)) return null;

  return (
    <figure className="m-0">
      <div className="flex items-end gap-1.5" style={{ height: 88 }}>
        {bins.map((bin) => {
          const height = bin.count === 0 ? 2 : Math.max(4, (bin.count / max) * 78);
          const active = hover === bin.depth;
          return (
            <div
              key={bin.depth}
              className="group relative flex flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHover(bin.depth)}
              onMouseLeave={() => setHover(null)}
            >
              {active && bin.count > 0 ? (
                <span className="u-mono absolute -top-1 z-10 whitespace-nowrap rounded border border-rule bg-[var(--peat-high)] px-1.5 py-0.5 text-[10px] text-bone shadow-lg">
                  {plainNumber(bin.count)} at {bin.depth} {bin.depth === 1 ? "hop" : "hops"}
                </span>
              ) : null}
              <span
                className="w-full transition-opacity duration-150"
                style={{
                  height,
                  background: `var(--strata-${Math.min(6, bin.depth)})`,
                  borderTopLeftRadius: 4,
                  borderTopRightRadius: 4,
                  opacity: hover === null || active ? 1 : 0.4,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1.5 border-t border-rule pt-1.5">
        {bins.map((bin) => (
          <span
            key={bin.depth}
            className="u-num flex-1 text-center text-[10px]"
            style={{ color: hover === bin.depth ? "var(--bone)" : "var(--lichen-faint)" }}
          >
            {bin.depth}
          </span>
        ))}
      </div>

      <figcaption className="mt-2 text-[11.5px] text-lichen">
        {caption ?? "Hops between a service's manifest and the vulnerable release."}
      </figcaption>
    </figure>
  );
}
