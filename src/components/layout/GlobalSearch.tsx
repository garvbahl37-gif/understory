"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Portal, useScrollLock } from "@/components/ui/Portal";
import { packageHref } from "@/lib/format";

type Candidate = { label: string; id: string; caption: string; sub: string | null };

const HREF: Record<string, (id: string) => string> = {
  Service: (id) => `/services/${id}`,
  Package: (id) => packageHref(id),
  Advisory: (id) => `/advisories/${encodeURIComponent(id)}`,
  Maintainer: (id) => `/explorer?seed=maintainer&id=${encodeURIComponent(id)}`,
};

const LABEL_COLOR: Record<string, string> = {
  Service: "var(--accent)",
  Package: "var(--depth-2)",
  Advisory: "var(--sev-high)",
  Maintainer: "var(--fg-subtle)",
};

/**
 * One search box over four node labels.
 *
 * This is a small demonstration of the point the whole application is making:
 * services, packages, advisories and people live in the same graph, so one
 * statement can search all of them and the UI never has to ask "which kind of
 * thing are you looking for?"
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useScrollLock(open);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((previous) => {
          if (!previous) {
            setQuery("");
            setResults([]);
            setCursor(0);
          }
          return !previous;
        });
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Opening and closing are user actions, so they reset state where they
  // happen rather than in an effect watching `open`.
  const openDialog = useCallback(() => {
    setQuery("");
    setResults([]);
    setCursor(0);
    setOpen(true);
  }, []);

  const closeDialog = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = (await response.json()) as { results?: Candidate[] };
        if (!cancelled) {
          setResults(data.results ?? []);
          setCursor(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const go = useCallback(
    (candidate: Candidate) => {
      const build = HREF[candidate.label];
      if (!build) return;
      closeDialog();
      router.push(build(candidate.id));
    },
    [router, closeDialog],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (event.key === "Enter" && results[cursor]) {
      event.preventDefault();
      go(results[cursor]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex items-center gap-2 rounded border border-rule bg-[var(--well)] px-2.5 py-1.5 text-[12px] text-fg-subtle transition-colors hover:border-rule-strong hover:text-fg-muted"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden fill="none">
          <circle cx="5" cy="5" r="3.6" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.8 7.8 L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">Search the graph</span>
        <kbd className="u-mono ml-1 hidden rounded border border-rule px-1 py-px text-[9.5px] text-fg-faint sm:inline">
          ⌘K
        </kbd>
      </button>

      {open ? (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-start justify-center bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
            onClick={closeDialog}
            role="presentation"
          >
            <div
              className="panel w-full max-w-[560px] overflow-hidden p-0 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Search the graph"
            >
              <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 12 12"
                  aria-hidden
                  fill="none"
                  className="text-fg-subtle"
                >
                  <circle cx="5" cy="5" r="3.6" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M7.8 7.8 L11 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <input
                  autoFocus
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Service, package, advisory or maintainer…"
                  className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-faint"
                  aria-label="Search the graph"
                />
                {loading ? <span className="breathe u-mono text-[10px] text-fg-faint">…</span> : null}
              </div>

              <div className="max-h-[52vh] overflow-y-auto">
                {results.length === 0 && !loading ? (
                  <p className="px-4 py-6 text-[13px] text-fg-subtle">
                    {query
                      ? `Nothing in the graph matches “${query}”.`
                      : "Start typing, or press Escape to close."}
                  </p>
                ) : null}

                {results.map((candidate, index) => (
                  <button
                    key={`${candidate.label}:${candidate.id}`}
                    type="button"
                    onClick={() => go(candidate)}
                    onMouseEnter={() => setCursor(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === cursor ? "bg-[var(--surface-2)]" : ""
                    }`}
                  >
                    <span
                      className="u-mono w-[74px] shrink-0 text-[9.5px] uppercase tracking-[0.11em]"
                      style={{ color: LABEL_COLOR[candidate.label] ?? "var(--fg-subtle)" }}
                    >
                      {candidate.label}
                    </span>
                    <span className="u-mono min-w-0 flex-1 truncate text-[12.5px] text-fg">
                      {candidate.caption}
                    </span>
                    {candidate.sub ? (
                      <span className="u-mono shrink-0 text-[10.5px] text-fg-faint">{candidate.sub}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}
