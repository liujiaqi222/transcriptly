import { databaseHealthCheck } from "../db/client";
import { EnvironmentConfigurationError } from "../env/server";

export interface HealthCheck {
  verifyConnection(): Promise<void>;
}

export interface HealthResult {
  body: {
    status: "ok" | "unavailable";
    checks: {
      app: "up";
      database?: {
        status: "up" | "down";
        reason?: "configuration_error" | "database_unavailable";
      };
    };
  };
  status: 200 | 503;
}

export function getLiveness(): HealthResult {
  return {
    status: 200,
    body: {
      status: "ok",
      checks: { app: "up" },
    },
  };
}

export async function getReadiness(
  healthCheck: HealthCheck = databaseHealthCheck,
): Promise<HealthResult> {
  try {
    await healthCheck.verifyConnection();
    return {
      status: 200,
      body: {
        status: "ok",
        checks: {
          app: "up",
          database: { status: "up" },
        },
      },
    };
  } catch (error) {
    return {
      status: 503,
      body: {
        status: "unavailable",
        checks: {
          app: "up",
          database: {
            status: "down",
            reason:
              error instanceof EnvironmentConfigurationError
                ? "configuration_error"
                : "database_unavailable",
          },
        },
      },
    };
  }
}
