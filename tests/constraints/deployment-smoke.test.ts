import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_SMOKE_TARGETS,
  databaseEnvironmentOf,
  normalizeBaseUrl,
  parseSmokeArgs,
  smokeUrl,
} from "../../tools/smoke-deployment";

describe("constraint: deployment smoke targets", () => {
  it("covers the launch-blocking public, auth, dashboard, and health routes", () => {
    expect(DEPLOYMENT_SMOKE_TARGETS.map((target) => target.path)).toEqual([
      "/health/live",
      "/health/ready",
      "/en",
      "/en/login",
      "/en/register",
      "/en/legal",
      "/en/directory",
      "/en/dashboard/profile",
    ]);
  });

  it("accepts the catalogue redirect while public_catalogue is off", () => {
    const directory = DEPLOYMENT_SMOKE_TARGETS.find(
      (target) => target.path === "/en/directory",
    );

    expect(directory?.expectedStatuses).toEqual([200, 307]);
  });

  it("normalizes base URLs before appending smoke paths", () => {
    const baseUrl = normalizeBaseUrl("https://preview.kclub.example///?x=1");

    expect(baseUrl.toString()).toBe("https://preview.kclub.example/");
    expect(smokeUrl(baseUrl, "/health/live")).toBe(
      "https://preview.kclub.example/health/live",
    );
  });

  it("asserts the reported database environment only when asked (ADR 0026)", () => {
    expect(parseSmokeArgs(["https://x.example"], {})).toEqual({
      baseUrl: "https://x.example",
      expectDatabaseEnvironment: undefined,
    });
    expect(
      parseSmokeArgs(
        ["--expect-database-environment", "production", "https://x.example"],
        {},
      ),
    ).toEqual({
      baseUrl: "https://x.example",
      expectDatabaseEnvironment: "production",
    });
    expect(
      parseSmokeArgs([], { SMOKE_BASE_URL: "https://env.example" }),
    ).toEqual({
      baseUrl: "https://env.example",
      expectDatabaseEnvironment: undefined,
    });
  });

  it("reads the environment from the database check of /health/ready", () => {
    expect(
      databaseEnvironmentOf({
        status: "ok",
        checks: [
          { name: "redis", status: "ok" },
          { name: "database", status: "ok", environment: "production" },
        ],
      }),
    ).toBe("production");
    expect(
      databaseEnvironmentOf({ checks: [{ name: "database", status: "ok" }] }),
    ).toBeUndefined();
    expect(databaseEnvironmentOf("not json")).toBeUndefined();
    expect(databaseEnvironmentOf(null)).toBeUndefined();
  });
});
