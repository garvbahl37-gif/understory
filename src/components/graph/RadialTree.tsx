"use client";

import { hierarchy, tree, type HierarchyPointNode } from "d3-hierarchy";
import { linkRadial } from "d3-shape";
import { useMemo, useRef, useState } from "react";

import type { GraphNode, GraphPayload, NodeLabel, Severity } from "@/lib/domain/types";

/**
 * The same subgraph as the force layout, projected as a radial tree.
 *
 * A force layout answers "what is tangled up with what". It is bad at the
 * question this product actually asks, which is "how far down is this?" — the
 * physics puts a node wherever the springs settle, so distance on screen means
 * nothing.
 *
 * Here radius *is* hop distance. The thing you asked about sits at the centre,
 * every ring outward is one more dependency hop, and the eye reads depth before
 * it reads a single label. The tree is the breadth-first spanning tree of the
 * subgraph — one canonical route to each node, which is exactly the route the
 * blast-radius query would report.
 *
 * SVG rather than canvas: a few hundred nodes is well within budget, and it
 * buys crisp rotated text, real hover targets and no devicePixelRatio maths.
 */

const DEPTH_FILL = ["#e6ecff", "#c3d0f7", "#a2b4ee", "#8298df", "#647cc4", "#4c619f", "#3a4b78"];
const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: "#e25a5a",
  HIGH: "#e59318",
  MEDIUM: "#ecd76d",
  LOW: "#75b478",
};
const KIND_RADIUS: Record<NodeLabel, number> = {
  Service: 6,
  Team: 5,
  Package: 4.5,
  Version: 3.2,
  Advisory: 5,
  Maintainer: 4.5,
  License: 4,
};

type TreeDatum = { node: GraphNode; hop: number; children: TreeDatum[] };

const clampHop = (hop: number) => Math.max(0, Math.min(6, hop));

export function RadialTree({
  payload,
  onSelect,
  selectedId,
}: {
  payload: GraphPayload;
  onSelect?: (node: GraphNode | null) => void;
  selectedId?: string | null;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const size = 620;
  const radius = size / 2 - 96;

  /**
   * Breadth-first spanning tree. Nodes the BFS never reaches — the subgraph can
   * contain fragments the seed cannot walk to — are hung off the root at the
   * outermost ring rather than dropped, so the count on screen always matches
   * the count in the toolbar.
   */
  const { root, orphanCount } = useMemo(() => {
    const byId = new Map(payload.nodes.map((n) => [n.id, n]));
    const neighbours = new Map<string, string[]>();
    const push = (a: string, b: string) => {
      const list = neighbours.get(a);
      if (list) list.push(b);
      else neighbours.set(a, [b]);
    };
    for (const edge of payload.edges) {
      push(edge.source, edge.target);
      push(edge.target, edge.source);
    }

    const seed = byId.get(payload.seed.id) ?? payload.nodes[0];
    if (!seed) return { root: null, orphanCount: 0 };

    const nodes = new Map<string, TreeDatum>();
    const rootDatum: TreeDatum = { node: seed, hop: 0, children: [] };
    nodes.set(seed.id, rootDatum);

    const queue = [seed.id];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = nodes.get(currentId)!;
      for (const nextId of neighbours.get(currentId) ?? []) {
        if (nodes.has(nextId)) continue;
        const next = byId.get(nextId);
        if (!next) continue;
        const datum: TreeDatum = { node: next, hop: current.hop + 1, children: [] };
        nodes.set(nextId, datum);
        current.children.push(datum);
        queue.push(nextId);
      }
    }

    const unreached = payload.nodes.filter((n) => !nodes.has(n.id));
    for (const node of unreached) {
      rootDatum.children.push({ node, hop: 7, children: [] });
    }

    return { root: rootDatum, orphanCount: unreached.length };
  }, [payload]);

  const laid = useMemo(() => {
    if (!root) return null;
    const h = hierarchy<TreeDatum>(root, (d) => d.children);
    // Separation widens for nodes under different parents so sibling clusters
    // stay visually grouped rather than smearing into one another.
    const layout = tree<TreeDatum>()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2.2) / Math.max(1, a.depth));
    return layout(h);
  }, [root, radius]);

  const linkPath = useMemo(
    () =>
      linkRadial<unknown, HierarchyPointNode<TreeDatum>>()
        .angle((d) => d.x)
        .radius((d) => d.y),
    [],
  );

  if (!laid) {
    return (
      <div className="flex h-[620px] items-center justify-center rounded-[10px] border border-rule bg-well">
        <span className="u-mono text-[11px] uppercase tracking-[0.13em] text-fg-subtle">nothing to draw</span>
      </div>
    );
  }

  const all = laid.descendants();
  const links = laid.links();
  const maxDepth = Math.max(...all.map((d) => d.depth));

  // Ancestors of the focused node, so hover can light the route to the centre.
  const focusId = hovered ?? selectedId ?? null;
  const lit = new Set<string>();
  if (focusId) {
    const target = all.find((d) => d.data.node.id === focusId);
    for (const a of target?.ancestors() ?? []) lit.add(a.data.node.id);
  }

  const fillOf = (d: HierarchyPointNode<TreeDatum>) =>
    d.data.node.label === "Advisory" && d.data.node.severity
      ? (SEVERITY_FILL[d.data.node.severity as Severity] ?? "#e25a5a")
      : DEPTH_FILL[clampHop(d.depth)];

  /**
   * Label culling by arc length.
   *
   * Sorted by angle, a label is kept only if it clears the last kept one by
   * enough arc distance at its own radius. Nodes on the focused route always
   * win — the whole point of hovering is to read the chain. Everything else is
   * dropped rather than allowed to overlap, because an unreadable pile of text
   * is worse than fewer labels.
   */
  const labelled = new Set<string>();
  {
    const MIN_ARC = 24;
    const candidates = all.filter((d) => d.depth > 0).sort((a, b) => a.x - b.x);
    let lastAngle = -Infinity;
    let lastRadius = 0;
    for (const d of candidates) {
      if (lit.has(d.data.node.id)) {
        labelled.add(d.data.node.id);
        continue;
      }
      if (focusId) continue; // while tracing a route, show only that route
      const arc = (d.x - lastAngle) * Math.max(d.y, lastRadius, 1);
      if (arc < MIN_ARC) continue;
      labelled.add(d.data.node.id);
      lastAngle = d.x;
      lastRadius = d.y;
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative h-[620px] w-full overflow-hidden rounded-[10px] border border-rule bg-well"
    >
      <svg
        viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
        className="h-full w-full"
        role="img"
        aria-label={`Radial dependency tree of ${payload.nodes.length} nodes around ${payload.seed.id}. Radius is hop distance. The same data is available as tables on the detail pages.`}
      >
        <defs>
          <radialGradient id="rt-centre">
            <stop offset="0%" stopColor="#8aa4ff" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#8aa4ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* depth rings — the scale the whole drawing is read against */}
        {Array.from({ length: maxDepth }, (_, i) => i + 1).map((depth) => (
          <g key={depth}>
            <circle
              r={(radius * depth) / maxDepth}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={0.7}
              strokeDasharray="2 5"
            />
            <text
              x={4}
              y={-(radius * depth) / maxDepth - 4}
              className="u-mono"
              fontSize={8.5}
              fill="var(--fg-ghost)"
              letterSpacing="0.1em"
            >
              {depth}
            </text>
          </g>
        ))}

        <circle r={radius * 0.42} fill="url(#rt-centre)" />

        {/* links */}
        <g fill="none">
          {links.map((link) => {
            const on = lit.has(link.source.data.node.id) && lit.has(link.target.data.node.id);
            return (
              <path
                key={`${link.source.data.node.id}->${link.target.data.node.id}`}
                d={linkPath(link) ?? undefined}
                stroke={on ? "#aec0ff" : DEPTH_FILL[clampHop(link.target.depth)]}
                strokeOpacity={focusId ? (on ? 0.95 : 0.08) : 0.3}
                strokeWidth={on ? 1.8 : 0.9}
                strokeLinecap="round"
              />
            );
          })}
        </g>

        {/* nodes */}
        <g>
          {all.map((d) => {
            const node = d.data.node;
            const on = focusId ? lit.has(node.id) : true;
            const isSeed = d.depth === 0;
            const r = (KIND_RADIUS[node.label] ?? 4) + (isSeed ? 3 : 0);
            const x = Math.cos(d.x - Math.PI / 2) * d.y;
            const y = Math.sin(d.x - Math.PI / 2) * d.y;

            return (
              <g
                key={node.id}
                transform={`translate(${x},${y})`}
                opacity={on ? 1 : 0.18}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onSelect?.(node)}
                style={{ cursor: "pointer" }}
              >
                {isSeed || node.id === focusId ? (
                  <circle r={r + 6} fill={isSeed ? "#e9edf5" : "#aec0ff"} opacity={0.16} />
                ) : null}
                <circle
                  r={r}
                  fill={fillOf(d)}
                  stroke={isSeed ? "#e9edf5" : "#0b0e14"}
                  strokeWidth={isSeed ? 2 : 1.2}
                />
                {/* invisible, generous hit target */}
                <circle r={Math.max(9, r + 5)} fill="transparent" />
              </g>
            );
          })}
        </g>

        {/* labels, rotated to follow the ring */}
        <g>
          {all
            .filter((d) => labelled.has(d.data.node.id))
            .map((d) => {
              const on = focusId ? lit.has(d.data.node.id) : true;
              const angle = (d.x * 180) / Math.PI - 90;
              const flip = d.x >= Math.PI;
              // Keep the semver. Two releases of the same package are two real
              // nodes, and stripping the version makes that look like a bug.
              const raw = d.data.node.caption;
              const caption = raw.length > 24 ? `${raw.slice(0, 23)}…` : raw;
              return (
                <g
                  key={`l-${d.data.node.id}`}
                  transform={`rotate(${angle}) translate(${d.y + 10},0)${flip ? " rotate(180)" : ""}`}
                  opacity={on ? 1 : 0.12}
                >
                  <text
                    className="u-mono"
                    fontSize={9.5}
                    fill={lit.has(d.data.node.id) ? "#e9edf5" : "var(--fg-subtle)"}
                    textAnchor={flip ? "end" : "start"}
                    dominantBaseline="middle"
                    style={{ pointerEvents: "none" }}
                  >
                    {caption}
                  </text>
                </g>
              );
            })}
        </g>

        {/* the seed, named at the centre */}
        <g style={{ pointerEvents: "none" }}>
          <text
            y={-16}
            textAnchor="middle"
            className="u-mono"
            fontSize={9}
            fill="var(--fg-faint)"
            letterSpacing="0.14em"
          >
            {payload.seed.label.toUpperCase()}
          </text>
          <text y={22} textAnchor="middle" className="u-mono" fontSize={11.5} fill="#e9edf5">
            {laid.data.node.caption.length > 26
              ? `${laid.data.node.caption.slice(0, 25)}…`
              : laid.data.node.caption}
          </text>
        </g>
      </svg>

      {/* legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-rule bg-[color-mix(in_srgb,var(--ink)_82%,transparent)] px-3 py-2.5 backdrop-blur-sm">
        <p className="u-mono mb-1.5 text-[9px] uppercase tracking-[0.13em] text-fg-faint">
          radius = hops from {payload.seed.label.toLowerCase()}
        </p>
        <div className="flex items-center gap-1">
          {Array.from({ length: Math.min(6, maxDepth) + 1 }, (_, hop) => (
            <span key={hop} className="flex flex-col items-center gap-1">
              <span
                className="block h-[9px] w-[22px] rounded-sm"
                style={{ background: DEPTH_FILL[clampHop(hop)] }}
              />
              <span className="u-mono text-[8.5px] text-fg-faint">{hop}</span>
            </span>
          ))}
        </div>
      </div>

      {orphanCount > 0 ? (
        <p className="u-mono pointer-events-none absolute bottom-3 right-3 text-[9.5px] text-fg-faint">
          {orphanCount} node{orphanCount === 1 ? "" : "s"} not reachable from the centre
        </p>
      ) : null}

      {/* hover card */}
      {hovered
        ? (() => {
            const d = all.find((x) => x.data.node.id === hovered);
            if (!d) return null;
            return (
              <div className="pointer-events-none absolute right-3 top-3 max-w-[260px] rounded-lg border border-rule bg-surface-2 px-3 py-2 shadow-2xl">
                <p className="u-mono text-[9px] uppercase tracking-[0.12em]" style={{ color: fillOf(d) }}>
                  {d.data.node.label}
                  {d.depth > 0 ? ` · ${d.depth} hop${d.depth === 1 ? "" : "s"} out` : " · start"}
                </p>
                <p className="u-mono mt-1 break-all text-[11.5px] text-fg">{d.data.node.caption}</p>
                {d.data.node.sub ? (
                  <p className="mt-0.5 text-[10.5px] text-fg-subtle">{d.data.node.sub}</p>
                ) : null}
                <p className="u-mono mt-1.5 text-[9px] text-fg-faint">
                  {d.ancestors().length - 1} step route · click to inspect
                </p>
              </div>
            );
          })()
        : null}
    </div>
  );
}
