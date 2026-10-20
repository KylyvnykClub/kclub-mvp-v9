/**
 * What the club's join link grants a new account (ADR 0033, 0040, 0048).
 *
 * Pure, because the grant is the part worth proving: a partner link must never
 * waive dues, and only a VIP link may make the first card VIP.
 */
export type JoinLinkGrant = {
  sponsored: boolean;
  cardTier: "free" | "vip";
};

export function joinLinkGrant(
  kind: "member" | "partner" | "vip" | null,
  /** A partner registration owes no dues and holds no member card tier. */
  registeringAs: "member" | "partner",
): JoinLinkGrant {
  if (registeringAs === "partner" || kind === null || kind === "partner") {
    return { sponsored: false, cardTier: "free" };
  }
  return { sponsored: true, cardTier: kind === "vip" ? "vip" : "free" };
}
