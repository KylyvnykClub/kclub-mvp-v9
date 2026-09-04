import { decodeIdToken } from "arctic";

/**
 * Reading the identity out of a Google `id_token` (ADR 0029).
 *
 * Split from `google.ts` because that module constructs the provider from
 * `env`, and importing `env` validates the entire environment. This half is
 * pure — claims in, identity out — and a pure function should be testable
 * without a populated `.env.local`.
 */

/** The claims this product reads. Everything else Google sends is ignored. */
export interface GoogleIdentity {
  /** Google's stable subject id. This, not the address, is what we match on. */
  subject: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
}

/**
 * Reads the identity out of an `id_token` that came back from the token
 * endpoint.
 *
 * The signature is not checked here, and does not need to be: the token was
 * fetched by us, directly from Google, over TLS, in exchange for a code and a
 * PKCE verifier. OpenID Connect Core §3.1.3.7 says as much. A token that
 * arrived any other way must never be passed to this function.
 */
export function readGoogleIdentity(idToken: string): GoogleIdentity | null {
  const claims = decodeIdToken(idToken) as Record<string, unknown>;

  const subject = typeof claims["sub"] === "string" ? claims["sub"] : null;
  const email = typeof claims["email"] === "string" ? claims["email"] : null;

  if (!subject || !email) return null;

  return {
    subject,
    email: email.trim().toLowerCase(),
    // Google sends this as a boolean, and older payloads as a string. Anything
    // that is not an unambiguous yes is treated as a no.
    emailVerified:
      claims["email_verified"] === true || claims["email_verified"] === "true",
    displayName: typeof claims["name"] === "string" ? claims["name"] : null,
  };
}
