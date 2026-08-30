import { describe, expect, it } from "vitest";

import { FLAG_NAMES } from "../../src/data/feature-flags";
import { SEED_FLAG_DEFAULTS } from "../../tools/seed-defaults";

describe("constraint: seed defaults (ADR 0026)", () => {
  it("gives every feature flag the application reads a seed default", () => {
    expect(Object.keys(SEED_FLAG_DEFAULTS).sort()).toEqual(
      [...FLAG_NAMES].sort(),
    );
  });

  it("opens the catalogue and leaves maintenance mode off on a fresh branch", () => {
    expect(SEED_FLAG_DEFAULTS.public_catalogue).toBe(true);
    expect(SEED_FLAG_DEFAULTS.maintenance_mode).toBe(false);
  });
});
