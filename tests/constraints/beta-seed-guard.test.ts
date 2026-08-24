import { describe, expect, it } from "vitest";

import {
  betaSeedRefusal,
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
    ...overrides,
  };
}

describe("constraint: beta seed guard reads the target, not a CLI flag", () => {
  it("allows a clean staging database with no non-beta members", () => {
    expect(betaSeedRefusal(safeTarget())).toBeNull();
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
