/**
 * The card serial printed on a membership card (FR-020): the country the
 * member's phone number belongs to, then a number from one club-wide sequence
 * that starts at 10001 — `UA-10001`, `US-10002`, `UA-10003`.
 *
 * The country is the phone's, not the residence the member chose: it is the
 * country picked in the phone field at registration, and the stored E.164
 * number is the only record of it. Residence is the fallback for a number the
 * metadata cannot place, so a serial never carries a made-up prefix.
 *
 * The number comes from the database sequence `card_serial_seq`, so two
 * registrations in the same instant cannot draw the same one; the unique index
 * on `cards.serial` is the backstop, not the mechanism.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js/mobile";

/** The first number the sequence hands out (`card_serial_seq START 10001`). */
export const FIRST_CARD_SERIAL_NUMBER = 10001;

const SERIAL_PATTERN = /^[A-Z]{2}-\d{5,}$/;

/** ISO 3166-1 alpha-2 of the phone number, else of the residence country. */
export function cardSerialCountry(phone: string, residence: string): string {
  const fromPhone = parsePhoneNumberFromString(phone.trim())?.country;
  return (fromPhone ?? residence).trim().toUpperCase();
}

export function formatCardSerial(country: string, number: number): string {
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new Error(`Card serial country must be two letters: ${country}`);
  }
  if (!Number.isSafeInteger(number) || number < FIRST_CARD_SERIAL_NUMBER) {
    throw new Error(`Card serial number out of range: ${number}`);
  }
  return `${country}-${number}`;
}

/** Whether `serial` is already in the `UA-10001` form. */
export function isCardSerial(serial: string): boolean {
  return SERIAL_PATTERN.test(serial);
}

export interface CardSerialRow {
  cardId: string;
  serial: string;
  issuedAt: Date;
  phone: string;
  residence: string;
}

/**
 * The cards still carrying a serial from before this format, oldest first, so
 * the earliest members get the lowest numbers. Cards already renumbered are
 * left alone, which makes running the backfill twice a no-op.
 */
export function planCardSerialBackfill(
  rows: readonly CardSerialRow[],
): Array<{ cardId: string; from: string; country: string }> {
  return rows
    .filter((row) => !isCardSerial(row.serial))
    .sort(
      (a, b) =>
        a.issuedAt.getTime() - b.issuedAt.getTime() ||
        a.cardId.localeCompare(b.cardId),
    )
    .map((row) => ({
      cardId: row.cardId,
      from: row.serial,
      country: cardSerialCountry(row.phone, row.residence),
    }));
}
