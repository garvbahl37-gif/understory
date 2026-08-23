import Link from "next/link";

import { Page } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <Page>
      <div className="mx-auto max-w-[54ch] py-16">
        <p className="u-eyebrow mb-3">404</p>
        <h1 className="u-display text-[30px]">Nothing in the graph matches that</h1>
        <p className="u-lede mt-3">
          The service, package or advisory in that URL is not in the database. It may have been renamed, or
          the graph may not have been seeded yet.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href="/" className="btn btn-primary">
            Back to the overview
          </Link>
          <Link href="/advisories" className="btn">
            Browse advisories
          </Link>
          <Link href="/packages" className="btn">
            Search packages
          </Link>
        </div>
      </div>
    </Page>
  );
}
