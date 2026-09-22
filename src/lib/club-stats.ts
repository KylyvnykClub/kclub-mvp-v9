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
 * The three figures the landing hero prints, and which of them are printable.
 *
 * An earlier reference design asked this band to say "10 245+ / 1 250+ / 35+"
 * for a club that had none of that, and the answer then was a floor: a figure
 * under ten was left out rather than padded. The delivered design asks for
 * something different - three plain counts inside the hero rather than a claim
 * of scale beside it - so this prints the count it is given, whatever its size,
 * because a real number is not an overstatement. What it still refuses is zero:
 * "0 partner businesses" advertises the absence of the product.
 */
export function landingStats(
  presence: ClubPresence,
): { key: StatKey; value: number }[] {
  return (
    [
      { key: "members", value: presence.members },
      { key: "partners", value: presence.partners },
      { key: "countries", value: presence.countries },
    ] as const
  )
    .filter((stat) => stat.value > 0)
    .map((stat) => ({ key: stat.key, value: stat.value }));
}
