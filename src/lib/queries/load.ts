import { toDbError, type DbErrorShape } from "@/lib/db/errors";

/**
 * Server components cannot throw their way to a good error state — a thrown
 * `DbError` becomes a generic 500 boundary and the reader learns nothing. So
 * every page loads through here and renders either the data or a precise,
 * actionable failure.
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: DbErrorShape };

export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    const dbError = toDbError(error);
    if (dbError.kind === "unknown") {
      console.error("[understory] unexpected database failure", dbError.detail);
    }
    return { ok: false, error: dbError.toJSON() };
  }
}

/** Loads several things at once and fails as a unit if any of them fails. */
export async function loadAll<T extends Record<string, Promise<unknown>>>(
  tasks: T,
): Promise<Loaded<{ [K in keyof T]: Awaited<T[K]> }>> {
  try {
    const entries = await Promise.all(
      Object.entries(tasks).map(async ([key, promise]) => [key, await promise] as const),
    );
    return { ok: true, data: Object.fromEntries(entries) as { [K in keyof T]: Awaited<T[K]> } };
  } catch (error) {
    const dbError = toDbError(error);
    if (dbError.kind === "unknown") {
      console.error("[understory] unexpected database failure", dbError.detail);
    }
    return { ok: false, error: dbError.toJSON() };
  }
}
