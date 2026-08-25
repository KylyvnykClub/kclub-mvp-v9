/**
 * Turning a thrown value into something safe to log.
 *
 * Drizzle wraps every failed statement in a `DrizzleQueryError` whose `message`
 * is the SQL followed by `params:` and the literal bound values, and whose
 * `params` array holds those values again. Logging `error.message` therefore
 * publishes whatever the statement carried - for a registration, the member's
 * phone number and their password hash. security.md §3 lists both among the
 * values that are never logged, and that rule was previously written only as a
 * comment at the top of logger.ts, where nothing enforced it.
 *
 * The real cause is one level down, in `cause`, as the driver's own error. Its
 * `code` and `constraint` are what a diagnosis actually needs, and neither
 * contains user data.
 */

/**
 * The fields that may be logged: they describe *what* failed without repeating
 * any value the statement carried.
 *
 * `detail` is deliberately absent. For a unique violation the driver puts the
 * offending value in it - "Key (phone)=(+3805...) already exists" - so logging
 * `detail` would reintroduce the leak in tidier form. `message` is absent for
 * database failures for the same reason: it is usually harmless, but for errors
 * like invalid input syntax it quotes the rejected value, and "usually" is not
 * a standard worth logging user data against.
 *
 * Declared as a type alias rather than an interface on purpose: TypeScript gives
 * a fresh implicit index signature to type aliases but not to interfaces, and
 * without one this is not assignable to the logger's LogContext. Making it an
 * interface and widening LogContext instead would let `detail` back in.
 */
export type SafeErrorFields = {
  /** The error's constructor name, e.g. DrizzleQueryError or TypeError. */
  name: string;
  /** Present only when the failure came from the database driver. */
  code?: string;
  constraint?: string;
  table?: string;
  routine?: string;
  /**
   * Only set for errors that never touched a statement. A query error's
   * message is the SQL and its parameters, so it is dropped entirely.
   */
  message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Walks the `cause` chain to the deepest error.
 *
 * Drizzle nests one level today. Following the whole chain costs nothing and
 * means a future wrapper - a retry helper, a pool wrapper - does not silently
 * hide the driver error again.
 */
function rootCause(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();

  while (isRecord(current) && "cause" in current && current["cause"]) {
    if (seen.has(current)) break;
    seen.add(current);
    current = current["cause"];
  }

  return current;
}

/** Whether a value looks like a driver error, i.e. carries a Postgres SQLSTATE. */
function hasDriverCode(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value["code"] === "string";
}

/**
 * Extracts the fields of `error` that may be logged.
 *
 * Never returns the statement, its parameters, or any driver field that quotes
 * a value. Callers should pass the result as the log context rather than
 * reaching into the error themselves.
 */
export function safeErrorFields(error: unknown): SafeErrorFields {
  const name =
    isRecord(error) && typeof error["name"] === "string"
      ? error["name"]
      : typeof error;

  const cause = rootCause(error);

  if (hasDriverCode(cause)) {
    // Written out one by one rather than looped over a list of names. In a file
    // whose whole purpose is "only these fields leave", the allowlist should be
    // readable as code rather than as data - and a loop over computed keys is
    // exactly what the object-injection lint rule exists to question.
    const fields: SafeErrorFields = { name };
    if (typeof cause["code"] === "string") fields.code = cause["code"];
    if (typeof cause["constraint"] === "string")
      fields.constraint = cause["constraint"];
    if (typeof cause["table"] === "string") fields.table = cause["table"];
    if (typeof cause["routine"] === "string") fields.routine = cause["routine"];
    return fields;
  }

  // Not a database failure: the message is the only useful signal and does not
  // come from a statement. A fetch failure or a programming error lands here.
  const message =
    isRecord(error) && typeof error["message"] === "string"
      ? error["message"]
      : String(error);

  return { name, message };
}

/**
 * Whether `error` is a unique-constraint violation on `constraint`.
 *
 * The check has to look at the cause, not at the thrown object: drizzle's
 * wrapper carries neither `code` nor `constraint`, so a test against the outer
 * error is always false. That is not hypothetical - registration used to test
 * the wrapper, so a duplicate phone number was reported to the person trying to
 * register as "Failed to create account. Please try again." instead of as the
 * one thing they could act on, and it logged a full statement dump on the way.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = rootCause(error);

  return (
    hasDriverCode(cause) &&
    cause["code"] === "23505" &&
    cause["constraint"] === constraint
  );
}
