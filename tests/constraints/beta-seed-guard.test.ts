import { describe, expect, it } from "vitest";

import {
  betaPurgeRefusal,
  betaSeedRefusal,
  describeDatabaseTarget,
  type BetaSeedTarget,
} from "../../tools/beta-seed-guard";

/**
 * The beta seed guard exists because `pnpm db:seed:beta` once wrote 50 synthetic
 * members and 30 fake partners into production: the old guard trusted the
 * --production CLI flag, which that command never passes. These pin the
 * replacement, which fails closed on any production signal or any pre-existing
 * non-beta member (backlog: beta-seed-guard-checks-a-flag-not-the-database).
 */

function safeTarget(overrides: Partial<BetaSeedTarget> = {}): BetaSeedTarget {
  return {
    isProductionFlag: false,
    nodeEnv: "development",
    vercelEnv: undefined,
    realMemberCount: 0,
    marker: { kind: "unmarked" },
    ...overrides,
  };
}

describe("constraint: beta seed guard reads the target, not a CLI flag", () => {
  it("allows a clean staging database with no non-beta members", () => {
    expect(betaSeedRefusal(safeTarget())).toBeNull();
    expect(
      betaSeedRefusal(
        safeTarget({
          marker: {
            kind: "marked",
            name: "dev",
            markedAt: new Date(),
            markedBy: null,
          },
        }),
      ),
    ).toBeNull();
  });

  it("refuses a database marked production even when it holds no non-beta member (ADR 0026)", () => {
    const reason = betaSeedRefusal(
      safeTarget({
        marker: {
          kind: "marked",
          name: "production",
          markedAt: new Date(),
          markedBy: "owner@laptop",
        },
      }),
    );
    expect(reason).toContain("marked production");
  });

  it("refuses when the database already holds a real (non-beta) member", () => {
    const reason = betaSeedRefusal(safeTarget({ realMemberCount: 1 }));
    expect(reason).not.toBeNull();
    expect(reason).toContain("1 member");
    expect(reason).toContain("contents");
  });

  it("refuses on the --production flag even when the database looks empty", () => {
    expect(betaSeedRefusal(safeTarget({ isProductionFlag: true }))).toContain(
      "production",
    );
  });

  it("refuses when NODE_ENV or VERCEL_ENV is production", () => {
    expect(
      betaSeedRefusal(safeTarget({ nodeEnv: "production" })),
    ).not.toBeNull();
    expect(
      betaSeedRefusal(safeTarget({ vercelEnv: "production" })),
    ).not.toBeNull();
  });

  it("puts the production signal ahead of the contents check", () => {
    // Even a clean database must be refused if the environment says production,
    // so an empty pre-launch production database cannot be seeded either.
    const reason = betaSeedRefusal(
      safeTarget({ vercelEnv: "production", realMemberCount: 0 }),
    );
    expect(reason).toContain("production");
  });
});

describe("constraint: beta purge is explicitly confirmed", () => {
  it("allows dry runs without the production purge confirmation", () => {
    expect(
      betaPurgeRefusal({
        execute: false,
        confirmedProductionPurge: false,
      }),
    ).toBeNull();
  });

  it("refuses execute without the production purge confirmation", () => {
    expect(
      betaPurgeRefusal({
        execute: true,
        confirmedProductionPurge: false,
      }),
    ).toContain("--confirm-production-purge");
  });

  it("allows execute only after the confirmation flag is present", () => {
    expect(
      betaPurgeRefusal({
        execute: true,
        confirmedProductionPurge: true,
      }),
    ).toBeNull();
  });

  it("prints database targets without credentials or query params", () => {
    expect(
      describeDatabaseTarget(
        "postgres://app_rw:secret@ep-example.us-east-1.aws.neon.tech/kclub?sslmode=require",
      ),
    ).toBe("postgres://ep-example.us-east-1.aws.neon.tech/kclub");
  });
});
