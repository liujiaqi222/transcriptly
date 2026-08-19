import { config } from "dotenv";

const DEFAULT_DATABASE_ENV_FILE =
  "/Users/liujiaqi/code/video-blog-suggester/.env";

/** Load only DATABASE_URL from the shared local env file. Injected env wins. */
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
