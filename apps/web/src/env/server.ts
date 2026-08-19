import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { loadLocalDatabaseEnvironment } from "../../env-loader";

export class EnvironmentConfigurationError extends Error {
  override readonly name = "EnvironmentConfigurationError";
}

let serverEnvironment: ReturnType<typeof createServerEnvironment> | undefined;

function createServerEnvironment() {
  loadLocalDatabaseEnvironment();

  return createEnv({
    server: {
      DATABASE_URL: z
        .url()
        .refine(
          (value) =>
            value.startsWith("postgres://") ||
            value.startsWith("postgresql://"),
          "must be a PostgreSQL URL",
        ),
    },
    runtimeEnv: {
      DATABASE_URL: process.env.DATABASE_URL,
    },
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const variables = [
        ...new Set(issues.map((issue) => issue.path?.join(".") ?? "unknown")),
      ].join(", ");
      throw new EnvironmentConfigurationError(
        `Missing or invalid server configuration: ${variables}`,
      );
    },
  });
}

export function getServerEnv() {
  serverEnvironment ??= createServerEnvironment();
  return serverEnvironment;
}
