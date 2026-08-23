"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { ForceGraph, type ColorMode } from "@/components/graph/ForceGraph";
import { ErrorState } from "@/components/ui/ErrorState";
import { Portal, useScrollLock } from "@/components/ui/Portal";
import { EmptyState, Panel, Tag } from "@/components/ui/primitives";
import type { DbErrorShape } from "@/lib/db/errors";
import type { GraphNode, GraphPayload } from "@/lib/domain/types";
import { packageHref } from "@/lib/format";

const SEEDS = [
  { value: "service", label: "Service" },
  { value: "package", label: "Package" },
  { value: "advisory", label: "Advisory" },
  { value: "maintainer", label: "Maintainer" },
] as const;

type SeedKind = (typeof SEEDS)[number]["value"];

type Candidate = { label: string; id: string; caption: string; sub: string | null };

export function ExplorerClient({ initialSeed, initialId }: { initialSeed: SeedKind; initialId: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const seed = ((params.get("seed") as SeedKind) || initialSeed) satisfies SeedKind;
  const id = params.get("id") || initialId;
  const depth = Number(params.get("depth") ?? 3);

  // One keyed result rather than three separate flags: `loading` is derived
  // from whether the stored result matches the request we currently want, so
  // nothing has to be set synchronously when the inputs change.
  const requestKey = `${seed}|${id}|${depth}`;
  const [result, setResult] = useState<{
    key: string;
    payload?: GraphPayload;
    error?: DbErrorShape;
  } | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const loading = Boolean(id) && result?.key !== requestKey;
  const payload = result?.key === requestKey ? result.payload : undefined;
  const error = result?.key === requestKey ? result.error : undefined;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  useScrollLock(pickerOpen);

  const [colorMode, setColorMode] = useState<ColorMode>("depth");

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) next.set(key, value);
      router.replace(`/explorer?${next.toString()}`, { scroll: false });
    },
    [params, router],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    fetch(`/api/graph?seed=${seed}&id=${encodeURIComponent(id)}&maxDepth=${depth}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (cancelled) return;
        setSelected(null);
        if (data.error) setResult({ key: requestKey, error: data.error as DbErrorShape });
        else setResult({ key: requestKey, payload: data as GraphPayload });
      })
      .catch(() => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          error: {
            kind: "unreachable",
            message: "Could not load the subgraph.",
            detail: "The request to /api/graph failed before it reached the database.",
            retryable: true,
          },
        });
      });

    return () => {
      cancelled = true;
    };
  }, [seed, id, depth, requestKey]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(pickerQuery)}`, { cache: "no-store" });
      const data = (await response.json()) as { results?: Candidate[] };
      if (!cancelled) setCandidates(data.results ?? []);
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickerQuery, pickerOpen]);

  const focusOn = (node: GraphNode) => {
    const [label, ...rest] = node.id.split(":");
    const value = rest.join(":");
    const kind =
      label === "Service"
        ? "service"
        : label === "Package"
          ? "package"
          : label === "Advisory"
            ? "advisory"
            : label === "Maintainer"
              ? "maintainer"
              : null;
    if (!kind) return;
    setParam({ seed: kind, id: value });
    setPickerOpen(false);
  };

  const detailHref = (node: GraphNode) => {
    const [label, ...rest] = node.id.split(":");
    const value = rest.join(":");
    if (label === "Service") return `/services/${value}`;
    if (label === "Package") return packageHref(value);
    if (label === "Advisory") return `/advisories/${encodeURIComponent(value)}`;
    if (label === "Version") return packageHref(value.slice(0, value.lastIndexOf("@")));
    return null;
  };

  return (
    <>
      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="u-eyebrow mr-1">Start from</span>
          {SEEDS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              data-active={seed === option.value}
              onClick={() => {
                setPickerQuery("");
                setPickerOpen(true);
                setParam({ seed: option.value });
              }}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button type="button" className="btn" onClick={() => setPickerOpen(true)}>
          <span className="u-mono text-[11.5px] text-fg-subtle">{seed}</span>
          <span className="u-mono text-[12px] text-fg">{id || "choose…"}</span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="u-eyebrow mr-1">Depth</span>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className="chip"
              data-active={depth === value}
              onClick={() => setParam({ depth: String(value) })}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="u-eyebrow mr-1">Colour by</span>
          {(
            [
              { value: "depth", label: "distance" },
              { value: "kind", label: "kind" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              data-active={colorMode === option.value}
              onClick={() => setColorMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {payload ? (
          <span className="u-mono text-[11px] text-fg-subtle">
            {payload.nodes.length} nodes · {payload.edges.length} relationships
          </span>
        ) : null}
      </div>

      {/* picker */}
      {pickerOpen ? (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[14vh] backdrop-blur-sm"
            onClick={() => setPickerOpen(false)}
            role="presentation"
          >
            <div
              className="panel panel-lifted w-full max-w-[520px] overflow-hidden p-0"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Choose a starting point"
            >
              <input
                autoFocus
                value={pickerQuery}
                onChange={(event) => setPickerQuery(event.target.value)}
                placeholder="Search services, packages, advisories, maintainers…"
                className="w-full border-b border-rule bg-transparent px-4 py-3 text-[14px] text-fg outline-none placeholder:text-fg-faint"
              />
              <div className="max-h-[48vh] overflow-y-auto">
                {candidates.length === 0 ? (
                  <p className="px-4 py-6 text-[13px] text-fg-subtle">Nothing matches yet.</p>
                ) : null}
                {candidates.map((candidate) => (
                  <button
                    key={`${candidate.label}:${candidate.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-2)]"
                    onClick={() =>
                      focusOn({
                        id: `${candidate.label}:${candidate.id}`,
                        label: candidate.label as GraphNode["label"],
                        caption: candidate.caption,
                      })
                    }
                  >
                    <span className="u-mono w-[72px] shrink-0 text-[9.5px] uppercase tracking-[0.11em] text-fg-subtle">
                      {candidate.label}
                    </span>
                    <span className="u-mono flex-1 truncate text-[12.5px] text-fg">{candidate.caption}</span>
                    {candidate.sub ? (
                      <span className="u-mono shrink-0 text-[10.5px] text-fg-ghost">{candidate.sub}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}

      {/* canvas + inspector */}
      {error ? (
        <ErrorState error={error} retryHref={`/explorer?seed=${seed}&id=${encodeURIComponent(id)}`} />
      ) : !id ? (
        <EmptyState
          title="Pick somewhere to start"
          body="Choose a service to see everything it stands on, a package to see both directions at once, an advisory to see its blast radius, or a maintainer to see what one account could reach."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setPickerOpen(true)}>
              Choose a starting point
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_296px]">
          <div className="relative">
            {loading ? (
              <div className="flex h-[560px] items-center justify-center rounded-[5px] border border-rule bg-[var(--well)]">
                <span className="breathe u-mono text-[11px] uppercase tracking-[0.13em] text-fg-subtle">
                  walking the graph
                </span>
              </div>
            ) : payload && payload.nodes.length > 0 ? (
              <ForceGraph
                payload={payload}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                colorMode={colorMode}
              />
            ) : (
              <EmptyState
                title="Nothing connects to that"
                body="This node exists but has no relationships within the chosen depth. Try increasing the depth, or start somewhere more central."
              />
            )}
            {payload?.truncated ? (
              <p className="mt-2 text-[11.5px] text-high">
                Result capped at the edge limit — some relationships are not drawn. Reduce the depth for a
                complete picture of a smaller neighbourhood.
              </p>
            ) : null}
          </div>

          <Panel className="h-fit">
            {selected ? (
              <>
                <p className="u-eyebrow mb-2">{selected.label}</p>
                <p className="u-mono break-all text-[13.5px] text-fg">{selected.caption}</p>
                {selected.sub ? <p className="mt-1 text-[12px] text-fg-subtle">{selected.sub}</p> : null}

                {selected.meta ? (
                  <dl className="mt-4 space-y-2 border-t border-rule pt-3 text-[11.5px]">
                    {Object.entries(selected.meta)
                      .filter(([, value]) => value !== null && value !== undefined)
                      .slice(0, 6)
                      .map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-3">
                          <dt className="text-fg-subtle">{key}</dt>
                          <dd className="u-mono truncate text-fg-muted">{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                ) : null}

                <div className="mt-4 flex flex-col gap-2">
                  {detailHref(selected) ? (
                    <Link href={detailHref(selected)!} className="btn justify-center">
                      Open detail page
                    </Link>
                  ) : null}
                  {["Service", "Package", "Advisory", "Maintainer"].includes(selected.label) ? (
                    <button
                      type="button"
                      className="btn btn-primary justify-center"
                      onClick={() => focusOn(selected)}
                    >
                      Re-centre here
                    </button>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <p className="u-eyebrow mb-2">Inspector</p>
                <p className="text-[12.5px] leading-relaxed text-fg-subtle">
                  Hover any node to trace its route back to the centre — everything off the path dims. Click
                  to inspect, drag to pull a node around, drag the background to pan, scroll to zoom.
                </p>
                <div className="mt-4 space-y-2 border-t border-rule pt-3 text-[11.5px] text-fg-subtle">
                  <p>
                    <span className="u-mono text-fg-muted">Colour</span> is distance from where you started —
                    light at the surface, dark at the bedrock, the same ramp the dependency chains use.
                  </p>
                  <p>
                    <span className="u-mono text-fg-muted">Dashed edges</span> are advisories, service calls
                    and name-similarity links. Solid ones are structural.
                  </p>
                  <p>
                    <span className="u-mono text-fg-muted">Size</span> tracks how many relationships touch a
                    node, so the chokepoints are the big ones.
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-rule pt-3">
                  <Tag tone="quiet">canvas</Tag>
                  <Tag tone="quiet">d3-force</Tag>
                  <Tag tone="quiet">{payload?.edges.length ?? 0} edges</Tag>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
