/**
 * Key and path derivation for company gallery images (ADR 0022).
 * Dependency-free for the same reason as avatar-path.ts: `@/env` throws on
 * import when secrets are missing, and pure functions should not need any.
 */

/** The bytes in R2. The image row's id is the object's identity. */
export function companyImageObjectKey(
  companyId: string,
  imageId: string,
): string {
  return `media/companies/${companyId}/${imageId}.webp`;
}

/** The path a browser requests to render one gallery image. */
export function companyImageServePath(imageId: string): string {
  return `/api/company-image/${imageId}`;
}

/** FR-less product cap, recorded in ADR 0022: a gallery, not an archive. */
export const COMPANY_GALLERY_MAX_IMAGES = 10;

/**
 * The logo is one slot per company, overwritten on upload — the avatar's
 * shape (ADR 0021), not the gallery's (ADR 0023).
 */
export function companyLogoObjectKey(companyId: string): string {
  return `media/companies/${companyId}/logo.webp`;
}

/** Stored in companies.logoUrl so every existing reader renders it unchanged. */
export function companyLogoServePath(companyId: string): string {
  return `/api/company-logo/${companyId}`;
}
