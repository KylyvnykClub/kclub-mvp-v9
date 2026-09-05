/**
 * Which way a password reset goes (FR-006, ADR 0032).
 *
 * There are two routes and one entry point. A member holding an address they
 * have proved gets a single-use link and staff hear nothing about it; anyone
 * else gets a row on the staff console, which is the path ADR 0018 describes
 * and ADR 0031 built. The caller is told the same thing either way, so this
 * decision must never reach the screen — only the mail queue and the console.
 *
 * A pure function because the choice is the part worth proving: an address
 * that was claimed but never proved must route to staff, not to mail. Getting
 * that backwards would send a password-reset link to an address somebody typed
 * at registration without owning it.
 */

export type RecoverySubject = {
  status: string;
  email: string | null;
  emailVerifiedAt: Date | null;
};

export type RecoveryRoute =
  /** Send a single-use link to the address on the account. */
  | "email"
  /** Record a request for a staff owner to deal with. */
  | "staff"
  /** Do nothing at all, and say the same sentence anyway. */
  | "none";

export function routeRecovery(member: RecoverySubject | null): RecoveryRoute {
  // No such member. The caller still gets the ordinary answer; saying anything
  // else here would make this form a membership oracle (security.md §6).
  if (!member) return "none";

  // Blocked and deleting accounts are not recoverable by their holder, and a
  // request for one is noise on a staff screen rather than work.
  if (member.status !== "active") return "none";

  // An unproved address is a claim, not a channel.
  if (!member.email || !member.emailVerifiedAt) return "staff";

  return "email";
}
