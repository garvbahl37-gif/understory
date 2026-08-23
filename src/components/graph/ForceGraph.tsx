"use client";

import {
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

import type { GraphNode, GraphPayload, NodeLabel } from "@/lib/domain/types";

/**
 * The explorer's canvas.
 *
 * Two ideas do most of the work here.
 *
 * First, **nodes are coloured by how far they sit from the thing you asked
 * about**, on the same depth ramp the dependency chains use everywhere else in
 * the application. That turns an undifferentiated hairball into a picture with
 * a readable gradient: light at the surface, dark at the bedrock. Colouring by
 * node type is available too, but depth is the default because depth is the
 * question this product exists to answer.
 *
 * Second, **hovering traces the route back to the seed**. Everything not on the
 * path dims. That is the single most useful thing a supply-chain graph can do,
 * and it costs one breadth-first search computed once per layout.
 *
 * Canvas rather than SVG because a few hundred nodes with per-frame repaints is
 * where SVG starts dropping frames. The accessible representation is not the
 * canvas — it is the same subgraph rendered as tables on every detail page.
 */

type SimNode = GraphNode & SimulationNodeDatum & { degree: number; hop: number };
type SimLink = SimulationLinkDatum<SimNode> & { type: string; id: string };

export type ColorMode = "depth" | "kind";

const KIND_STYLE: Record<NodeLabel, { fill: string; radius: number }> = {
  Service: { fill: "#8aa4ff", radius: 9 },
  Team: { fill: "#a3adbf", radius: 7 },
  Package: { fill: "#5fc9c0", radius: 6.5 },
  Version: { fill: "#647cc4", radius: 4.5 },
  Advisory: { fill: "#e25a5a", radius: 7.5 },
  Maintainer: { fill: "#c9a2f0", radius: 6.5 },
  License: { fill: "#ecd76d", radius: 6 },
};

const DEPTH_FILL = ["#e6ecff", "#c3d0f7", "#a2b4ee", "#8298df", "#647cc4", "#4c619f", "#3a4b78"];

const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: "#e25a5a",
  HIGH: "#e59318",
  MEDIUM: "#ecd76d",
  LOW: "#75b478",
};

const EDGE_STYLE: Record<string, { stroke: string; width: number; dashed?: boolean }> = {
  OWNS: { stroke: "#6f7a90", width: 1 },
  CALLS: { stroke: "#8aa4ff", width: 1.3, dashed: true },
  USES: { stroke: "#8aa4ff", width: 1.5 },
  HAS_VERSION: { stroke: "#3a4356", width: 0.9 },
  DEPENDS_ON: { stroke: "#4c5a80", width: 1.1 },
  AFFECTS: { stroke: "#e25a5a", width: 1.4, dashed: true },
  MAINTAINS: { stroke: "#8b74b8", width: 1 },
  LICENSED_UNDER: { stroke: "#8a7d45", width: 0.9 },
  SUPERSEDES: { stroke: "#333b4b", width: 0.9 },
  SIMILAR_TO: { stroke: "#e59318", width: 1.3, dashed: true },
  PUBLISHED: { stroke: "#3a4356", width: 0.8 },
};

const clampHop = (hop: number) => Math.max(0, Math.min(6, hop));

export function ForceGraph({
  payload,
  onSelect,
  selectedId,
  colorMode = "depth",
}: {
  payload: GraphPayload;
  onSelect?: (node: GraphNode | null) => void;
  selectedId?: string | null;
  colorMode?: ColorMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const animRef = useRef(0);
  const dragRef = useRef<{ node: SimNode | null; pointer: { x: number; y: number } | null; moved: boolean }>({
    node: null,
    pointer: null,
    moved: false,
  });
  const hoverRef = useRef<string | null>(null);

  const [hovered, setHovered] = useState<{ node: SimNode; left: number; top: number } | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  const payloadKey = `${payload.seed.id}|${payload.nodes.length}|${payload.edges.length}|${colorMode}`;
  const settling = settledKey !== payloadKey;

  /**
   * Nodes, links, and — the important part — each node's hop distance from the
   * seed plus the parent that got us there. One BFS gives both the colour ramp
   * and the "trace the route back" interaction.
   */
  /**
   * Read-only derived data. The mutable simulation objects are built inside the
   * effect below — d3-force mutates its nodes every tick, and something the
   * render produced is the wrong place to keep state that a physics loop owns.
   */
  const graph = useMemo(() => {
    const degree = new Map<string, number>();
    const neighbours = new Map<string, string[]>();
    const push = (a: string, b: string) => {
      const list = neighbours.get(a);
      if (list) list.push(b);
      else neighbours.set(a, [b]);
    };
    for (const edge of payload.edges) {
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
      push(edge.source, edge.target);
      push(edge.target, edge.source);
    }

    const hop = new Map<string, number>();
    const parentOf = new Map<string, string>();
    const queue = [payload.seed.id];
    hop.set(payload.seed.id, 0);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours.get(current) ?? []) {
        if (hop.has(next)) continue;
        hop.set(next, (hop.get(current) ?? 0) + 1);
        parentOf.set(next, current);
        queue.push(next);
      }
    }

    let maxHop = 0;
    for (const value of hop.values()) maxHop = Math.max(maxHop, value);

    return { degree, hop, parentOf, maxHop, nodes: payload.nodes, edges: payload.edges };
  }, [payload]);

  const { parentOf, maxHop } = graph;

  const radiusOf = useCallback(
    (node: SimNode) => (KIND_STYLE[node.label]?.radius ?? 5) + Math.min(6, Math.sqrt(node.degree) * 1.15),
    [],
  );

  const fillOf = useCallback(
    (node: SimNode) => {
      if (node.label === "Advisory" && node.severity) return SEVERITY_FILL[node.severity] ?? "#e25a5a";
      if (colorMode === "kind") return KIND_STYLE[node.label]?.fill ?? "#a3adbf";
      return DEPTH_FILL[clampHop(node.hop)];
    },
    [colorMode],
  );

  /** The chain of node ids from a node back to the seed. */
  const routeToSeed = useCallback(
    (id: string) => {
      const chain = new Set<string>();
      let cursor: string | undefined = id;
      while (cursor && !chain.has(cursor)) {
        chain.add(cursor);
        cursor = parentOf.get(cursor);
      }
      return chain;
    },
    [parentOf],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const view = viewRef.current;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.save();
    context.translate(view.x, view.y);
    context.scale(view.k, view.k);

    // Focus is the hovered node if there is one, otherwise the selected node.
    const focusId = hoverRef.current ?? selectedId ?? null;
    const lit = focusId ? routeToSeed(focusId) : null;

    // ── edges ───────────────────────────────────────────────────────────────
    for (const link of linksRef.current) {
      const s = link.source as SimNode;
      const t = link.target as SimNode;
      if (s.x == null || t.x == null || s.y == null || t.y == null) continue;

      const style = EDGE_STYLE[link.type] ?? { stroke: "#333b4b", width: 0.9 };
      const onRoute = lit ? lit.has(s.id) && lit.has(t.id) : false;

      context.beginPath();
      context.moveTo(s.x, s.y);
      // A gentle arc reads as a connection rather than a wireframe strut, and
      // it keeps parallel edges between the same pair from overlapping.
      const mx = (s.x + t.x) / 2;
      const my = (s.y + t.y) / 2;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      context.quadraticCurveTo(mx - dy * 0.08, my + dx * 0.08, t.x, t.y);

      context.strokeStyle = onRoute ? "#aec0ff" : style.stroke;
      context.globalAlpha = lit ? (onRoute ? 0.95 : 0.07) : 0.5;
      context.lineWidth = (onRoute ? style.width + 0.8 : style.width) / Math.max(0.75, view.k * 0.85);
      context.setLineDash(style.dashed ? [3.5 / view.k, 3.5 / view.k] : []);
      context.stroke();
    }
    context.setLineDash([]);

    // ── nodes, biggest first so labels compete fairly ───────────────────────
    const ordered = [...nodesRef.current].sort((a, b) => radiusOf(b) - radiusOf(a));

    for (const node of ordered) {
      if (node.x == null || node.y == null) continue;
      const radius = radiusOf(node);
      const isSeed = node.id === payload.seed.id;
      const onRoute = lit ? lit.has(node.id) : true;

      if (isSeed || node.id === focusId) {
        context.globalAlpha = 0.18;
        context.beginPath();
        context.arc(node.x, node.y, radius + 8 / view.k, 0, Math.PI * 2);
        context.fillStyle = isSeed ? "#e9edf5" : "#aec0ff";
        context.fill();
      }

      context.globalAlpha = onRoute ? 1 : 0.16;
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, Math.PI * 2);
      context.fillStyle = fillOf(node);
      context.fill();

      context.lineWidth = (isSeed ? 2.4 : 1.6) / view.k;
      context.strokeStyle = isSeed ? "#e9edf5" : "#0b0e14";
      context.stroke();

      // Services get a second ring so the operational layer stays findable
      // even when everything is coloured by depth.
      if (node.label === "Service" && colorMode === "depth" && !isSeed) {
        context.beginPath();
        context.arc(node.x, node.y, radius + 3 / view.k, 0, Math.PI * 2);
        context.strokeStyle = "#8aa4ff";
        context.globalAlpha = onRoute ? 0.75 : 0.12;
        context.lineWidth = 1.2 / view.k;
        context.stroke();
      }
    }

    // ── labels, second pass, collision-culled ───────────────────────────────
    const claimed: Array<[number, number, number, number]> = [];
    const fontPx = 11 / view.k;
    context.font = `500 ${fontPx}px "IBM Plex Mono", ui-monospace, monospace`;
    context.textAlign = "center";
    context.textBaseline = "top";

    for (const node of ordered) {
      if (node.x == null || node.y == null) continue;
      const onRoute = lit ? lit.has(node.id) : true;
      if (!onRoute) continue;

      const radius = radiusOf(node);
      const forced = node.id === focusId || node.id === payload.seed.id || (lit?.has(node.id) ?? false);
      if (!forced && (view.k < 0.55 || radius < 6)) continue;

      const caption = node.caption.length > 26 ? `${node.caption.slice(0, 25)}…` : node.caption;
      const w = context.measureText(caption).width;
      const x = node.x - w / 2;
      const y = node.y + radius + 4 / view.k;
      const h = fontPx * 1.25;

      const collides = claimed.some(
        ([cx, cy, cw, ch]) => x < cx + cw && x + w > cx && y < cy + ch && y + h > cy,
      );
      if (collides && !forced) continue;
      claimed.push([x, y, w, h]);

      // A tinted plate keeps the text readable where it crosses an edge.
      context.globalAlpha = 0.72;
      context.fillStyle = "#0b0e14";
      context.fillRect(x - 3 / view.k, y - 1 / view.k, w + 6 / view.k, h);

      context.globalAlpha = 1;
      context.fillStyle = forced ? "#e9edf5" : "#a3adbf";
      context.fillText(caption, node.x, y);
    }

    context.globalAlpha = 1;
    context.restore();
  }, [payload.seed.id, radiusOf, fillOf, routeToSeed, selectedId, colorMode]);

  /** Eases the viewport to a target transform instead of snapping. */
  const animateTo = useCallback(
    (target: { x: number; y: number; k: number }, duration = 380) => {
      cancelAnimationFrame(animRef.current);
      const from = { ...viewRef.current };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || duration === 0) {
        viewRef.current = target;
        draw();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - (1 - t) ** 3; // easeOutCubic
        viewRef.current = {
          x: from.x + (target.x - from.x) * e,
          y: from.y + (target.y - from.y) * e,
          k: from.k + (target.k - from.k) * e,
        };
        draw();
        if (t < 1) animRef.current = requestAnimationFrame(step);
      };
      animRef.current = requestAnimationFrame(step);
    },
    [draw],
  );

  /** Frames the whole subgraph. Runs once the layout settles, and on "fit". */
  const fitToContent = useCallback(
    (animate = true) => {
      const canvas = canvasRef.current;
      const all = nodesRef.current;
      if (!canvas || all.length === 0) return;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of all) {
        if (node.x == null || node.y == null) continue;
        const r = radiusOf(node) + 18;
        minX = Math.min(minX, node.x - r);
        minY = Math.min(minY, node.y - r);
        maxX = Math.max(maxX, node.x + r);
        maxY = Math.max(maxY, node.y + r);
      }
      if (!Number.isFinite(minX)) return;

      const width = canvas.clientWidth || canvas.width;
      const height = canvas.clientHeight || canvas.height;
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const k = Math.min(2.4, Math.max(0.18, Math.min(width / spanX, height / spanY)));

      animateTo(
        { k, x: width / 2 - ((minX + maxX) / 2) * k, y: height / 2 - ((minY + maxY) / 2) * k },
        animate ? 420 : 0,
      );
    },
    [animateTo, radiusOf],
  );

  // ── simulation ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 620;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Build the mutable layout objects here, seeded as concentric rings by hop
    // distance. Starting from a structured guess rather than random noise makes
    // the settled picture legible and the animation calm instead of explosive.
    const simNodes: SimNode[] = graph.nodes.map((node, index) => {
      const hop = graph.hop.get(node.id) ?? 6;
      const ring = clampHop(hop);
      const angle = (index / Math.max(1, graph.nodes.length)) * Math.PI * 2 * 3.7;
      return {
        ...node,
        degree: graph.degree.get(node.id) ?? 0,
        hop,
        x: width / 2 + Math.cos(angle) * ring * 95,
        y: height / 2 + Math.sin(angle) * ring * 95,
      };
    });

    const byId = new Map(simNodes.map((node) => [node.id, node]));
    const simLinks: SimLink[] = graph.edges
      .filter((edge) => byId.has(edge.source) && byId.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        type: edge.type,
        source: byId.get(edge.source)!,
        target: byId.get(edge.target)!,
      }));

    nodesRef.current = simNodes;
    linksRef.current = simLinks;

    const simulation = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((node) => node.id)
          .distance((link) => ((link as SimLink).type === "HAS_VERSION" ? 30 : 74))
          .strength(0.22),
      )
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((node) => -190 - node.degree * 16)
          .distanceMax(620),
      )
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((node) => radiusOf(node) + 11)
          .iterations(2),
      )
      .force("x", forceX<SimNode>(width / 2).strength(0.02))
      .force("y", forceY<SimNode>(height / 2).strength(0.02))
      .alphaDecay(reduced ? 0.35 : 0.024);

    simRef.current = simulation;

    const seed = byId.get(payload.seed.id);
    if (seed) {
      seed.fx = width / 2;
      seed.fy = height / 2;
    }

    // Re-frame every few ticks while the layout is still moving. Watching a
    // graph settle inside the frame feels considered; watching it drift off the
    // edge and snap back at the end does not.
    let tick = 0;
    simulation.on("tick", () => {
      tick += 1;
      if (tick < 150 && tick % 6 === 0) fitToContent(false);
      draw();
    });
    simulation.on("end", () => {
      fitToContent(true);
      setSettledKey(payloadKey);
    });

    let frame = 0;
    if (reduced) {
      simulation.tick(200);
      simulation.stop();
      fitToContent(false);
      frame = requestAnimationFrame(() => setSettledKey(payloadKey));
    }

    return () => {
      if (frame) cancelAnimationFrame(frame);
      cancelAnimationFrame(animRef.current);
      simulation.stop();
      simRef.current = null;
    };
  }, [graph, draw, radiusOf, fitToContent, payload.seed.id, payloadKey]);

  // ── canvas sizing ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw]);

  // Escape clears the selection.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSelect?.(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSelect]);

  // ── pointer interaction ───────────────────────────────────────────────────
  const toLocal = (event: React.PointerEvent | React.MouseEvent | React.WheelEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const view = viewRef.current;
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k, sx, sy };
  };

  const nodeAt = (x: number, y: number): SimNode | null => {
    let best: SimNode | null = null;
    let bestDist = Infinity;
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const r = radiusOf(node) + 5;
      const d = (node.x - x) ** 2 + (node.y - y) ** 2;
      if (d <= r * r && d < bestDist) {
        best = node;
        bestDist = d;
      }
    }
    return best;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toLocal(event);
    const node = nodeAt(x, y);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (node) {
      dragRef.current = { node, pointer: null, moved: false };
      simRef.current?.alphaTarget(0.2).restart();
      node.fx = node.x;
      node.fy = node.y;
    } else {
      dragRef.current = { node: null, pointer: { x: event.clientX, y: event.clientY }, moved: false };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;

    if (drag.node) {
      const { x, y } = toLocal(event);
      drag.node.fx = x;
      drag.node.fy = y;
      drag.moved = true;
      return;
    }

    if (drag.pointer) {
      const view = viewRef.current;
      view.x += event.clientX - drag.pointer.x;
      view.y += event.clientY - drag.pointer.y;
      drag.pointer = { x: event.clientX, y: event.clientY };
      drag.moved = true;
      draw();
      return;
    }

    const { x, y, sx, sy } = toLocal(event);
    const node = nodeAt(x, y);
    const width = event.currentTarget.clientWidth;
    const height = event.currentTarget.clientHeight;

    if (hoverRef.current !== (node?.id ?? null)) {
      hoverRef.current = node?.id ?? null;
      draw();
    }
    setHovered(
      node
        ? {
            node,
            left: Math.max(8, Math.min(sx + 16, width - 272)),
            top: Math.max(8, Math.min(sy + 16, height - 104)),
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
      // A tap that never moved is a selection, not a drag.
      if (!drag.moved) onSelect?.(drag.node);
    } else if (!drag.moved) {
      onSelect?.(null);
    }
    dragRef.current = { node: null, pointer: null, moved: false };
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onPointerLeave = () => {
    if (hoverRef.current !== null) {
      hoverRef.current = null;
      draw();
    }
    setHovered(null);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    cancelAnimationFrame(animRef.current);
    const view = viewRef.current;
    const { sx, sy } = toLocal(event);
    const next = Math.min(4, Math.max(0.15, view.k * Math.exp(-event.deltaY * 0.0016)));
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
    const next = Math.min(4, Math.max(0.15, view.k * factor));
    animateTo(
      { k: next, x: cx - ((cx - view.x) / view.k) * next, y: cy - ((cy - view.y) / view.k) * next },
      220,
    );
  };

  const presentKinds = new Set(payload.nodes.map((node) => node.label));
  const hopSteps = Array.from({ length: Math.min(6, Math.max(1, maxHop)) + 1 }, (_, i) => i);

  return (
    <div
      ref={wrapRef}
      className="relative h-[620px] w-full overflow-hidden rounded-[10px] border border-rule bg-well"
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        role="img"
        aria-label={`Graph of ${payload.nodes.length} nodes and ${payload.edges.length} relationships around ${payload.seed.id}. The same data is available as tables on the detail pages.`}
      />

      {settling ? (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
          <span className="breathe u-mono rounded-full border border-rule bg-surface px-3 py-1 text-[10px] uppercase tracking-[0.13em] text-fg-subtle">
            finding a layout
          </span>
        </div>
      ) : null}

      {/* legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-rule bg-[color-mix(in_srgb,var(--ink)_82%,transparent)] px-3 py-2.5 backdrop-blur-sm">
        {colorMode === "depth" ? (
          <>
            <p className="u-mono mb-1.5 text-[9px] uppercase tracking-[0.13em] text-fg-faint">
              hops from {payload.seed.label.toLowerCase()}
            </p>
            <div className="flex items-center gap-1">
              {hopSteps.map((hop) => (
                <span key={hop} className="flex flex-col items-center gap-1">
                  <span
                    className="block h-[9px] w-[22px] rounded-sm"
                    style={{ background: DEPTH_FILL[clampHop(hop)] }}
                  />
                  <span className="u-mono text-[8.5px] text-fg-faint">{hop}</span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex max-w-[380px] flex-wrap gap-x-3 gap-y-1.5">
            {(Object.keys(KIND_STYLE) as NodeLabel[])
              .filter((label) => presentKinds.has(label))
              .map((label) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 7, height: 7, background: KIND_STYLE[label].fill }}
                  />
                  <span className="u-mono text-[9px] uppercase tracking-[0.1em] text-fg-subtle">{label}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      {/* controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => zoomBy(1.35)}
          className="btn px-2.5 py-1 text-[14px]"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.35)}
          className="btn px-2.5 py-1 text-[14px]"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => fitToContent(true)}
          className="btn px-2.5 py-1 text-[9px] uppercase tracking-[0.1em]"
          aria-label="Fit the whole graph in view"
        >
          fit
        </button>
      </div>

      {/* hover card */}
      {hovered ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[264px] rounded-lg border border-rule bg-surface-2 px-3 py-2 shadow-2xl"
          style={{ left: hovered.left, top: hovered.top }}
        >
          <p
            className="u-mono text-[9px] uppercase tracking-[0.12em]"
            style={{ color: fillOf(hovered.node) }}
          >
            {hovered.node.label}
            {hovered.node.id !== payload.seed.id ? ` · ${hovered.node.hop} hops out` : " · start"}
          </p>
          <p className="u-mono mt-1 break-all text-[11.5px] text-fg">{hovered.node.caption}</p>
          {hovered.node.sub ? (
            <p className="mt-0.5 text-[10.5px] text-fg-subtle">{hovered.node.sub}</p>
          ) : null}
          <p className="u-mono mt-1.5 text-[9px] text-fg-faint">
            {hovered.node.degree} connection{hovered.node.degree === 1 ? "" : "s"} · click to inspect
          </p>
        </div>
      ) : null}
    </div>
  );
}
