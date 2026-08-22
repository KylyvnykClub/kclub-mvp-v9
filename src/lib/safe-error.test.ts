import { describe, expect, it } from "vitest";
import { isUniqueViolation, safeErrorFields } from "./safe-error";

/**
 * The values that must never reach a log line. Shaped like the real ones from
 * the incident that prompted this module, but not real: a Ukrainian test number
 * from the reserved +380 00 range and an argon2 string over a throwaway salt.
 */
const PHONE = "+380000000000";
const PASSWORD_HASH =
  "$argon2id$v=19$m=19456,p=1,t=2$AAAAAAAAAAAAAAAAAAAAAA$BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

/**
 * A stand-in for drizzle's DrizzleQueryError: the SQL and the bound values in
 * `message`, the values again in `params`, and the driver's error as `cause`.
 */
function drizzleQueryError(cause: unknown): Error & {
  query: string;
  params: unknown[];
} {
  const error = new Error(
    `Failed query: insert into "members" ("phone", "password_hash") values ($1, $2)\nparams: ${PHONE},${PASSWORD_HASH}`,
  ) as Error & { query: string; params: unknown[] };
  error.name = "DrizzleQueryError";
  error.query = 'insert into "members" ...';
  error.params = [PHONE, PASSWORD_HASH];
  error.cause = cause;
  return error;
}

/** A stand-in for the node-postgres error drizzle wraps. */
function pgError(fields: Record<string, string>): Record<string, unknown> {
  return {
    name: "error",
    message:
      'duplicate key value violates unique constraint "members_phone_unique"',
    detail: `Key (phone)=(${PHONE}) already exists.`,
    severity: "ERROR",
    ...fields,
  };
}

describe("security.md §3: a query failure never carries user data into a log", () => {
  it("drops the statement, the parameters and the driver detail", () => {
    const error = drizzleQueryError(
      pgError({
        code: "23505",
        constraint: "members_phone_unique",
        table: "members",
      }),
    );

    const fields = safeErrorFields(error);
    const serialised = JSON.stringify(fields);

    // The three ways the values reached the log before this module existed.
    expect(serialised).not.toContain(PHONE);
    expect(serialised).not.toContain(PASSWORD_HASH);
    expect(serialised).not.toContain("params:");
    expect(serialised).not.toContain("Failed query:");
    // detail quotes the offending value, which is why it is not in the allowlist
    expect(serialised).not.toContain("already exists");
    expect(fields.message).toBeUndefined();
  });

  it("keeps what a diagnosis actually needs", () => {
    const error = drizzleQueryError(
      pgError({
        code: "23505",
        constraint: "members_phone_unique",
        table: "members",
      }),
    );

    expect(safeErrorFields(error)).toEqual({
      name: "DrizzleQueryError",
      code: "23505",
      constraint: "members_phone_unique",
      table: "members",
    });
  });

  it("reaches the driver error through more than one wrapper", () => {
    const wrapped = new Error("retry helper gave up");
    wrapped.cause = drizzleQueryError(pgError({ code: "40001" }));

    expect(safeErrorFields(wrapped).code).toBe("40001");
  });

  it("keeps the message for failures that never touched a statement", () => {
    // A fetch to Turnstile or Twilio. Nothing here came from a statement, so
    // the message is the only useful signal and is safe to keep.
    const fields = safeErrorFields(new TypeError("fetch failed"));

    expect(fields).toEqual({ name: "TypeError", message: "fetch failed" });
  });

  it("survives a thrown non-error", () => {
    expect(safeErrorFields("boom")).toEqual({
      name: "string",
      message: "boom",
    });
    expect(safeErrorFields(null)).toEqual({ name: "object", message: "null" });
  });
});

describe("registration: a duplicate phone is recognised through the wrapper", () => {
  it("matches a unique violation reported by the driver under the wrapper", () => {
    const error = drizzleQueryError(
      pgError({ code: "23505", constraint: "members_phone_unique" }),
    );

    // The regression this guards: the old check read code and constraint off
    // the thrown object, where drizzle puts neither, so it was always false and
    // a taken phone number was reported as a server error.
    expect(isUniqueViolation(error, "members_phone_unique")).toBe(true);
  });

  it("does not match a different constraint or a different code", () => {
    expect(
      isUniqueViolation(
        drizzleQueryError(
          pgError({ code: "23505", constraint: "cards_serial_unique" }),
        ),
        "members_phone_unique",
      ),
    ).toBe(false);

    expect(
      isUniqueViolation(
        drizzleQueryError(
          pgError({ code: "23503", constraint: "members_phone_unique" }),
        ),
        "members_phone_unique",
      ),
    ).toBe(false);
  });

  it("does not match an unrelated failure", () => {
    expect(
      isUniqueViolation(new TypeError("fetch failed"), "members_phone_unique"),
    ).toBe(false);
    expect(isUniqueViolation(undefined, "members_phone_unique")).toBe(false);
  });
});
