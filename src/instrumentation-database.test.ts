import { describe, expect, it, vi } from "vitest";

import type { DatabaseMarker } from "./data/database-environment";
import {
  runDatabaseEnvironmentGuard,
  type GuardEffects,
} from "./instrumentation-database";

const production: DatabaseMarker = {
  kind: "marked",
  name: "production",
  markedAt: new Date("2026-08-29T12:00:00Z"),
  markedBy: "owner@laptop",
};
const dev: DatabaseMarker = { ...production, name: "dev" };

function effects(
  overrides: Partial<GuardEffects> & { marker?: DatabaseMarker } = {},
) {
  const { marker = dev, ...rest } = overrides;
  const built: GuardEffects = {
    readMarker: () => Promise.resolve(marker),
    env: { NODE_ENV: "development" },
    exit: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    timeoutMs: 50,
    ...rest,
  };
  return built;
}

describe("server-start database guard (ADR 0026)", () => {
  it("exits the process when a local server starts against a production marker", async () => {
    const e = effects({ marker: production });
    const verdict = await runDatabaseEnvironmentGuard(e);

    expect(verdict.outcome).toBe("refuse");
    expect(e.exit).toHaveBeenCalledWith(1);
    expect(e.error).toHaveBeenCalledWith(
      expect.stringContaining("REFUSING TO START"),
    );
  });

  it("logs the environment and starts normally on a dev marker", async () => {
    const e = effects();
    const verdict = await runDatabaseEnvironmentGuard(e);

    expect(verdict.outcome).toBe("allow");
    expect(e.exit).not.toHaveBeenCalled();
    expect(e.log).toHaveBeenCalledWith(
      expect.stringContaining("database environment: dev"),
    );
  });

  it("never exits a deployed process, whatever the marker says", async () => {
    for (const vercelEnv of ["production", "preview"]) {
      for (const marker of [production, dev, { kind: "no_table" } as const]) {
        const e = effects({
          marker,
          env: { NODE_ENV: "production", VERCEL_ENV: vercelEnv },
        });
        await runDatabaseEnvironmentGuard(e);
        expect(e.exit).not.toHaveBeenCalled();
      }
    }
  });

  it("treats an unreadable marker as a refusal locally and as a warning when deployed", async () => {
    const failing = () => Promise.reject(new Error("connection refused"));

    const local = effects({ readMarker: failing });
    expect((await runDatabaseEnvironmentGuard(local)).outcome).toBe("refuse");
    expect(local.exit).toHaveBeenCalledWith(1);

    const deployed = effects({
      readMarker: failing,
      env: { NODE_ENV: "production", VERCEL_ENV: "production" },
    });
    expect((await runDatabaseEnvironmentGuard(deployed)).outcome).toBe("warn");
    expect(deployed.exit).not.toHaveBeenCalled();
  });

  it("treats a read that outlives the timeout as unreadable", async () => {
    const e = effects({
      readMarker: () => new Promise(() => {}),
      timeoutMs: 20,
    });
    const verdict = await runDatabaseEnvironmentGuard(e);

    expect(verdict.outcome).toBe("refuse");
    expect(verdict).toMatchObject({
      reason: expect.stringContaining("did not answer") as string,
    });
  });

  it("lets the incident shell through with KCLUB_ALLOW_PRODUCTION_DB=1, as a warning", async () => {
    const e = effects({
      marker: production,
      env: { NODE_ENV: "development", KCLUB_ALLOW_PRODUCTION_DB: "1" },
    });
    const verdict = await runDatabaseEnvironmentGuard(e);

    expect(verdict.outcome).toBe("warn");
    expect(e.exit).not.toHaveBeenCalled();
    expect(e.warn).toHaveBeenCalledWith(
      expect.stringContaining("KCLUB_ALLOW_PRODUCTION_DB"),
    );
  });
});
