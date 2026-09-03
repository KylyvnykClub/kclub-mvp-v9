import { describe, expect, it } from "vitest";

import type { DatabaseMarker } from "@/data/database-environment";
import {
  describeMarker,
  devToolVerdict,
  readAllowProductionDb,
  resetVerdict,
  serverStartVerdict,
  type GuardInput,
  type Verdict,
} from "./database-environment-guard";

const production: DatabaseMarker = {
  kind: "marked",
  name: "production",
  markedAt: new Date("2026-08-29T12:00:00Z"),
  markedBy: "owner@laptop",
};
const dev: DatabaseMarker = { ...production, name: "dev" };
const unmarked: DatabaseMarker = { kind: "unmarked" };
const noTable: DatabaseMarker = { kind: "no_table" };

function local(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    marker: dev,
    nodeEnv: "development",
    vercelEnv: undefined,
    allowProductionDb: false,
    ...overrides,
  };
}

function reasonOf(verdict: Verdict): string {
  if (verdict.outcome === "allow") {
    throw new Error("expected a warn or refuse verdict with a reason");
  }
  return verdict.reason;
}

const POOLED =
  "postgresql://app:secret@ep-frosty-1234-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT =
  "postgresql://app:secret@ep-frosty-1234.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("database environment guard (ADR 0026)", () => {
  describe("server start", () => {
    it("refuses next dev against a database marked production", () => {
      const verdict = serverStartVerdict(local({ marker: production }));
      expect(verdict.outcome).toBe("refuse");
      expect(reasonOf(verdict)).toContain("production-marked");
    });

    it("allows dev, test and preview markers locally", () => {
      for (const name of ["dev", "test", "preview"] as const) {
        expect(
          serverStartVerdict(local({ marker: { ...dev, name } })).outcome,
        ).toBe("allow");
      }
    });

    it("warns but allows an unmarked or pre-migration database locally", () => {
      expect(serverStartVerdict(local({ marker: unmarked })).outcome).toBe(
        "warn",
      );
      expect(serverStartVerdict(local({ marker: noTable })).outcome).toBe(
        "warn",
      );
    });

    it("allows a production marker locally only with KCLUB_ALLOW_PRODUCTION_DB=1, as a warning", () => {
      const verdict = serverStartVerdict(
        local({ marker: production, allowProductionDb: true }),
      );
      expect(verdict.outcome).toBe("warn");
      expect(reasonOf(verdict)).toContain("KCLUB_ALLOW_PRODUCTION_DB");
    });

    it("does not refuse a Vercel preview deployment on the production database (backlog: preview-deployments-use-production-database)", () => {
      const verdict = serverStartVerdict(
        local({ marker: production, vercelEnv: "preview" }),
      );
      expect(verdict.outcome).toBe("warn");
      expect(
        serverStartVerdict(local({ marker: dev, vercelEnv: "preview" }))
          .outcome,
      ).toBe("allow");
    });

    it("reports, without refusing, a production deployment that is not on the production marker", () => {
      for (const marker of [dev, unmarked, noTable]) {
        const verdict = serverStartVerdict(
          local({ marker, vercelEnv: "production", nodeEnv: "production" }),
        );
        expect(verdict.outcome).toBe("warn");
      }
      expect(
        serverStartVerdict(
          local({
            marker: production,
            vercelEnv: "production",
            nodeEnv: "production",
          }),
        ).outcome,
      ).toBe("allow");
    });
  });

  describe("dev tools", () => {
    const tool = (
      overrides: Partial<GuardInput> = {},
      productionFlag = false,
    ) => devToolVerdict({ ...local(overrides), tool: "seed", productionFlag });

    it("refuses a production marker unless --production and the escape hatch are both present", () => {
      expect(tool({ marker: production }).outcome).toBe("refuse");
      expect(tool({ marker: production }, true).outcome).toBe("refuse");
      expect(
        tool({ marker: production, allowProductionDb: true }).outcome,
      ).toBe("refuse");
      expect(
        tool({ marker: production, allowProductionDb: true }, true).outcome,
      ).toBe("warn");
    });

    it("refuses a production environment whose database is not marked production", () => {
      expect(tool({ marker: dev, nodeEnv: "production" }).outcome).toBe(
        "refuse",
      );
      expect(tool({ marker: unmarked, vercelEnv: "production" }).outcome).toBe(
        "refuse",
      );
    });

    it("allows a dev marker and warns on an unmarked database", () => {
      expect(tool().outcome).toBe("allow");
      expect(tool({ marker: unmarked }).outcome).toBe("warn");
      expect(tool({ marker: noTable }).outcome).toBe("warn");
    });

    /**
     * --production says "I believe this is production". It does not select a
     * database; DATABASE_URL does. Asking for production while pointed at the
     * dev branch used to run as an ordinary dev invocation and report success,
     * so `pnpm db:normalize-phones --production` twice in a row looked like two
     * production backfills and was neither.
     */
    it("refuses --production against a database that is not marked production", () => {
      expect(tool({ marker: dev }, true).outcome).toBe("refuse");
      expect(tool({ marker: unmarked }, true).outcome).toBe("refuse");
      expect(tool({ marker: noTable }, true).outcome).toBe("refuse");
    });

    it("names the database it actually found, so the mistake is visible", () => {
      const verdict = tool({ marker: dev }, true);
      expect(verdict.outcome).toBe("refuse");
      if (verdict.outcome === "refuse") {
        expect(verdict.reason).toContain("--production");
        expect(verdict.reason).toContain("DATABASE_URL");
        expect(verdict.reason).toContain(describeMarker(dev));
      }
    });

    it("still allows the same tools without the flag", () => {
      expect(tool({ marker: dev }).outcome).toBe("allow");
    });
  });

  describe("reset", () => {
    const reset = (
      marker: DatabaseMarker,
      overrides: Partial<{
        nodeEnv: string;
        vercelEnv: string;
        pooledUrl: string;
        directUrl: string;
        confirmedEndpoint: string;
      }> = {},
    ) =>
      resetVerdict({
        marker,
        nodeEnv: "development",
        vercelEnv: undefined,
        pooledUrl: POOLED,
        directUrl: DIRECT,
        ...overrides,
      });

    it("never accepts a production marker, escape hatch or not", () => {
      expect(reset(production).outcome).toBe("refuse");
    });

    it("refuses to run in a production environment at all", () => {
      expect(reset(dev, { nodeEnv: "production" }).outcome).toBe("refuse");
      expect(reset(dev, { vercelEnv: "production" }).outcome).toBe("refuse");
    });

    it("accepts the pooled and direct URLs of one branch, one role, one database", () => {
      expect(reset(dev).outcome).toBe("allow");
      expect(
        reset(unmarked, { confirmedEndpoint: "ep-frosty-1234" }).outcome,
      ).toBe("allow");
      expect(
        reset(noTable, { confirmedEndpoint: "ep-frosty-1234" }).outcome,
      ).toBe("allow");
    });

    it("makes the operator type the endpoint id until the branch is marked dev", () => {
      const verdict = reset(unmarked);
      expect(verdict.outcome).toBe("refuse");
      expect(reasonOf(verdict)).toContain("--confirm-endpoint ep-frosty-1234");
      expect(
        reset(noTable, { confirmedEndpoint: "ep-other-9999" }).outcome,
      ).toBe("refuse");
      expect(reset(dev, { confirmedEndpoint: undefined }).outcome).toBe(
        "allow",
      );
    });

    it("refuses pooled and direct URLs that name different branches or roles", () => {
      expect(
        reset(dev, {
          directUrl: DIRECT.replace("ep-frosty-1234", "ep-other-9999"),
        }).outcome,
      ).toBe("refuse");
      expect(
        reset(dev, { directUrl: DIRECT.replace("app:", "owner:") }).outcome,
      ).toBe("refuse");
      expect(
        reset(dev, { directUrl: DIRECT.replace("/neondb", "/other") }).outcome,
      ).toBe("refuse");
      expect(reset(dev, { pooledUrl: "not a url" }).outcome).toBe("refuse");
    });
  });

  it("readAllowProductionDb accepts only the literal 1", () => {
    expect(readAllowProductionDb({ KCLUB_ALLOW_PRODUCTION_DB: "1" })).toBe(
      true,
    );
    expect(readAllowProductionDb({ KCLUB_ALLOW_PRODUCTION_DB: "true" })).toBe(
      false,
    );
    expect(readAllowProductionDb({ KCLUB_ALLOW_PRODUCTION_DB: "" })).toBe(
      false,
    );
    expect(readAllowProductionDb({})).toBe(false);
  });

  it("describes every marker shape in one line", () => {
    expect(describeMarker(production)).toContain("production");
    expect(describeMarker(production)).toContain("owner@laptop");
    expect(describeMarker(unmarked)).toContain("no row");
    expect(describeMarker(noTable)).toContain("not applied");
  });
});
