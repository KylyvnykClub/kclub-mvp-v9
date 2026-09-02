/**
 * The decision the one-off E.164 backfill makes, separated from the database
 * (ADR 0027), the way `database-environment-guard.ts` is separated from
 * `tools/assert-database-environment.ts`.
 *
 * It is pure because it decides whether to write to production. A collision
 * detector that has never been run against a collision is not a detector.
 */

import { asCountryCode, toE164 } from "./phone";

export interface PhoneRow {
  id: string;
  /** As currently stored — any spelling a form once accepted. */
  phone: string;
  /** `members.country`, the only hint a national number carries. */
  country: string;
}

export interface PlannedRewrite {
  row: PhoneRow;
  next: string;
}

export interface PhoneCollision {
  /** The number two or more members would end up holding. */
  number: string;
  owners: PhoneRow[];
}

export interface PhoneNormalisationPlan {
  /** Already E.164; nothing to do. */
  unchanged: PhoneRow[];
  /** Readable, and stored in some other spelling. */
  planned: PlannedRewrite[];
  /** Not readable as a phone number in any country. Left alone. */
  unreadable: PhoneRow[];
  /**
   * Numbers that more than one member would hold once every rewrite is
   * applied. Non-empty means the whole run is refused: which of two accounts
   * keeps a number decides who owns that member's subscriptions, card and
   * audit history, and that is not a rewrite.
   */
  collisions: PhoneCollision[];
}

export function planPhoneNormalisation(
  rows: readonly PhoneRow[],
): PhoneNormalisationPlan {
  const unchanged: PhoneRow[] = [];
  const planned: PlannedRewrite[] = [];
  const unreadable: PhoneRow[] = [];

  for (const row of rows) {
    const country = asCountryCode(row.country);
    const next = country ? toE164(row.phone, country) : toE164(row.phone);

    if (next === null) {
      unreadable.push(row);
    } else if (next === row.phone) {
      unchanged.push(row);
    } else {
      planned.push({ row, next });
    }
  }

  // What the unique index would see once every rewrite has been applied. A row
  // left untouched still occupies its number, so an untouched row and a
  // rewritten one can collide with each other.
  const owners = new Map<string, PhoneRow[]>();
  const claim = (number: string, row: PhoneRow): void => {
    const held = owners.get(number);
    if (held) held.push(row);
    else owners.set(number, [row]);
  };

  for (const row of [...unchanged, ...unreadable]) claim(row.phone, row);
  for (const { row, next } of planned) claim(next, row);

  const collisions = [...owners.entries()]
    .filter(([, held]) => held.length > 1)
    .map(([number, held]) => ({ number, owners: held }));

  return { unchanged, planned, unreadable, collisions };
}
