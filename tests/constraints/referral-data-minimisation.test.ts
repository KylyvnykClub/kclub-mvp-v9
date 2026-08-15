import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FR-071: a referral captures the client's name, a single contact channel, the
 * service needed and an optional note - and nothing else.
 *
 * This walks the schema rather than an instance, because the requirement is
 * about what the system is *able* to store. A column that exists will be filled
 * eventually, and [ADR 0009](../../docs/decisions/0009-referral-data-minimisation.md)
 * rests on the client's footprint being this small: the client is not our user
 * and never agreed to be one.
 */

const SCHEMA = readFileSync(
  join(process.cwd(), "src/data/schema/referrals.ts"),
  "utf8",
);

/** Everything the referrals table is allowed to hold about the client. */
const CLIENT_COLUMNS = [
  "client_name",
  "contact_channel",
  "service_needed",
  "note",
];

/** Columns about the referral itself, not about the client. */
const MECHANICAL_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "sender_id",
  "recipient_company_id",
  "status",
  "consent_attested",
  "consent_timestamp",
  "moderator_id",
  "moderation_reason",
  "expires_at",
];

function declaredColumns(): string[] {
  // Matches a property whose value is a Drizzle column builder, e.g.
  //   clientName: varchar("client_name", { length: 255 })
  // Anchoring on the property name keeps `.default("pending_review")` and the
  // table name itself out of the result.
  return [...SCHEMA.matchAll(/(\w+):\s*\w+\(\s*"([a-z_]+)"/g)].map(
    (match) => match[2]!,
  );
}

describe("constraint: referral data minimisation (FR-071, ADR 0009)", () => {
  it("finds a non-empty schema to walk", () => {
    expect(declaredColumns().length).toBeGreaterThan(5);
  });

  it("stores exactly the four client fields the requirement names", () => {
    const columns = declaredColumns();

    for (const column of CLIENT_COLUMNS) {
      expect(columns).toContain(column);
    }
  });

  it("declares no column beyond the client fields and the referral's own state", () => {
    const allowed = new Set([...CLIENT_COLUMNS, ...MECHANICAL_COLUMNS]);
    const unexpected = declaredColumns().filter(
      (column) => !allowed.has(column),
    );

    expect(
      unexpected,
      `referrals table declares columns FR-071 does not allow: ${unexpected.join(", ")}`,
    ).toHaveLength(0);
  });

  it("holds no second contact channel, so the client gives one and only one", () => {
    const columns = declaredColumns();
    const contactLike = columns.filter((column) =>
      /email|phone|telegram|whatsapp|address|contact/.test(column),
    );

    expect(contactLike).toEqual(["contact_channel"]);
  });

  it("holds nothing that would identify the client beyond a name", () => {
    const columns = declaredColumns();
    const identifying = columns.filter((column) =>
      /surname|last_name|birth|dob|passport|tax|company_name|position|salary/.test(
        column,
      ),
    );

    expect(identifying).toHaveLength(0);
  });

  it("has no column for the recipient's private notes, which FR-076 keeps from the sender", () => {
    const columns = declaredColumns();
    const recipientNotes = columns.filter((column) =>
      /recipient_note|private_note|internal_note/.test(column),
    );

    // The sender reads their own referrals in full, so the guarantee that they
    // never see the recipient's notes holds because no such column exists.
    expect(recipientNotes).toHaveLength(0);
  });

  describe("proved to fail", () => {
    it("detects a column that would widen the client's footprint", () => {
      const allowed = new Set([...CLIENT_COLUMNS, ...MECHANICAL_COLUMNS]);
      const withExtra = [...declaredColumns(), "client_passport_number"];
      const unexpected = withExtra.filter((column) => !allowed.has(column));

      expect(unexpected).toEqual(["client_passport_number"]);
    });
  });
});
