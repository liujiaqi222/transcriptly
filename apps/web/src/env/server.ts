import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { loadLocalDatabaseEnvironment } from "../../env-loader";

export class EnvironmentConfigurationError extends Error {
  override readonly name = "EnvironmentConfigurationError";
}

let serverEnvironment: ReturnType<typeof createServerEnvironment> | undefined;

function configurationError(
  issues: readonly { path?: readonly unknown[] }[],
): never {
  const variables = [
    ...new Set(
      issues.map((issue) => issue.path?.map(String).join(".") ?? "unknown"),
    ),
  ].join(", ");
  throw new EnvironmentConfigurationError(
    `Missing or invalid server configuration: ${variables}`,
  );
}

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
    onValidationError: configurationError,
  });
}

export function getServerEnv() {
  serverEnvironment ??= createServerEnvironment();
  return serverEnvironment;
}

let authEnvironment: ReturnType<typeof createAuthEnvironment> | undefined;

function createAuthEnvironment() {
  return createEnv({
    server: {
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.url(),
      GITHUB_CLIENT_ID: z.string().min(1),
      GITHUB_CLIENT_SECRET: z.string().min(1),
      GOOGLE_CLIENT_ID: z.string().min(1),
      GOOGLE_CLIENT_SECRET: z.string().min(1),
      /** Exact chrome-extension:// origins allowed to call auth endpoints. */
      EXTENSION_ORIGINS: z.string().optional(),
    },
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      EXTENSION_ORIGINS: process.env.EXTENSION_ORIGINS,
    },
    emptyStringAsUndefined: true,
    onValidationError: configurationError,
  });
}

export function getAuthEnv() {
  authEnvironment ??= createAuthEnvironment();
  return authEnvironment;
}
