import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { Masthead } from "@/components/layout/Masthead";
import { Rail } from "@/components/layout/Rail";

import "./globals.css";

/**
 * Fraunces carries the name — an organic, slightly wonky serif for a thing
 * called Understory. Plex Sans and Plex Mono do the work: one family, two
 * voices, so the interface reads as a single instrument.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Understory — open-source supply chain graph",
    template: "%s · Understory",
  },
  description:
    "See what your software is standing on. Understory maps services, packages, releases, maintainers, licences and advisories as one graph, so you can answer 'who is affected by this CVE, and through which chain of dependencies?' in a single query.",
  applicationName: "Understory",
  authors: [{ name: "garvbahl37" }],
  openGraph: {
    title: "Understory — open-source supply chain graph",
    description:
      "Blast radius, chokepoints and licence contamination across a live dependency graph, backed by CognoDB.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <Masthead />
        <div className="flex min-h-[calc(100vh-57px)]">
          <Rail />
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
