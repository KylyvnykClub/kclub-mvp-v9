/**
 * The path every member's browser requests for their own avatar
 * (src/app/api/avatar/route.ts). A standalone module with no other imports
 * so it can be pulled into client components without dragging in the R2
 * client or `@/env` behind it.
 */
export const AVATAR_SERVE_PATH = "/api/avatar";

/**
 * One slot per member, overwritten on every upload. There is deliberately no
 * versioning and no orphan-object sweep: the key is the member id, so a new
 * upload's PUT is also the old object's deletion, and account deletion is
 * exactly one DELETE against this same key.
 *
 * Kept dependency-free like `AVATAR_SERVE_PATH` above, for the same reason
 * `@/env` throws immediately on import if secrets are missing, and a plain
 * unit test for this pure function should not need any.
 */
export function avatarObjectKey(memberId: string): string {
  return `media/avatars/${memberId}.webp`;
}
