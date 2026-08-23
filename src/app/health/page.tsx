import Link from "next/link";

import { ErrorState } from "@/components/ui/ErrorState";
import { Page, PageHeader, Panel, Section, Stat } from "@/components/ui/primitives";
import { checkHealth } from "@/lib/db/driver";
import { QUERY_LIST } from "@/lib/queries/catalog";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connection",
  description: "Live connectivity to the CognoDB instance behind this application.",
};

export default async function HealthPage() {
  const report = await checkHealth();

  const tone =
    report.status === "ok"
      ? { color: "var(--sev-low)", label: "Connected" }
      : report.status === "degraded"
        ? { color: "var(--sev-medium)", label: "Degraded" }
        : { color: "var(--sev-critical)", label: "Unreachable" };

  return (
    <Page>
      <PageHeader
        eyebrow="Under the hood"
        title="Connection"
        lede="This page round-trips a real request to CognoDB every time it loads. The same check backs the indicator in the sidebar and the /api/health endpoint, which returns 503 when the database cannot be reached — so an uptime monitor can point straight at it."
      />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-block h-[9px] w-[9px] rounded-full ${report.status === "ok" ? "" : "breathe"}`}
            style={{ background: tone.color }}
          />
          <span className="u-display text-[22px]" style={{ color: tone.color }}>
            {tone.label}
          </span>
          {report.latencyMs !== undefined ? (
            <span className="u-num text-[13px] text-fg-subtle">{report.latencyMs}ms round trip</span>
          ) : null}
        </div>

        <dl className="mt-5 grid gap-4 border-t border-rule pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="u-eyebrow">Endpoint</dt>
            <dd className="u-mono mt-1.5 break-all text-[12px] text-fg-muted">{report.target}</dd>
          </div>
          <div>
            <dt className="u-eyebrow">Database</dt>
            <dd className="u-mono mt-1.5 text-[12px] text-fg-muted">{report.database}</dd>
          </div>
          <div>
            <dt className="u-eyebrow">Server</dt>
            <dd className="u-mono mt-1.5 break-all text-[12px] text-fg-muted">
              {report.server?.agent ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="u-eyebrow">Bolt protocol</dt>
            <dd className="u-mono mt-1.5 text-[12px] text-fg-muted">
              {report.server?.protocolVersion ?? "—"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-rule pt-4 text-[12px] text-fg-subtle">
          Credentials are never rendered here or logged anywhere. The endpoint above is the URI with its
          userinfo and path stripped.
        </p>
      </Panel>

      {report.error ? (
        <div className="mb-6">
          <ErrorState error={report.error} retryHref="/health" />
        </div>
      ) : null}

      <Section title="How this application talks to CognoDB">
        <div className="grid gap-3 md:grid-cols-2">
          <Panel>
            <p className="u-eyebrow mb-2">One driver per process</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              The Bolt driver owns a connection pool and is meant to be long-lived, so it is stashed on{" "}
              <code className="u-mono text-[12px] text-accent">globalThis</code> and reused across warm
              serverless invocations. Idle sockets are pinged before they are handed out, because a proxy will
              happily drop a connection the pool still believes in.
            </p>
          </Panel>
          <Panel>
            <p className="u-eyebrow mb-2">A pool sized for the free tier</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              The c0 instance allows 200 connections in total and a serverless platform will happily start
              more isolates than that. Each instance caps its own pool at twelve, with a ten-second
              acquisition timeout, so a cold-start burst degrades into slower requests rather than a
              connection storm.
            </p>
          </Panel>
          <Panel>
            <p className="u-eyebrow mb-2">Every read is bounded</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Reads go through one helper that sets read access mode, attaches a transaction timeout and tags
              the transaction with the query&apos;s catalogue id — so a slow page can be traced to a statement
              in the database&apos;s own query log rather than guessed at.
            </p>
          </Panel>
          <Panel>
            <p className="u-eyebrow mb-2">Failures are typed, not thrown</p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Driver errors are normalised into six kinds — not configured, unreachable, unauthorised,
              timeout, bad query, unknown — each with its own remediation text. Pages render that state
              instead of a 500, which is why you are reading a sentence rather than a stack trace when
              something breaks.
            </p>
          </Panel>
        </div>
      </Section>

      <Section title="Verification">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Statements in the catalogue"
            value={QUERY_LIST.length}
            sub="all of them parameterised"
          />
          <Stat
            label="Verification command"
            value={<span className="u-mono text-[15px]">npm run verify</span>}
            sub="runs every statement against the live instance"
          />
          <Stat
            label="Health endpoint"
            value={
              <Link href="/api/health" className="link u-mono text-[15px]">
                /api/health
              </Link>
            }
            sub="200 when healthy, 503 when not"
          />
        </div>
      </Section>
    </Page>
  );
}
