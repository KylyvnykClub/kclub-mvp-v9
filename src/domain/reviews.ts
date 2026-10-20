/**
 * Who may review a partner (ADR 0047, FR-127). One rule for the page that
 * decides whether to show the form and the action that accepts it, so the two
 * cannot disagree.
 */
export type ReviewEligibility =
  "reviewer" | "guest" | "not_in_club" | "own_company" | "not_found";

export function reviewEligibility(params: {
  /** null for a visitor who is not signed in. */
  viewer: { id: string; inClub: boolean } | null;
  company: { ownerId: string; visible: boolean } | null;
}): ReviewEligibility {
  // A partner the catalogue does not show cannot collect reviews either.
  if (!params.company || !params.company.visible) return "not_found";
  if (!params.viewer) return "guest";
  // Checked before club standing: an owner is never a reviewer of their own
  // company, whatever they pay.
  if (params.company.ownerId === params.viewer.id) return "own_company";
  if (!params.viewer.inClub) return "not_in_club";
  return "reviewer";
}
