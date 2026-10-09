/**
 * Which of the three club cards a member is shown (FR-021): member, VIP member
 * or business partner. A presentation of facts the club already holds, not a
 * tier - `cards.tier` stays `free | vip`, and the public verification page
 * still discloses only that tier (FR-023).
 *
 * A member with a live listing is shown the business-partner card even when
 * they also hold VIP: the owner's call, because the partner card is the one a
 * business owner presents.
 */

export type CardFace = "member" | "vip" | "business";

export function cardFace(input: {
  tier: "free" | "vip";
  /** Owns a company the catalogue shows right now: approved and paid. */
  hasLiveCompany: boolean;
}): CardFace {
  if (input.hasLiveCompany) return "business";
  return input.tier === "vip" ? "vip" : "member";
}
