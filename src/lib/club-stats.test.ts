import { describe, expect, it } from "vitest";

import { landingStats, type ClubPresence } from "@/lib/club-stats";

const presence = (over: Partial<ClubPresence> = {}): ClubPresence => ({
  members: 0,
  partners: 0,
  countries: 0,
  ...over,
});

describe("landingStats", () => {
  it("prints every figure the club actually has", () => {
    expect(
      landingStats(presence({ members: 120, partners: 40, countries: 12 })),
    ).toEqual([
      { key: "members", value: 120 },
      { key: "partners", value: 40 },
      { key: "countries", value: 12 },
    ]);
  });

  it("prints a small figure as it is rather than padding it", () => {
    // The reference markup shipped "15+ / 9 / 4" as placeholders, and an
    // earlier one asked for "1 250+ партнёров". Nine partners is nine.
    expect(
      landingStats(presence({ members: 15, partners: 9, countries: 4 })),
    ).toEqual([
      { key: "members", value: 15 },
      { key: "partners", value: 9 },
      { key: "countries", value: 4 },
    ]);
  });

  it("leaves out a figure that is zero", () => {
    expect(
      landingStats(presence({ members: 15, partners: 0, countries: 0 })),
    ).toEqual([{ key: "members", value: 15 }]);
  });

  it("returns nothing for an empty club, so the band renders nothing", () => {
    expect(landingStats(presence())).toEqual([]);
  });

  it("keeps the band's reading order regardless of which figures survive", () => {
    const stats = landingStats(
      presence({ members: 11, partners: 0, countries: 99 }),
    );

    expect(stats.map((stat) => stat.key)).toEqual(["members", "countries"]);
  });
});
