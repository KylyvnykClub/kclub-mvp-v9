/**
 * Every way a registration can be refused, as a code rather than a sentence.
 *
 * The same reasoning as `SignInErrorCode` in `./sign-in.ts`: the screen is in
 * three languages (FR-090) and neither the action nor the service is in any of
 * them, so a sentence chosen on the server reaches every applicant in English.
 *
 * `email_taken` is deliberately not the mirror of `phone_taken`. The number is
 * disclosed by name ([ADR 0030]); the address is not, and the string this code
 * renders says only that it cannot be used. What the code buys is the field to
 * put that string next to — knowing which of two identifiers to change is not
 * the same as being told who holds it.
 */
export type RegisterErrorCode =
  | "invalid_input"
  | "consents_required"
  | "consents_stale"
  | "challenge"
  | "challenge_unavailable"
  | "code_invalid"
  | "throttled"
  | "phone_taken"
  | "email_taken"
  | "failed";

/**
 * The field a refusal belongs against, where there is one. `null` means the
 * form as a whole — nothing the applicant typed in a single box is wrong.
 */
export function registerErrorField(
  code: RegisterErrorCode,
): "phone" | "email" | null {
  switch (code) {
    case "phone_taken":
      return "phone";
    case "email_taken":
      return "email";
    default:
      return null;
  }
}

export const REGISTER_FIELDS = [
  "phone",
  "email",
  "displayName",
  "password",
  "country",
] as const;

export type RegisterField = (typeof REGISTER_FIELDS)[number];

/**
 * The field an input refusal is about, from the path of its first issue. Only
 * phone and email used to be named, so a missing country or a short name came
 * back as a bare "check your input" with nothing to say which box - the "I
 * press register and nothing happens" report from a Ukrainian applicant.
 */
export function registerFieldAt(
  path: readonly PropertyKey[] | undefined,
): RegisterField | null {
  const key = path?.[0];
  return REGISTER_FIELDS.find((field) => field === key) ?? null;
}
