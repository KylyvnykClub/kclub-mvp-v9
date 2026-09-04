/**
 * What `pnpm db:seed` inserts when a row is missing. Pure data, so a test can
 * prove the seed knows every flag the application reads.
 */

import type { FlagName } from "../src/data/feature-flags";

/**
 * Feature-flag defaults for a database that lacks the row. The migration
 * `20260804105932_platform_outbox_flags` inserts the first five; the seed
 * inserts whichever are missing and never touches an existing row — the staff
 * console owns those.
 *
 * `public_catalogue` was added to the application after that migration and
 * is seeded by nothing else; a fresh branch without it shows an empty
 * catalogue to a signed-out visitor.
 */
export const SEED_FLAG_DEFAULTS: Readonly<Record<FlagName, boolean>> = {
  signup_enabled: true,
  sms_enabled: true,
  referrals_enabled: true,
  checkout_enabled: true,
  maintenance_mode: false,
  public_catalogue: true,
  // Hidden until somebody turns it on in the console (ADR 0031).
  google_signin_enabled: false,
};
