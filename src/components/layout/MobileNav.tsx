"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/advisories", label: "Advisories" },
  { href: "/services", label: "Services" },
  { href: "/packages", label: "Packages" },
  { href: "/risk", label: "Structural risk" },
  { href: "/licences", label: "Licences" },
  { href: "/explorer", label: "Explorer" },
  { href: "/queries", label: "Query catalogue" },
  { href: "/model", label: "Data model" },
  { href: "/health", label: "Connection" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation. React's documented way to react to a changed value is
  // to adjust state during render rather than to fire an effect, which avoids a
  // second render pass and a frame of the drawer still being open.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="rounded border border-rule px-2 py-1.5 text-lichen transition-colors hover:border-rule-strong hover:text-bone"
      >
        <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden>
          <rect y="0" width="14" height="1.6" rx="0.8" fill="currentColor" />
          <rect y="5.2" width="14" height="1.6" rx="0.8" fill="currentColor" />
          <rect y="10.4" width="14" height="1.6" rx="0.8" fill="currentColor" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-black/55" onClick={() => setOpen(false)} role="presentation">
          <nav
            aria-label="Sections"
            className="h-full w-[268px] overflow-y-auto border-r border-rule bg-[var(--peat-sunken)] px-3 py-5"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="u-eyebrow px-3 pb-3">Understory</p>
            <ul className="space-y-px">
              {LINKS.map((link) => {
                const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`block rounded px-3 py-2 text-[13.5px] ${
                        active ? "bg-[var(--peat-high)] text-bone" : "text-lichen"
                      }`}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      ) : null}
    </div>
  );
}
