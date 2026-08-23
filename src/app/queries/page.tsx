import { Page, PageHeader, Panel, Section } from "@/components/ui/primitives";
import { FEATURED_QUERY_IDS, QUERY_CATALOG, QUERY_LIST } from "@/lib/queries/catalog";

import { QueryRunner } from "./QueryRunner";

export const metadata = {
  title: "Query catalogue",
  description:
    "Every Cypher statement the application can run, with the reasoning behind it — runnable against the live database.",
};

export default function QueriesPage() {
  const featured = FEATURED_QUERY_IDS.map((id) => QUERY_CATALOG[id]).filter(Boolean);
  const multiHop = QUERY_LIST.filter((q) => q.tags.includes("multi-hop")).length;
  const shortestPath = QUERY_LIST.filter((q) => q.tags.includes("shortest-path")).length;

  return (
    <Page>
      <PageHeader
        eyebrow="Under the hood"
        title="Every statement, and why it is a graph query"
        lede="The application holds one frozen catalogue of Cypher. Pages read from it, the API route reads from it, and this page renders from it — so what you see below is not documentation of the queries, it is the queries. Edit the parameters and run any of them against the live database."
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Panel>
          <p className="u-eyebrow">Statements in the catalogue</p>
          <p className="u-num mt-2 text-[27px] text-bone">{QUERY_LIST.length}</p>
          <p className="mt-2 text-[12px] text-lichen">Nothing else in the codebase writes Cypher.</p>
        </Panel>
        <Panel>
          <p className="u-eyebrow">Multi-hop traversals</p>
          <p className="u-num mt-2 text-[27px] text-bone">{multiHop}</p>
          <p className="mt-2 text-[12px] text-lichen">Two hops or more, most of them variable-depth.</p>
        </Panel>
        <Panel>
          <p className="u-eyebrow">Shortest-path searches</p>
          <p className="u-num mt-2 text-[27px] text-bone">{shortestPath}</p>
          <p className="mt-2 text-[12px] text-lichen">Used where the answer is a route, not a row.</p>
        </Panel>
      </div>

      <Panel className="mb-8">
        <h2 className="u-eyebrow mb-3">Three things worth noticing</h2>
        <ul className="space-y-3 text-[13px] leading-relaxed text-bone-dim">
          <li>
            <strong className="text-bone">No string-concatenated Cypher.</strong> Every statement is a frozen
            constant. Values reach the database through the driver&apos;s parameter channel, which makes
            injection structurally impossible and lets CognoDB reuse query plans.
          </li>
          <li>
            <strong className="text-bone">Conditional filters are parameters too.</strong> Patterns like{" "}
            <code className="u-mono text-[12px] text-chalk">
              size($severities) = 0 OR a.severity IN $severities
            </code>{" "}
            let one statement serve every combination of filters without any of them being spliced into the
            query text.
          </li>
          <li>
            <strong className="text-bone">This console cannot run arbitrary Cypher.</strong> The API route
            takes a statement <em>id</em>, not a query, and validates the parameters against that
            statement&apos;s own schema before the driver sees them. It is a read-only window onto a fixed
            surface.
          </li>
        </ul>
      </Panel>

      <Section
        title="The catalogue"
        hint="Ordered so the queries that make the case for a graph database come first."
      >
        <div className="space-y-5">
          {featured.map((definition) => (
            <QueryRunner
              key={definition.id}
              meta={{
                id: definition.id,
                title: definition.title,
                question: definition.question,
                why: definition.why,
                cypher: definition.cypher,
                example: definition.example as Record<string, unknown>,
                tags: [...definition.tags],
                traversal: definition.traversal,
              }}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Also in the catalogue"
        hint="The remaining statements are the explorer's edge-list fragments and simple lookups. They run on every page you have already seen."
      >
        <Panel padded={false} className="overflow-hidden">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Statement</th>
                  <th>Answers</th>
                  <th>Tags</th>
                </tr>
              </thead>
              <tbody>
                {QUERY_LIST.filter((q) => !(FEATURED_QUERY_IDS as readonly string[]).includes(q.id)).map(
                  (q) => (
                    <tr key={q.id}>
                      <td className="u-mono text-[12px] text-chalk">{q.id}</td>
                      <td className="max-w-[480px] text-[12.5px] text-lichen">{q.question}</td>
                      <td className="u-mono text-[10.5px] uppercase tracking-[0.08em] text-lichen-faint">
                        {q.tags.join(" · ")}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </Section>
    </Page>
  );
}
