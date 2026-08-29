/**
 * Key and path derivation for media uploaded during company onboarding
 * (ADR 0024). Before the company exists there is no company id to key an
 * object on, so staging is keyed by the applicant: one draft per member
 * (`company_drafts.owner_id` is unique), one staging prefix per member.
 *
 * Dependency-free like the other *-path modules: `@/env` throws on import
 * when secrets are missing, and pure functions should not need any.
 */

export function draftMediaPrefix(memberId: string): string {
  return `media/drafts/${memberId}/`;
}

export function draftLogoObjectKey(memberId: string): string {
  return `${draftMediaPrefix(memberId)}logo.webp`;
}

export function draftImageObjectKey(memberId: string, imageId: string): string {
  return `${draftMediaPrefix(memberId)}${imageId}.webp`;
}

/** The slot the preview route serves: the logo, or one gallery image by id. */
export const DRAFT_LOGO_SLOT = "logo";

export function draftMediaServePath(slot: string): string {
  return `/api/draft-media/${slot}`;
}

/** Draft data carries the staged image ids as one comma-joined string. */
export function parseDraftImageIds(value: string | undefined): string[] {
  return (value ?? "").split(",").filter(Boolean);
}
