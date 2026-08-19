import { describe, expect, it } from "vitest";
import { EnvironmentConfigurationError } from "../../env/server";
import {
  type CloudDataSource,
  getCloudLiveness,
  getCloudReadiness,
} from "./health";

function dataSourceThatThrows(error: Error): CloudDataSource {
  return {
    verifyConnection: () => Promise.reject(error),
  };
}

describe("cloud health", () => {
  it("reports app liveness without depending on PostgreSQL", () => {
    expect(getCloudLiveness()).toEqual({
      status: 200,
      body: { status: "ok", checks: { app: "up" } },
    });
  });

  it("reports readiness when the authoritative database is available", async () => {
    await expect(
      getCloudReadiness({ verifyConnection: () => Promise.resolve() }),
    ).resolves.toEqual({
      status: 200,
      body: {
        status: "ok",
        checks: { app: "up", database: { status: "up" } },
      },
    });
  });

  it("keeps the app up but reports a database outage", async () => {
    const result = await getCloudReadiness(
      dataSourceThatThrows(new Error("contains a secret and must not escape")),
    );

    expect(result).toEqual({
      status: 503,
      body: {
        status: "unavailable",
        checks: {
          app: "up",
          database: { status: "down", reason: "database_unavailable" },
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("identifies invalid configuration without exposing its value", async () => {
    const result = await getCloudReadiness(
      dataSourceThatThrows(
        new EnvironmentConfigurationError(
          "DATABASE_URL contains postgresql://user:password@example.com/db",
        ),
      ),
    );

    expect(result.body.checks.database).toEqual({
      status: "down",
      reason: "configuration_error",
    });
    expect(JSON.stringify(result)).not.toContain("password");
  });
});
