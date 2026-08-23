import Link from "next/link";

import { GlobalSearch } from "./GlobalSearch";
import { MobileNav } from "./MobileNav";
import { Wordmark } from "./Wordmark";

export function Masthead() {
  return (
    <header className="sticky top-0 z-40 flex h-[57px] items-center gap-4 border-b border-rule bg-[color-mix(in_srgb,var(--peat)_88%,transparent)] px-4 backdrop-blur-md lg:px-5">
      <MobileNav />
      <Link href="/" className="shrink-0 rounded transition-opacity hover:opacity-85">
        <Wordmark />
      </Link>
      <span className="hidden text-[12px] text-lichen-dim md:inline">open-source supply chain graph</span>
      <div className="ml-auto flex items-center gap-3">
        <GlobalSearch />
        <a
          href="https://github.com/garvbahl37-gif/understory"
          target="_blank"
          rel="noreferrer noopener"
          className="u-mono hidden text-[11px] uppercase tracking-[0.1em] text-lichen transition-colors hover:text-bone-dim sm:inline"
        >
          Source
        </a>
      </div>
    </header>
  );
}
