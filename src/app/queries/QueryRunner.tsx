"use client";

import { useState } from "react";

import type { DbErrorShape } from "@/lib/db/errors";

type Meta = {
  id: string;
  title: string;
  question: string;
  why: string;
  cypher: string;
  example: Record<string, unknown>;
  tags: string[];
  traversal?: string;
};

/**
 * Runs one catalogued statement against the live database and shows the result.
 *
 * The Cypher on screen is the exact string the server executes — both come from
 * the same registry entry — and the parameters are handed over as a JSON object
 * that the statement's own Zod schema validates before the driver sees it.
 */
export function QueryRunner({ meta }: { meta: Meta }) {
  const [params, setParams] = useState(() => JSON.stringify(meta.example, null, 2));
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<DbErrorShape | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(params || "{}");
    } catch {
      setError({
        kind: "query",
        message: "Those parameters are not valid JSON.",
        detail: "Fix the JSON above and run again.",
        retryable: false,
      });
      setRunning(false);
      return;
    }

    try {
      const response = await fetch(`/api/query/${encodeURIComponent(meta.id)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await response.json();
      setMs(data.ms ?? null);
      if (data.error) {
        setError(data.error as DbErrorShape);
        setRows(null);
      } else {
        setRows(data.rows as Record<string, unknown>[]);
        setOpen(true);
      }
    } catch {
      setError({
        kind: "unreachable",
        message: "The request never reached the database.",
        retryable: true,
      });
    } finally {
      setRunning(false);
    }
  };

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  const cell = (value: unknown) => {
    if (value === null || value === undefined) return <span className="text-lichen-faint">null</span>;
    if (Array.isArray(value)) {
      return (
        <span className="text-bone-dim">
          {value.length === 0 ? <span className="text-lichen-faint">[]</span> : value.map(String).join(" › ")}
        </span>
      );
    }
    if (typeof value === "object") return <span className="text-bone-dim">{JSON.stringify(value)}</span>;
    if (typeof value === "boolean")
      return <span className={value ? "text-low" : "text-lichen-faint"}>{String(value)}</span>;
    return <span className="text-bone-dim">{String(value)}</span>;
  };

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="u-mono text-[10.5px] uppercase tracking-[0.12em] text-chalk">{meta.id}</p>
            <h3 className="u-display mt-1.5 text-[19px]">{meta.title}</h3>
            <p className="mt-1.5 max-w-[70ch] text-[13px] text-bone-dim">{meta.question}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {meta.tags.map((tag) => (
              <span
                key={tag}
                className="u-mono rounded-full border border-rule px-2 py-[2px] text-[9.5px] uppercase tracking-[0.09em] text-lichen"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-3 max-w-[78ch] border-l-2 border-rule-strong pl-3 text-[12.5px] italic leading-relaxed text-lichen">
          {meta.why}
        </p>

        {meta.traversal ? (
          <p className="u-mono mt-2.5 text-[11px] text-lichen-faint">{meta.traversal}</p>
        ) : null}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_280px]">
        <pre className="u-mono overflow-x-auto border-b border-rule px-5 py-4 text-[11.5px] leading-[1.7] text-bone-dim lg:border-b-0 lg:border-r">
          {meta.cypher}
        </pre>

        <div className="px-5 py-4">
          <label className="u-eyebrow mb-2 block" htmlFor={`params-${meta.id}`}>
            Parameters
          </label>
          <textarea
            id={`params-${meta.id}`}
            value={params}
            onChange={(event) => setParams(event.target.value)}
            spellCheck={false}
            rows={Math.min(10, Math.max(3, params.split("\n").length))}
            className="control u-mono w-full resize-y text-[11.5px] leading-relaxed"
          />
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="btn btn-primary mt-3 w-full justify-center"
          >
            {running ? "Running…" : "Run against CognoDB"}
          </button>
          {ms !== null ? (
            <p className="u-mono mt-2 text-[10.5px] text-lichen-faint">
              {rows ? `${rows.length} rows · ` : ""}
              {ms}ms round trip
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="border-t border-rule bg-[color-mix(in_srgb,var(--sev-critical)_7%,transparent)] px-5 py-3.5">
          <p className="text-[13px] text-critical">{error.message}</p>
          {error.detail ? <p className="u-mono mt-1 text-[11px] text-lichen">{error.detail}</p> : null}
        </div>
      ) : null}

      {rows && open ? (
        <div className="border-t border-rule">
          <div className="flex items-center justify-between px-5 py-2.5">
            <span className="u-eyebrow">Result</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="u-mono text-[10.5px] text-lichen hover:text-bone-dim"
            >
              hide
            </button>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 pb-4 text-[13px] text-lichen">
              No rows. That is a real answer, not a failure — nothing in the graph satisfies this pattern.
            </p>
          ) : (
            <div className="scroll-x max-h-[420px] overflow-y-auto border-t border-rule">
              <table className="table">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((row, index) => (
                    <tr key={index}>
                      {columns.map((column) => (
                        <td key={column} className="u-mono max-w-[280px] truncate text-[11.5px]">
                          {cell(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 60 ? (
                <p className="px-5 py-2.5 text-[11.5px] text-lichen">
                  Showing the first 60 of {rows.length} rows.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
