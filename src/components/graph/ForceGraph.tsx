"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphEdge, GraphNode, GraphPayload, NodeLabel } from "@/lib/domain/types";

/**
 * A canvas force layout, hand-rolled on top of d3-force.
 *
 * Canvas rather than SVG because a few hundred nodes with per-frame repaints is
 * where SVG starts dropping frames, and because the drawing is decorative
 * enough that the accessible representation belongs elsewhere — the same
 * subgraph is available as a table on every detail page, which is what a
 * screen-reader user should be given instead of a canvas.
 */

type SimNode = GraphNode & SimulationNodeDatum & { degree: number };
type SimLink = SimulationLinkDatum<SimNode> & { type: string; id: string };

const NODE_STYLE: Record<NodeLabel, { fill: string; radius: number }> = {
  Service: { fill: "#86b0c0", radius: 8.5 },
  Team: { fill: "#918475", radius: 7 },
  Package: { fill: "#c09a63", radius: 6 },
  Version: { fill: "#855f36", radius: 4 },
  Advisory: { fill: "#e25a5a", radius: 7 },
  Maintainer: { fill: "#c9bcab", radius: 6 },
  License: { fill: "#ecd76d", radius: 5.5 },
};

const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: "#e25a5a",
  HIGH: "#e59318",
  MEDIUM: "#ecd76d",
  LOW: "#75b478",
};

const EDGE_STYLE: Record<string, { stroke: string; width: number; dashed?: boolean }> = {
  OWNS: { stroke: "#918475", width: 1 },
  CALLS: { stroke: "#86b0c0", width: 1.2, dashed: true },
  USES: { stroke: "#86b0c0", width: 1.4 },
  HAS_VERSION: { stroke: "#5b4a3a", width: 0.8 },
  DEPENDS_ON: { stroke: "#7a5f43", width: 1 },
  AFFECTS: { stroke: "#e25a5a", width: 1.3, dashed: true },
  MAINTAINS: { stroke: "#918475", width: 1 },
  LICENSED_UNDER: { stroke: "#8a7a4a", width: 0.8 },
  SUPERSEDES: { stroke: "#4a3d31", width: 0.8 },
  SIMILAR_TO: { stroke: "#e59318", width: 1.2, dashed: true },
  PUBLISHED: { stroke: "#5b4a3a", width: 0.8 },
};

const nodeFill = (node: GraphNode) =>
  node.label === "Advisory" && node.severity
    ? (SEVERITY_FILL[node.severity] ?? NODE_STYLE.Advisory.fill)
    : (NODE_STYLE[node.label]?.fill ?? "#918475");

export function ForceGraph({
  payload,
  onSelect,
  selectedId,
}: {
  payload: GraphPayload;
  onSelect?: (node: GraphNode | null) => void;
  selectedId?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ node: SimNode | null; pointer: { x: number; y: number } | null }>({
    node: null,
    pointer: null,
  });
  // The tooltip stores its own clamped position, so nothing reads a ref during
  // render, and "settled" is keyed to the payload so a new subgraph is
  // automatically un-settled without a synchronous setState in the effect.
  const [hovered, setHovered] = useState<{ node: SimNode; left: number; top: number } | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const payloadKey = `${payload.seed.id}|${payload.nodes.length}|${payload.edges.length}`;
  const ready = settledKey === payloadKey;

  const { nodes, links } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of payload.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
    const simNodes: SimNode[] = payload.nodes.map((node) => ({ ...node, degree: degree.get(node.id) ?? 0 }));
    const byId = new Map(simNodes.map((node) => [node.id, node]));
    const simLinks: SimLink[] = payload.edges
      .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
      .map((edge: GraphEdge) => ({
        id: edge.id,
        type: edge.type,
        source: byId.get(edge.source)!,
        target: byId.get(edge.target)!,
      }));
    return { nodes: simNodes, links: simLinks };
  }, [payload]);

  const radiusOf = useCallback(
    (node: SimNode) => (NODE_STYLE[node.label]?.radius ?? 5) + Math.min(5, Math.sqrt(node.degree) * 1.1),
    [],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const view = viewRef.current;

    context.save();
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.translate(view.x, view.y);
    context.scale(view.k, view.k);

    const selected = selectedId ?? null;
    const neighbours = new Set<string>();
    if (selected) {
      for (const link of linksRef.current) {
        const s = link.source as SimNode;
        const t = link.target as SimNode;
        if (s.id === selected) neighbours.add(t.id);
        if (t.id === selected) neighbours.add(s.id);
      }
    }

    for (const link of linksRef.current) {
      const s = link.source as SimNode;
      const t = link.target as SimNode;
      if (s.x == null || t.x == null) continue;
      const style = EDGE_STYLE[link.type] ?? { stroke: "#4a3d31", width: 0.8 };
      const touchesSelection = selected ? s.id === selected || t.id === selected : true;

      context.beginPath();
      context.moveTo(s.x, s.y ?? 0);
      context.lineTo(t.x, t.y ?? 0);
      context.strokeStyle = style.stroke;
      context.globalAlpha = touchesSelection ? 0.62 : 0.14;
      context.lineWidth = style.width / Math.max(0.7, view.k * 0.85);
      context.setLineDash(style.dashed ? [3 / view.k, 3 / view.k] : []);
      context.stroke();
    }
    context.setLineDash([]);
    context.globalAlpha = 1;

    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const radius = radiusOf(node);
      const dimmed = selected ? node.id !== selected && !neighbours.has(node.id) : false;

      context.globalAlpha = dimmed ? 0.22 : 1;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = nodeFill(node);
      context.fill();

      // A ring in the ground colour keeps overlapping marks readable.
      context.lineWidth = 1.6 / view.k;
      context.strokeStyle = node.id === payload.seed.id ? "#efe7dc" : "#14100d";
      context.stroke();

      const showLabel =
        view.k > 0.75 && (radius > 6.5 || node.id === selected || node.id === payload.seed.id);
      if (showLabel && !dimmed) {
        context.globalAlpha = 1;
        context.font = `${11 / view.k}px "IBM Plex Mono", ui-monospace, monospace`;
        context.fillStyle = "#c9bcab";
        context.textAlign = "center";
        context.textBaseline = "top";
        const caption = node.caption.length > 26 ? `${node.caption.slice(0, 25)}…` : node.caption;
        context.fillText(caption, node.x, node.y + radius + 3 / view.k);
      }
    }

    context.globalAlpha = 1;
    context.restore();
  }, [payload.seed.id, radiusOf, selectedId]);

  // ── simulation ────────────────────────────────────────────────────────────
  useEffect(() => {
    nodesRef.current = nodes;
    linksRef.current = links;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 520;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const simulation = forceSimulation<SimNode>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) => ((link as SimLink).type === "HAS_VERSION" ? 26 : 54))
          .strength(0.35),
      )
      .force(
        "charge",
        forceManyBody<SimNode>().strength((node) => -70 - node.degree * 8),
      )
      .force(
        "collide",
        forceCollide<SimNode>().radius((node) => radiusOf(node) + 5),
      )
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX(width / 2).strength(0.035))
      .force("y", forceY(height / 2).strength(0.035))
      .alphaDecay(reduced ? 0.35 : 0.028);

    simRef.current = simulation;

    // Pin the seed so the picture keeps a stable anchor between depth changes.
    const seed = nodes.find((node) => node.id === payload.seed.id);
    if (seed) {
      seed.fx = width / 2;
      seed.fy = height / 2;
    }

    simulation.on("tick", draw);
    simulation.on("end", () => setSettledKey(payloadKey));

    // With reduced motion we run the layout to completion in one go and paint
    // the finished state, marking it settled after the frame rather than
    // during the effect.
    let frame = 0;
    if (reduced) {
      simulation.tick(180);
      simulation.stop();
      draw();
      frame = requestAnimationFrame(() => setSettledKey(payloadKey));
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      simulation.stop();
      simRef.current = null;
    };
  }, [nodes, links, draw, radiusOf, payload.seed.id, payloadKey]);

  // ── canvas sizing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = wrap.clientWidth * dpr;
      canvas.height = wrap.clientHeight * dpr;
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw]);

  // ── pointer interaction ───────────────────────────────────────────────────
  const toWorld = (event: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    return {
      x: (event.clientX - rect.left - view.x) / view.k,
      y: (event.clientY - rect.top - view.y) / view.k,
      sx: event.clientX - rect.left,
      sy: event.clientY - rect.top,
    };
  };

  const nodeAt = (x: number, y: number): SimNode | null => {
    for (let i = nodesRef.current.length - 1; i >= 0; i -= 1) {
      const node = nodesRef.current[i];
      if (node.x == null || node.y == null) continue;
      const r = radiusOf(node) + 4;
      if ((node.x - x) ** 2 + (node.y - y) ** 2 <= r * r) return node;
    }
    return null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toWorld(event);
    const node = nodeAt(x, y);
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);

    if (node) {
      dragRef.current = { node, pointer: null };
      simRef.current?.alphaTarget(0.24).restart();
      node.fx = node.x;
      node.fy = node.y;
    } else {
      dragRef.current = { node: null, pointer: { x: event.clientX, y: event.clientY } };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (drag.node) {
      const { x, y } = toWorld(event);
      drag.node.fx = x;
      drag.node.fy = y;
      return;
    }

    if (drag.pointer) {
      const view = viewRef.current;
      view.x += event.clientX - drag.pointer.x;
      view.y += event.clientY - drag.pointer.y;
      drag.pointer = { x: event.clientX, y: event.clientY };
      draw();
      return;
    }

    const { x, y, sx, sy } = toWorld(event);
    const node = nodeAt(x, y);
    const width = event.currentTarget.clientWidth;
    const height = event.currentTarget.clientHeight;
    setHovered(
      node
        ? {
            node,
            left: Math.max(8, Math.min(sx + 14, width - 268)),
            top: Math.max(8, Math.min(sy + 14, height - 90)),
          }
        : null,
    );
    event.currentTarget.style.cursor = node ? "pointer" : "grab";
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag.node) {
      simRef.current?.alphaTarget(0);
      if (drag.node.id !== payload.seed.id) {
        drag.node.fx = null;
        drag.node.fy = null;
      }
    }
    dragRef.current = { node: null, pointer: null };
    (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);
  };

  const onClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toWorld(event);
    onSelect?.(nodeAt(x, y));
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const view = viewRef.current;
    const { sx, sy } = toWorld(event);
    const factor = Math.exp(-event.deltaY * 0.0016);
    const next = Math.min(4, Math.max(0.25, view.k * factor));
    view.x = sx - ((sx - view.x) / view.k) * next;
    view.y = sy - ((sy - view.y) / view.k) * next;
    view.k = next;
    draw();
  };

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const view = viewRef.current;
    const cx = canvas.clientWidth / 2;
    const cy = canvas.clientHeight / 2;
    const next = Math.min(4, Math.max(0.25, view.k * factor));
    view.x = cx - ((cx - view.x) / view.k) * next;
    view.y = cy - ((cy - view.y) / view.k) * next;
    view.k = next;
    draw();
  };

  const reset = () => {
    viewRef.current = { x: 0, y: 0, k: 1 };
    simRef.current?.alpha(0.6).restart();
    draw();
  };

  const present = new Set(payload.nodes.map((node) => node.label));

  return (
    <div
      ref={wrapRef}
      className="relative h-[560px] w-full overflow-hidden rounded-[5px] border border-rule bg-[var(--peat-sunken)]"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHovered(null)}
        onClick={onClick}
        onWheel={onWheel}
        role="img"
        aria-label={`Graph of ${payload.nodes.length} nodes and ${payload.edges.length} relationships around ${payload.seed.id}. The same data is available as tables on the detail pages.`}
      />

      {!ready ? (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
          <span className="breathe u-mono rounded-full border border-rule bg-[var(--peat-raised)] px-3 py-1 text-[10px] uppercase tracking-[0.13em] text-lichen">
            settling
          </span>
        </div>
      ) : null}

      {/* legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-3.5 gap-y-1.5 rounded border border-rule bg-[color-mix(in_srgb,var(--peat)_85%,transparent)] px-3 py-2 backdrop-blur-sm">
        {(Object.keys(NODE_STYLE) as NodeLabel[])
          .filter((label) => present.has(label))
          .map((label) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{ width: 7, height: 7, background: NODE_STYLE[label].fill }}
              />
              <span className="u-mono text-[9.5px] uppercase tracking-[0.1em] text-lichen">{label}</span>
            </span>
          ))}
      </div>

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoomBy(1.3)}
          className="btn px-2 py-1 text-[13px]"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.3)}
          className="btn px-2 py-1 text-[13px]"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={reset}
          className="btn px-2 py-1 text-[9.5px] uppercase tracking-[0.1em]"
          aria-label="Reset view"
        >
          fit
        </button>
      </div>

      {/* hover tooltip */}
      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[260px] rounded border border-rule bg-[var(--peat-high)] px-2.5 py-1.5 shadow-xl"
          style={{ left: hovered.left, top: hovered.top }}
        >
          <p
            className="u-mono text-[9.5px] uppercase tracking-[0.11em]"
            style={{ color: nodeFill(hovered.node) }}
          >
            {hovered.node.label}
          </p>
          <p className="u-mono mt-0.5 break-all text-[11.5px] text-bone">{hovered.node.caption}</p>
          {hovered.node.sub ? <p className="mt-0.5 text-[10.5px] text-lichen">{hovered.node.sub}</p> : null}
          <p className="u-mono mt-1 text-[9.5px] text-lichen-faint">
            {hovered.node.degree} connection{hovered.node.degree === 1 ? "" : "s"} · click to focus
          </p>
        </div>
      ) : null}
    </div>
  );
}
