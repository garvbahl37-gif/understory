"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HealthPill } from "./HealthPill";

/**
 * Navigation is ordered the way an incident actually unfolds: something lands
 * in Advisories, you follow it into Services, then you go looking for the
 * structural reason it reached so far. No numbering — this is a set of views,
 * not a sequence, and numbered markers would be claiming an order that is not
 * really there.
 */
const GROUPS: Array<{ label: string; items: Array<{ href: string; label: string; hint: string }> }> = [
  {
    label: "Posture",
    items: [
      { href: "/", label: "Overview", hint: "Where the estate stands today" },
      { href: "/advisories", label: "Advisories", hint: "What is wrong, and who it reaches" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/services", label: "Services", hint: "What we run and who owns it" },
      { href: "/packages", label: "Packages", hint: "What we stand on" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/risk", label: "Structural risk", hint: "Chokepoints, maintainers, typosquats" },
      { href: "/licences", label: "Licences", hint: "Obligations we inherited" },
      { href: "/explorer", label: "Explorer", hint: "Walk the graph directly" },
    ],
  },
  {
    label: "Under the hood",
    items: [
      { href: "/queries", label: "Query catalogue", hint: "Every statement, run live" },
      { href: "/model", label: "Data model", hint: "Labels, edges, properties" },
    ],
  },
];

export function Rail() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-[var(--rail)] shrink-0 flex-col justify-between overflow-y-auto border-r border-rule bg-[var(--well)] px-3 py-5 lg:flex"
    >
      <div className="space-y-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="u-eyebrow px-3 pb-2">{group.label}</p>
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group relative block rounded px-3 py-[7px] text-[13px] transition-colors ${
                        active
                          ? "bg-[var(--surface-2)] text-fg"
                          : "text-fg-subtle hover:bg-[var(--surface)] hover:text-fg-muted"
                      }`}
                    >
                      {active ? (
                        <span className="absolute left-0 top-1/2 h-[15px] w-[2px] -translate-y-1/2 rounded-r bg-accent" />
                      ) : null}
                      <span className="block font-medium">{item.label}</span>
                      <span className="mt-px block text-[11px] leading-snug text-fg-faint">{item.hint}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 px-3">
        <HealthPill />
      </div>
    </nav>
  );
}
