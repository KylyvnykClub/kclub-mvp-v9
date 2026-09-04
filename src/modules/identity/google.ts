import { Google } from "arctic";

import { env } from "@/env";
import { absoluteUrl } from "@/lib/seo";

/**
 * Sign in with Google (ADR 0029).
 *
 * The exchange goes through `arctic` rather than being hand-rolled: it is a
 * small, provider-only OAuth 2.0 client by the author of the `@oslojs/*`
 * packages this codebase already depends on, and the part it does — PKCE, the
 * token request, the error shapes — is the part where a subtle mistake is
 * silent rather than loud.
 */

/** What Google is asked for. Nothing beyond identity: no Drive, no contacts. */
export const GOOGLE_SCOPES = ["openid", "email", "profile"];

/**
 * Where Google sends the member back. Registered in the Google console and
 * matched there exactly, so it is derived from one place and overridable for
 * deployments whose public origin is not the one the console knows.
 */
export function googleCallbackUrl(): string {
  return (
    env.server.GOOGLE_REDIRECT_URI ?? absoluteUrl("/api/auth/google/callback")
  );
}

/**
 * The provider, or `null` where this deployment has no Google client.
 *
 * Null rather than a throw: the routes answer 404 and the button is not
 * rendered, which is the correct behaviour for an environment that was never
 * given credentials — a preview branch, a local checkout, CI.
 */
export function googleProvider(): Google | null {
  const id = env.server.GOOGLE_CLIENT_ID;
  const secret = env.server.GOOGLE_CLIENT_SECRET;

  if (!id || !secret) return null;

  return new Google(id, secret, googleCallbackUrl());
}

/** Whether this deployment holds a Google client at all. */
export function googleConfigured(): boolean {
  return Boolean(
    env.server.GOOGLE_CLIENT_ID && env.server.GOOGLE_CLIENT_SECRET,
  );
}

/**
 * Whether to offer the button (ADR 0031).
 *
 * Two switches, and both must be on: the credentials, and the
 * `google_signin_enabled` flag in the console. The flag is what hides the
 * feature without deleting anything — a missing flag row reads as off, so it
 * is hidden by default and turning it on is a click rather than an
 * environment change and a redeploy.
 */
export async function googleEnabled(): Promise<boolean> {
  if (!googleConfigured()) return false;

  const [{ db }, { isEnabled }] = await Promise.all([
    import("@/data/db"),
    import("@/data/feature-flags"),
  ]);

  return isEnabled(db, "google_signin_enabled");
}

export { readGoogleIdentity, type GoogleIdentity } from "./google-claims";
