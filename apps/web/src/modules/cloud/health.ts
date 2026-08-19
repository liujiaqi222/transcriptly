import { EnvironmentConfigurationError } from "../../env/server";
import { cloudDataSource } from "./database/client";

export interface CloudDataSource {
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

export function getCloudLiveness(): HealthResult {
  return {
    status: 200,
    body: {
      status: "ok",
      checks: { app: "up" },
    },
  };
}

export async function getCloudReadiness(
  dataSource: CloudDataSource = cloudDataSource,
): Promise<HealthResult> {
  try {
    await dataSource.verifyConnection();
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
