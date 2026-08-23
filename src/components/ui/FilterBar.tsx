"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export type ChipGroup = {
  /** Query-string key this group writes to. */
  param: string;
  label: string;
  options: Array<{ value: string; label: string; color?: string }>;
  /** Multi-select groups serialise as a comma-separated list. */
  multiple?: boolean;
};

/**
 * Filters live in the URL, not in component state.
 *
 * That keeps every view shareable — "here is the exact list I am looking at" is
 * a link — and it means the server component does the filtering, so a filtered
 * page is a filtered query rather than a large payload trimmed in the browser.
 */
export function FilterBar({
  groups,
  searchParam,
  searchPlaceholder = "Search…",
}: {
  groups: ChipGroup[];
  searchParam?: string;
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const committed = searchParam ? (params.get(searchParam) ?? "") : "";
  const [draft, setDraft] = useState(committed);

  // The URL is the source of truth. When it changes underneath us — a Clear
  // press, the back button — reconcile the input during render rather than in
  // an effect, so the field never shows a stale value for a frame.
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (lastCommitted !== committed) {
    setLastCommitted(committed);
    setDraft(committed);
  }

  const push = (next: URLSearchParams) => {
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  };

  const toggle = (group: ChipGroup, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (group.multiple) {
      const current = new Set((next.get(group.param) ?? "").split(",").filter(Boolean));
      if (current.has(value)) current.delete(value);
      else current.add(value);
      if (current.size === 0) next.delete(group.param);
      else next.set(group.param, [...current].join(","));
    } else if (next.get(group.param) === value) {
      next.delete(group.param);
    } else {
      next.set(group.param, value);
    }
    push(next);
  };

  const isActive = (group: ChipGroup, value: string) => {
    const current = params.get(group.param) ?? "";
    return group.multiple ? current.split(",").includes(value) : current === value;
  };

  // Debounce the typed value into the URL. Only the timer lives in the effect;
  // nothing is set synchronously, so typing never triggers a cascading render.
  useEffect(() => {
    if (!searchParam || draft === committed) return;

    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (draft) next.set(searchParam, draft);
      else next.delete(searchParam);
      const query = next.toString();
      startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    }, 260);

    return () => window.clearTimeout(timer);
  }, [draft, committed, searchParam, params, pathname, router]);

  const anyActive =
    groups.some((group) => params.get(group.param)) || (searchParam && params.get(searchParam));

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
      {searchParam ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={searchPlaceholder}
          className="control w-full sm:w-[268px]"
          aria-label={searchPlaceholder}
        />
      ) : null}

      {groups.map((group) => (
        <div key={group.param} className="flex flex-wrap items-center gap-1.5">
          <span className="u-eyebrow mr-1">{group.label}</span>
          {group.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              data-active={isActive(group, option.value)}
              onClick={() => toggle(group, option.value)}
              style={
                isActive(group, option.value) && option.color
                  ? {
                      color: option.color,
                      borderColor: `color-mix(in srgb, ${option.color} 45%, transparent)`,
                      background: `color-mix(in srgb, ${option.color} 10%, transparent)`,
                    }
                  : undefined
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      ))}

      {anyActive ? (
        <button type="button" className="chip" onClick={() => push(new URLSearchParams())}>
          Clear
        </button>
      ) : null}

      {pending ? (
        <span className="breathe u-mono text-[10px] uppercase tracking-[0.12em] text-fg-faint">updating</span>
      ) : null}
    </div>
  );
}
