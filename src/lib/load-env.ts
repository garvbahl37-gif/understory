import { existsSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";

/**
 * Loads environment files for the standalone scripts.
 *
 * The Next.js runtime reads `.env.local` on its own, but `tsx` does not — and
 * `dotenv/config` alone only reads `.env`, which is the kind of mismatch that
 * has you staring at a "not configured" error with the credentials sitting
 * right there on disk. Same precedence Next.js uses: `.env.local` wins, `.env`
 * fills the gaps, and a real environment variable beats both.
 */
export function loadEnv(cwd = process.cwd()): string[] {
  const loaded: string[] = [];
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(cwd, file);
    if (!existsSync(full)) continue;
    config({ path: full, override: false, quiet: true });
    loaded.push(file);
  }
  return loaded;
}
