import type { Ecosystem, Severity, ServiceTier } from "@/lib/domain/types";

/**
 * Keys in the graph are stable and machine-shaped (`npm:lodash@4.17.21`).
 * People are not, so nothing renders a raw key without going through here.
 */
export type ParsedVersionKey = {
  ecosystem: string;
  packageName: string;
  version: string;
  packageKey: string;
};

export function parseVersionKey(key: string): ParsedVersionKey {
  const colon = key.indexOf(":");
  const ecosystem = colon === -1 ? "" : key.slice(0, colon);
  const rest = colon === -1 ? key : key.slice(colon + 1);
  const at = rest.lastIndexOf("@");
  const packageName = at === -1 ? rest : rest.slice(0, at);
  const version = at === -1 ? "" : rest.slice(at + 1);
  return { ecosystem, packageName, version, packageKey: `${ecosystem}:${packageName}` };
}

export function parsePackageKey(key: string): { ecosystem: string; name: string } {
  const colon = key.indexOf(":");
  if (colon === -1) return { ecosystem: "", name: key };
  return { ecosystem: key.slice(0, colon), name: key.slice(colon + 1) };
}

/** Package keys contain colons and slashes; both need encoding in a URL path. */
export const packageHref = (key: string) => `/packages/${encodeURIComponent(key)}`;

export const ECOSYSTEM_LABEL: Record<string, string> = {
  npm: "npm",
  pypi: "PyPI",
  maven: "Maven",
  cargo: "crates.io",
  go: "Go",
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  CRITICAL: "var(--sev-critical)",
  HIGH: "var(--sev-high)",
  MEDIUM: "var(--sev-medium)",
  LOW: "var(--sev-low)",
};

export const TIER_LABEL: Record<ServiceTier, string> = {
  critical: "Tier 1",
  standard: "Tier 2",
  internal: "Internal",
};

/**
 * Soil-profile ramp. Depth 6 and beyond all read as bedrock.
 *
 * Two ramps, because a 3px block of colour and a line of 12px text have very
 * different contrast requirements. `depthColor` is for bands and bars;
 * `depthTextColor` is the same hue held above 4.5:1 on every surface.
 */
export function depthColor(depth: number): string {
  return `var(--depth-${Math.max(0, Math.min(6, depth))})`;
}

export function depthTextColor(depth: number): string {
  return `var(--depth-text-${Math.max(0, Math.min(6, depth))})`;
}

const COMPACT = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const PLAIN = new Intl.NumberFormat("en-GB");

export const compactNumber = (value: number) => COMPACT.format(value);
export const plainNumber = (value: number) => PLAIN.format(value);

export function plural(count: number, singular: string, pluralForm?: string) {
  return `${PLAIN.format(count)} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** Dates in the graph are plain ISO days; render them without a timezone lie. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function relativeDay(iso: string | null | undefined, asOf = new Date("2026-02-01T00:00:00Z")): string {
  if (!iso) return "";
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.round((asOf.getTime() - date.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  const years = days / 365;
  return `${years < 2 ? years.toFixed(1) : Math.round(years)}y ago`;
}

export const ecosystemLabel = (e: Ecosystem | string) => ECOSYSTEM_LABEL[e] ?? e;
