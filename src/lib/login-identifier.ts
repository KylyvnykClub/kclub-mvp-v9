import type { SignInIdentifierKind } from "@/domain/sign-in";

/**
 * What a member typed into the sign-in form, and which column it names
 * (FR-005, ADR 0032).
 *
 * A discriminated union rather than two optional fields, so nothing
 * downstream has to guess which of the two it was handed.
 */
export type LoginIdentifier = { kind: SignInIdentifierKind; value: string };

/**
 * Reads the identifier out of what the form posted.
 *
 * A plain module rather than a helper inside the `"use server"` file, because
 * every export of such a file becomes a callable endpoint — and this is not
 * one.
 *
 * The address wins when both arrive. The form mounts exactly one of the two
 * fields, so a request carrying both did not come from it; picking one and
 * carrying on is better than a special error that tells a prober their
 * malformed request was noticed.
 */
export function readLoginIdentifier(data: {
  phone?: string | undefined;
  email?: string | undefined;
}): LoginIdentifier | null {
  if (data.email) return { kind: "email", value: data.email };
  if (data.phone) return { kind: "phone", value: data.phone };
  return null;
}
