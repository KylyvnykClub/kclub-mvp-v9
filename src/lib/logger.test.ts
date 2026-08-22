import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

/**
 * The guard of last resort.
 *
 * Call sites are supposed to pass safeErrorFields(error). This proves that when
 * one does not - which is the state the whole codebase was in until now - the
 * statement and its bound values still do not reach stdout.
 */

const PHONE = "+380000000000";
const PASSWORD_HASH = "$argon2id$v=19$m=19456,p=1,t=2$AAAA$BBBB";
const DRIZZLE_MESSAGE = `Failed query: insert into "members" ("phone", "password_hash") values ($1, $2)\nparams: ${PHONE},${PASSWORD_HASH}`;

describe("security.md §3: the logger refuses a raw query dump", () => {
  let lines: string[] = [];

  beforeEach(() => {
    lines = [];
    // Collecting inside the implementation rather than reading mock.calls
    // afterwards keeps everything here typed - vi.spyOn's return type is
    // generic enough that inspecting .mock.calls degrades to `any`.
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => String(arg)).join(" "));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function loggedOutput(): string {
    return lines.join("\n");
  }

  it("redacts a drizzle message passed straight through by a careless caller", () => {
    logger.error("Failed to create member account", { error: DRIZZLE_MESSAGE });

    const output = loggedOutput();

    expect(output).not.toContain(PHONE);
    expect(output).not.toContain(PASSWORD_HASH);
    expect(output).not.toContain("params:");
    expect(output).toContain("redacted");
    // The event itself still has to be visible - a silent drop would trade a
    // leak for a blind spot.
    expect(output).toContain("Failed to create member account");
  });

  it("leaves ordinary context untouched", () => {
    logger.error("Turnstile siteverify request failed", {
      name: "TypeError",
      message: "fetch failed",
      outcome: "degraded",
    });

    const output = loggedOutput();

    expect(output).toContain("fetch failed");
    expect(output).toContain("degraded");
    expect(output).not.toContain("redacted");
  });
});
