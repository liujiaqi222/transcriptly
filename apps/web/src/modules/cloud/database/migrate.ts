import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  EnvironmentConfigurationError,
  getServerEnv,
} from "../../../env/server";

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
]);

function isConnectionFailure(
  error: unknown,
  seen = new Set<unknown>(),
): boolean {
  if (!error || typeof error !== "object" || seen.has(error)) {
    return false;
  }
  seen.add(error);

  if (
    "code" in error &&
    typeof error.code === "string" &&
    CONNECTION_ERROR_CODES.has(error.code)
  ) {
    return true;
  }

  const nested = [
    ...("cause" in error ? [error.cause] : []),
    ...("errors" in error && Array.isArray(error.errors) ? error.errors : []),
  ];
  return nested.some((item) => isConnectionFailure(item, seen));
}

async function runMigrations(): Promise<void> {
  let client: ReturnType<typeof postgres> | undefined;

  try {
    client = postgres(getServerEnv().DATABASE_URL, {
      connect_timeout: 5,
      max: 1,
      onnotice: () => undefined,
    });
    await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
    console.info("Database migrations completed.");
  } catch (error) {
    if (error instanceof EnvironmentConfigurationError) {
      console.error(error.message);
    } else if (isConnectionFailure(error)) {
      console.error("Database migration failed: database is unreachable.");
    } else {
      console.error(
        "Database migration failed: a versioned migration could not be applied.",
      );
    }
    process.exitCode = 1;
  } finally {
    await client?.end();
  }
}

await runMigrations();
