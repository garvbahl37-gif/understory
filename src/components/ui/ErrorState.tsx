import Link from "next/link";

import { REMEDIATION, type DbErrorShape } from "@/lib/db/errors";

/**
 * Every database failure the application can produce lands here.
 *
 * The rule is that the reader should never see a stack trace, and should always
 * be told what to do next — so the copy comes from the same taxonomy the driver
 * layer uses, and the technical detail sits behind a disclosure for whoever
 * actually wants it.
 */
export function ErrorState({ error, retryHref }: { error: DbErrorShape; retryHref?: string }) {
  const kindLabel: Record<string, string> = {
    not_configured: "Not configured",
    unreachable: "Database unreachable",
    unauthorized: "Access denied",
    timeout: "Query timed out",
    query: "Bad query",
    unknown: "Unexpected error",
  };

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-rule bg-[color-mix(in_srgb,var(--sev-critical)_7%,transparent)] px-5 py-3">
        <span className="breathe inline-block h-[7px] w-[7px] rounded-full bg-critical" />
        <span className="u-mono text-[11px] uppercase tracking-[0.13em] text-critical">
          {kindLabel[error.kind] ?? "Error"}
        </span>
      </div>

      <div className="px-5 py-5">
        <p className="text-[15px] text-fg">{error.message}</p>
        <p className="u-lede mt-2.5 text-[13px]">{REMEDIATION[error.kind] ?? REMEDIATION.unknown}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          {error.retryable && retryHref ? (
            <Link href={retryHref} className="btn btn-primary">
              Try again
            </Link>
          ) : null}
          <Link href="/health" className="btn">
            Connection status
          </Link>
        </div>

        {error.detail ? (
          <details className="mt-5 border-t border-rule pt-4">
            <summary className="u-mono cursor-pointer text-[11px] uppercase tracking-[0.13em] text-fg-subtle hover:text-fg-muted">
              Technical detail
            </summary>
            <pre className="u-mono mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded bg-[var(--well)] p-3 text-[11.5px] leading-relaxed text-fg-subtle">
              {error.code ? `${error.code}\n\n` : ""}
              {error.detail}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}
