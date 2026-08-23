import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import type { Severity } from "@/lib/domain/types";
import { SEVERITY_COLOR } from "@/lib/format";

// ── page furniture ──────────────────────────────────────────────────────────

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1180px] px-6 py-9 lg:px-10">{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="rise mb-8">
      {eyebrow ? <p className="u-eyebrow mb-2.5">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="u-display max-w-[22ch] text-[30px] sm:text-[34px]">{title}</h1>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {lede ? <p className="u-lede mt-3.5">{lede}</p> : null}
    </header>
  );
}

export function Section({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="u-eyebrow">{title}</h2>
          {hint ? <p className="mt-1.5 max-w-[70ch] text-[13px] text-lichen">{hint}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Panel({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`panel ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}

// ── data display ────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "critical" | "high" | "chalk";
  href?: string;
}) {
  const color =
    tone === "critical"
      ? "var(--sev-critical)"
      : tone === "high"
        ? "var(--sev-high)"
        : tone === "chalk"
          ? "var(--chalk)"
          : "var(--bone)";

  const body = (
    <>
      <p className="u-eyebrow">{label}</p>
      <p className="u-num mt-2 text-[27px] leading-none" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="mt-2 text-[12px] leading-snug text-lichen">{sub}</p> : null}
    </>
  );

  const shell = "panel px-4 py-4 transition-colors";
  return href ? (
    <Link href={href} className={`${shell} block hover:border-rule-strong`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function SeverityTag({ severity, compact = false }: { severity: Severity; compact?: boolean }) {
  const color = SEVERITY_COLOR[severity];
  return (
    <span
      className="u-mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[2px] text-[10px] uppercase tracking-[0.1em]"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: color }} />
      {compact ? severity.slice(0, 4) : severity}
    </span>
  );
}

export function Tag({
  children,
  tone = "neutral",
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "chalk" | "warn" | "quiet";
  title?: string;
}) {
  const styles: Record<string, string> = {
    neutral: "border-rule text-bone-dim",
    chalk: "border-chalk-dim text-chalk-bright bg-[var(--chalk-wash)]",
    warn: "border-[color-mix(in_srgb,var(--sev-high)_40%,transparent)] text-high",
    quiet: "border-transparent text-lichen-dim",
  };
  return (
    <span
      title={title}
      className={`u-mono inline-flex items-center whitespace-nowrap rounded-full border px-2 py-[2px] text-[10px] uppercase tracking-[0.09em] ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function TierMark({ tier }: { tier: string }) {
  const map: Record<string, { label: string; color: string }> = {
    critical: { label: "Tier 1", color: "var(--sev-critical)" },
    standard: { label: "Tier 2", color: "var(--lichen)" },
    internal: { label: "Internal", color: "var(--lichen-dim)" },
  };
  const entry = map[tier] ?? { label: tier, color: "var(--lichen)" };
  return (
    <span
      className="u-mono inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.1em]"
      style={{ color: entry.color }}
    >
      <span className="inline-block h-[3px] w-[9px] rounded-sm" style={{ background: entry.color }} />
      {entry.label}
    </span>
  );
}

/** A horizontal bar chart cell — reads faster than a number in a wide table. */
export function Meter({ value, max, tone = "var(--chalk)" }: { value: number; max: number; tone?: string }) {
  const pct = max <= 0 ? 0 : Math.max(2, Math.round((value / max) * 100));
  return (
    <span className="inline-flex items-center gap-2">
      <span className="u-num w-8 text-right text-[12px] text-bone">{value}</span>
      <span className="h-[5px] w-16 overflow-hidden rounded-full bg-[var(--peat-sunken)]">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </span>
    </span>
  );
}

// ── states ──────────────────────────────────────────────────────────────────

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="panel flex flex-col items-start gap-3 px-6 py-10">
      <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
        <rect x="0" y="1" width="30" height="4" rx="1.5" fill="var(--rule-strong)" />
        <rect x="0" y="9" width="30" height="4" rx="1.5" fill="var(--rule)" />
        <rect x="0" y="17" width="30" height="4" rx="1.5" fill="var(--rule)" opacity="0.6" />
      </svg>
      <div>
        <p className="text-[15px] font-medium text-bone">{title}</p>
        <p className="mt-1.5 max-w-[58ch] text-[13px] text-lichen">{body}</p>
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="panel overflow-hidden" role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-rule bg-[var(--peat-raised)] px-4 py-3">
        {Array.from({ length: cols }, (_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 border-b border-rule/50 px-4 py-3.5 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-3 flex-1" style={{ animationDelay: `${(r * cols + c) * 40}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel px-4 py-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-6 w-16" />
          <Skeleton className="mt-3 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}
