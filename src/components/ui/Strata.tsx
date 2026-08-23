import Link from "next/link";
import type { ReactNode } from "react";

import { packageHref, parseVersionKey, depthColor, depthTextColor } from "@/lib/format";

/**
 * The signature device.
 *
 * A dependency path is not a breadcrumb — it is a descent. Engineers already
 * read these as indented trees in monospace, so that is how they are drawn,
 * with a soil-profile gutter on the left so a non-technical reader can see how
 * deep the problem is buried before reading a single package name.
 */

export type StratumRow = {
  /** 0 is the surface: the service you own. */
  depth: number;
  label: ReactNode;
  /** Right-aligned annotation — scope, licence, "vulnerable", and so on. */
  note?: ReactNode;
  href?: string;
  flagged?: boolean;
};

export function Strata({ rows, className = "" }: { rows: StratumRow[]; className?: string }) {
  return (
    <div className={`strata ${className}`} role="list">
      {rows.map((row, index) => {
        const connector = row.depth === 0 ? "" : `${"   ".repeat(Math.max(0, row.depth - 1))}└─ `;
        const body = (
          <span className={row.flagged ? "text-critical" : "text-fg-muted"}>
            <span className="text-fg-faint">{connector}</span>
            {row.label}
          </span>
        );
        return (
          <div className="depth-row" role="listitem" key={`${index}-${row.depth}`}>
            <span className="depth-depth" aria-hidden>
              {row.depth}
            </span>
            <span
              className="depth-band"
              style={{ ["--band" as string]: depthColor(row.depth) }}
              aria-hidden
            />
            <span className="depth-body flex items-baseline justify-between gap-4">
              {row.href ? (
                <Link href={row.href} className="link truncate">
                  {body}
                </Link>
              ) : (
                body
              )}
              {row.note ? (
                <span className="shrink-0 whitespace-nowrap text-[10.5px] uppercase tracking-[0.1em] text-fg-faint">
                  {row.note}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Turns a raw chain of version keys — as returned by the blast-radius and
 * contamination queries — into strata rows, with the service at the surface.
 */
export function chainToStrata(
  serviceName: string,
  serviceHref: string,
  chain: string[],
  options: { flagLast?: boolean; endNote?: ReactNode } = {},
): StratumRow[] {
  const rows: StratumRow[] = [{ depth: 0, label: serviceName, href: serviceHref, note: "service" }];

  chain.forEach((key, index) => {
    const parsed = parseVersionKey(key);
    const isLast = index === chain.length - 1;
    rows.push({
      depth: index + 1,
      label: (
        <>
          {parsed.packageName}
          <span className="text-fg-faint">@{parsed.version}</span>
        </>
      ),
      href: packageHref(parsed.packageKey),
      flagged: isLast && options.flagLast !== false,
      note: index === 0 ? "declared" : isLast ? (options.endNote ?? "vulnerable") : undefined,
    });
  });

  return rows;
}

/** A one-line version of the same idea, for dense tables. */
export function InlineChain({ chain }: { chain: string[] }) {
  return (
    <span className="u-mono text-[11.5px] text-fg-subtle">
      {chain.map((key, index) => {
        const parsed = parseVersionKey(key);
        return (
          <span key={key}>
            {index > 0 ? <span className="text-fg-faint"> › </span> : null}
            <span style={{ color: depthTextColor(index + 1) }}>{parsed.packageName}</span>
          </span>
        );
      })}
    </span>
  );
}
