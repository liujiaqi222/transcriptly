import { describe, expect, it } from "vitest";
import { EnvironmentConfigurationError } from "../env/server";
import { getLiveness, getReadiness, type HealthCheck } from "./health";

function healthCheckThatThrows(error: Error): HealthCheck {
  return {
    verifyConnection: () => Promise.reject(error),
  };
}

describe("web health", () => {
  it("reports app liveness without depending on PostgreSQL", () => {
    expect(getLiveness()).toEqual({
      status: 200,
      body: { status: "ok", checks: { app: "up" } },
    });
  });

  it("reports readiness when the authoritative database is available", async () => {
    await expect(
      getReadiness({ verifyConnection: () => Promise.resolve() }),
    ).resolves.toEqual({
      status: 200,
      body: {
        status: "ok",
        checks: { app: "up", database: { status: "up" } },
      },
    });
  });

  it("keeps the app up but reports a database outage", async () => {
    const result = await getReadiness(
      healthCheckThatThrows(new Error("contains a secret and must not escape")),
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
    const result = await getReadiness(
      healthCheckThatThrows(
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
