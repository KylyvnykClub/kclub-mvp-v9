/**
 * How large the club is, and which of those figures are worth printing.
 *
 * The rule lives here rather than in the band that renders it for two reasons:
 * a unit test can reach it without a React renderer, and the type is shared by
 * a `'use server'` module, which exports async functions and nothing else.
 */
export type ClubPresence = {
  members: number;
  /** Partners with an active listing subscription. */
  partners: number;
  /** Distinct registration countries of those partners. */
  countries: number;
};

export type StatKey = keyof ClubPresence;

/**
 * Below this a figure is left out rather than rounded up or padded.
 *
 * The reference design filled this band with "10 245+ / 1 250+ / 35+", which is
 * not what the club is, and a landing counter was deleted once already for
 * exactly that overstatement. Ten is the point where a count reads as a club
 * rather than as a launch.
 */
export const MIN_STAT_TO_SHOW = 10;

/** The figures large enough to print, in the order the band shows them. */
export function visibleStats(
  presence: ClubPresence,
): { key: StatKey; value: number }[] {
  return (
    [
      { key: "members", value: presence.members },
      { key: "partners", value: presence.partners },
      { key: "countries", value: presence.countries },
    ] as const
  )
    .filter((stat) => stat.value >= MIN_STAT_TO_SHOW)
    .map((stat) => ({ key: stat.key, value: stat.value }));
}
