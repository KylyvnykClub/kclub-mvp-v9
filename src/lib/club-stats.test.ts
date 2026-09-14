import { describe, expect, it } from "vitest";

import {
  MIN_STAT_TO_SHOW,
  visibleStats,
  type ClubPresence,
} from "@/lib/club-stats";

const presence = (over: Partial<ClubPresence> = {}): ClubPresence => ({
  members: 0,
  partners: 0,
  countries: 0,
  ...over,
});

describe("visibleStats", () => {
  it("prints every figure once they are all large enough", () => {
    expect(
      visibleStats(presence({ members: 120, partners: 40, countries: 12 })),
    ).toEqual([
      { key: "members", value: 120 },
      { key: "partners", value: 40 },
      { key: "countries", value: 12 },
    ]);
  });

  it("leaves out a figure below the threshold instead of rounding it up", () => {
    // The whole point of the band's rule: the reference asked for "1 250+
    // партнёров", and a club with three partners must not answer that with a
    // padded number.
    const stats = visibleStats(
      presence({ members: 120, partners: 3, countries: 2 }),
    );

    expect(stats).toEqual([{ key: "members", value: 120 }]);
  });

  it("shows a figure exactly at the threshold", () => {
    const stats = visibleStats(presence({ members: MIN_STAT_TO_SHOW }));

    expect(stats).toEqual([{ key: "members", value: MIN_STAT_TO_SHOW }]);
  });

  it("hides a figure one short of the threshold", () => {
    expect(visibleStats(presence({ members: MIN_STAT_TO_SHOW - 1 }))).toEqual(
      [],
    );
  });

  it("returns nothing for an empty club, so the band can render nothing", () => {
    expect(visibleStats(presence())).toEqual([]);
  });

  it("keeps the band's reading order regardless of which figures survive", () => {
    const stats = visibleStats(
      presence({ members: 11, partners: 0, countries: 99 }),
    );

    expect(stats.map((s) => s.key)).toEqual(["members", "countries"]);
  });
});
