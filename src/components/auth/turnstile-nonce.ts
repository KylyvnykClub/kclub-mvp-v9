/**
 * When a form must show a fresh Turnstile challenge (FR-112, ADR 0012).
 *
 * A Turnstile token is single-use and short-lived: Cloudflare answers
 * `timeout-or-duplicate` to the second presentation of the same token. The
 * registration form spends its token on every submit, including the ones the
 * server refuses — a number that is already taken, an address that is, a
 * password the schema would not accept. The form then re-renders with the
 * applicant's answers still in it and the *spent* token still in the hidden
 * input, so the second attempt is rejected for the challenge no matter what
 * was corrected, and stays rejected until the page is reloaded.
 *
 * That is the "registration works every other time" report: the first attempt
 * fails for an honest reason, and every attempt after it fails for a reason
 * that has nothing to do with what the applicant typed.
 *
 * The cure is to reset the widget after each refusal. This is the decision of
 * *whether* to, kept apart from the widget so it can be tested without a
 * browser: the nonce is handed to `TurnstileWidget`, and a change in it means
 * "the token you are holding is spent, get another".
 */

/** What the form learned from the attempt it just made. */
export type ChallengeOutcome = {
  /** The attempt succeeded, so the form is leaving and needs no new token. */
  success: boolean;
} | null;

/**
 * The nonce the next render should carry.
 *
 * `null` is the initial state of `useActionState` and the state a submit that
 * moves to another screen leaves behind; neither is a refusal, so neither
 * spends a nonce. Anything that is not a success is.
 */
export function nextChallengeNonce(
  current: number,
  outcome: ChallengeOutcome,
): number {
  if (outcome === null) return current;
  return outcome.success ? current : current + 1;
}
