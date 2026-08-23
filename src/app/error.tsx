"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[understory] unhandled render error", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-6 py-9 lg:px-10">
      <div className="panel overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-rule bg-[color-mix(in_srgb,var(--sev-critical)_7%,transparent)] px-5 py-3">
          <span className="breathe inline-block h-[7px] w-[7px] rounded-full bg-critical" />
          <span className="u-mono text-[11px] uppercase tracking-[0.13em] text-critical">
            Something broke
          </span>
        </div>
        <div className="px-5 py-5">
          <p className="text-[15px] text-fg">This page failed to render.</p>
          <p className="u-lede mt-2.5 text-[13px]">
            This is a bug rather than a database problem — the data layer reports its own failures with a
            specific message. Retrying is worth one attempt; if it persists, the connection page will tell you
            whether CognoDB is reachable.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <button type="button" onClick={reset} className="btn btn-primary">
              Try again
            </button>
            <Link href="/health" className="btn">
              Connection status
            </Link>
            <Link href="/" className="btn">
              Back to the overview
            </Link>
          </div>
          {error.digest ? (
            <p className="u-mono mt-5 border-t border-rule pt-4 text-[11px] text-fg-ghost">
              digest {error.digest}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
