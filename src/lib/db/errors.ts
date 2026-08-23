/**
 * A small, deliberate error taxonomy.
 *
 * Everything that can go wrong between the app and CognoDB is normalised into
 * one of these kinds so that every surface — API routes, server components,
 * scripts — can react consistently and show the user something actionable
 * instead of leaking a driver stack trace.
 */
export type DbErrorKind =
  | "not_configured" // env vars missing
  | "unreachable" // DNS / TCP / TLS failure, instance asleep or deleted
  | "unauthorized" // bad username or password
  | "timeout" // query exceeded the configured budget
  | "query" // Cypher syntax / semantic error (a bug on our side)
  | "unknown";

export type DbErrorShape = {
  kind: DbErrorKind;
  /** Safe to show a non-technical user. */
  message: string;
  /** Extra context for engineers; never contains credentials. */
  detail?: string;
  /** Neo4j status code, e.g. Neo.ClientError.Security.Unauthorized */
  code?: string;
  /** Whether retrying the exact same request could plausibly succeed. */
  retryable: boolean;
};

export class DbError extends Error implements DbErrorShape {
  readonly kind: DbErrorKind;
  readonly detail?: string;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(shape: DbErrorShape) {
    super(shape.message);
    this.name = "DbError";
    this.kind = shape.kind;
    this.detail = shape.detail;
    this.code = shape.code;
    this.retryable = shape.retryable;
  }

  toJSON(): DbErrorShape {
    return {
      kind: this.kind,
      message: this.message,
      detail: this.detail,
      code: this.code,
      retryable: this.retryable,
    };
  }
}

const UNREACHABLE_CODES = new Set([
  "ServiceUnavailable",
  "SessionExpired",
  "Neo.TransientError.General.DatabaseUnavailable",
  "Neo.ClientError.Database.DatabaseNotFound",
]);

const NETWORK_PATTERNS = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "socket hang up",
  "Connection acquisition timed out",
  "Could not perform discovery",
  "Failed to connect",
  "WebSocket connection failure",
  "self signed certificate",
  "unable to verify the first certificate",
];

/** Narrows an unknown thrown value into a `DbError`. Never throws. */
export function toDbError(error: unknown): DbError {
  if (error instanceof DbError) return error;

  const raw = error as { code?: string; message?: string; name?: string } | null;
  const code = typeof raw?.code === "string" ? raw.code : undefined;
  const message = typeof raw?.message === "string" ? raw.message : String(error);

  if (
    code === "Neo.ClientError.Security.Unauthorized" ||
    /authentication failure|unauthorized/i.test(message)
  ) {
    return new DbError({
      kind: "unauthorized",
      message: "The database rejected our credentials.",
      detail:
        "Check COGNODB_USER and COGNODB_PASSWORD. CognoDB shows the password exactly once at instance creation.",
      code,
      retryable: false,
    });
  }

  if (/timed out|timeout/i.test(message) && !/Connection acquisition/i.test(message)) {
    return new DbError({
      kind: "timeout",
      message: "The query took too long and was cancelled.",
      detail: message,
      code,
      retryable: true,
    });
  }

  if ((code && UNREACHABLE_CODES.has(code)) || NETWORK_PATTERNS.some((p) => message.includes(p))) {
    return new DbError({
      kind: "unreachable",
      message: "Can't reach the graph database right now.",
      detail: message,
      code,
      retryable: true,
    });
  }

  if (code?.startsWith("Neo.ClientError.Statement")) {
    return new DbError({
      kind: "query",
      message: "The database rejected that query.",
      detail: message,
      code,
      retryable: false,
    });
  }

  return new DbError({
    kind: "unknown",
    message: "Something went wrong talking to the graph database.",
    detail: message,
    code,
    retryable: true,
  });
}

/** Human-facing guidance rendered by the error state component. */
export const REMEDIATION: Record<DbErrorKind, string> = {
  not_configured:
    "Copy .env.example to .env.local and fill in your CognoDB connection URI and password, then restart the dev server.",
  unreachable:
    "The instance may be paused, still provisioning, or blocked by a network policy. Confirm it is running in the CognoDB console and that COGNODB_URI is correct.",
  unauthorized:
    "Regenerate the password from the CognoDB console and update COGNODB_PASSWORD in your environment.",
  timeout: "Narrow the traversal depth or the result limit and try again.",
  query: "This is a bug in the application's Cypher. Please report it with the query name.",
  unknown: "Retry in a moment. If it persists, check the CognoDB status page and your instance's logs.",
};
