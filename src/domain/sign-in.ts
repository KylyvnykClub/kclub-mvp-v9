/**
 * Whether a member may sign in at all, before the password is even checked
 * (FR-005, ADR 0028).
 *
 * Pure, and here rather than inside `IdentityService`, because it is the rule
 * with the most ways to be quietly wrong and the service cannot be tested
 * without a database. The service still does the lookup and the password
 * comparison; this decides what the row it found permits.
 */

export type SignInIdentifierKind = "phone" | "email";

/** Everything this rule needs to know about the row that was found. */
export interface SignInSubject {
  status: string;
  emailVerifiedAt: Date | null;
}

export type SignInRefusal = "invalid_credentials" | "not_active";

/**
 * `null` means nothing here refuses the attempt — the password still has to
 * match.
 *
 * An unverified address is refused as `invalid_credentials`, not as its own
 * reason. Saying "that address is not confirmed yet" would tell an anonymous
 * caller that the address is registered, and single out precisely the accounts
 * whose owner has not finished setting them up (security.md §6).
 */
export function refuseSignIn(
  kind: SignInIdentifierKind,
  member: SignInSubject,
): SignInRefusal | null {
  if (member.status === "blocked" || member.status === "pending_deletion") {
    return "not_active";
  }

  if (kind === "email" && member.emailVerifiedAt === null) {
    return "invalid_credentials";
  }

  return null;
}
