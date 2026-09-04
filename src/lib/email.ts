/**
 * The one place that decides what an email address is (FR-001, ADR 0028).
 *
 * The counterpart to `src/lib/phone.ts`, and it exists for the same reason:
 * `members.email` is unique and is compared with `=`, so every boundary that
 * writes or looks up an address has to agree on its shape first. `Jane@X.COM`
 * and `jane@x.com` are one person to every mail server on earth and would be
 * two rows here.
 *
 * Normalisation is trim + lowercase, and it happens on the server at every
 * trust boundary. The local part of an address is case-sensitive by RFC 5321
 * and case-insensitive at every provider anyone actually uses; following the
 * RFC here would hand two accounts to one mailbox, which is the more expensive
 * of the two mistakes.
 *
 * No normalisation beyond that. Stripping Gmail's dots or `+tags` would make
 * the stored address differ from the one the member typed, and the address is
 * where a recovery link is sent — it has to be the one they read.
 */

import { z } from "zod";

/**
 * Longest address stored, matching `members.email`. RFC 5321 caps a path at
 * 256 octets; 255 is the column and the practical limit every provider
 * enforces well below.
 */
export const MAX_EMAIL_LENGTH = 255;

/**
 * Claiming an address: it must be an address, and what comes out is what gets
 * stored.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(MAX_EMAIL_LENGTH));

/**
 * Looking one up. Normalises without judging, the way `phoneLookupSchema`
 * does: a sign-in with an address that is not an address simply finds no
 * member, and saying so in a different way than "no such member" would tell an
 * anonymous caller which addresses exist (security.md §6).
 */
export const emailLookupSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(MAX_EMAIL_LENGTH);

/**
 * What a screen may show of an address the member has already proved: enough
 * to recognise their own, not enough to read over their shoulder.
 *
 * `jane.doe@example.com` becomes `j••••••e@example.com`; an address too short
 * to hide anything keeps only its first character.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at);

  if (local.length <= 2) return `${local[0]}${"•".repeat(3)}${domain}`;

  return `${local[0]}${"•".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}${domain}`;
}
