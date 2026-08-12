import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { clientSchema, serverSchema } from "@/env.schema.js";

function schemaKeys(schema: typeof serverSchema | typeof clientSchema) {
  return Object.keys(schema.shape);
}

describe("constraint: production environment readiness checklist", () => {
  it("names every environment variable validated at runtime", () => {
    const doc = readFileSync(
      "docs/delivery/production-env-readiness.md",
      "utf8",
    );
    const keys = new Set([
      ...schemaKeys(serverSchema),
      ...schemaKeys(clientSchema),
    ]);

    for (const key of keys) {
      expect(doc, `Missing ${key} in production readiness checklist`).toContain(
        `\`${key}\``,
      );
    }
  });
});
