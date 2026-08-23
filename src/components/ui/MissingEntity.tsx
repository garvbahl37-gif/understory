import Link from "next/link";

import { Page } from "@/components/ui/primitives";

/**
 * Shown when a URL names something the graph does not contain.
 *
 * A deep link into a graph is a bet that a node exists; when it does not, the
 * useful response is "that identifier is not in this graph, here is how to find
 * what is" rather than a generic 404.
 */
export function MissingEntity({
  kind,
  identifier,
  browseHref,
  browseLabel,
}: {
  kind: string;
  identifier?: string;
  browseHref: string;
  browseLabel: string;
}) {
  return (
    <Page>
      <div className="mx-auto max-w-[56ch] py-14">
        <p className="u-eyebrow mb-3">Not in the graph</p>
        <h1 className="u-display text-[28px]">No {kind} with that identifier</h1>
        {identifier ? (
          <p className="u-mono mt-3 break-all rounded border border-rule bg-well px-3 py-2 text-[12.5px] text-fg-subtle">
            {identifier}
          </p>
        ) : null}
        <p className="u-lede mt-4">
          The graph holds only what the loader put in it. Either this identifier was never seeded, or it is
          spelled differently — Maven artefacts are keyed by their full{" "}
          <span className="u-mono">groupId:artifactId</span>, and package keys are prefixed with their
          registry.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link href={browseHref} className="btn btn-primary">
            {browseLabel}
          </Link>
          <Link href="/explorer" className="btn">
            Search the graph
          </Link>
          <Link href="/" className="btn">
            Back to the overview
          </Link>
        </div>
      </div>
    </Page>
  );
}
