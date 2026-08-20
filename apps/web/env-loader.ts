import { resolve } from "node:path";
import { config } from "dotenv";

/** Resolve the app's own env file relative to the current working directory. */
const DEFAULT_DATABASE_ENV_FILE = resolve(process.cwd(), ".env.local");

/**
 * Load only DATABASE_URL from the local env file. Injected env wins, so the
 * Next.js dev server (which loads .env.local itself) is never affected.
 *
 * Override the file location with TRANSCRIPTLY_ENV_FILE if needed.
 */
export function loadLocalDatabaseEnvironment(): void {
  if (process.env.DATABASE_URL) {
    return;
  }

  const loaded: Record<string, string> = {};
  config({
    path: process.env.TRANSCRIPTLY_ENV_FILE ?? DEFAULT_DATABASE_ENV_FILE,
    processEnv: loaded,
    quiet: true,
  });

  if (loaded.DATABASE_URL) {
    process.env.DATABASE_URL = loaded.DATABASE_URL;
  }
}
