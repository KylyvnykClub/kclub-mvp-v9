import { describe, expect, it } from "vitest";

import { routeRecovery } from "./recovery";

const proved = {
  status: "active",
  email: "jane@example.com",
  emailVerifiedAt: new Date(),
};

/**
 * Which way a reset goes (FR-006, ADR 0032).
 *
 * The case that matters is the second one: an address claimed at registration
 * and never proved must not receive a reset link. Anyone can type a stranger's
 * address into a registration form; only the emailed link says it is theirs,
 * and a reset sent before that proof would hand the account to whoever typed
 * it.
 */
describe("password reset routing (FR-006, ADR 0032)", () => {
  it("FR-006: a proved address gets the emailed link", () => {
    expect(routeRecovery(proved)).toBe("email");
  });

  it("FR-006: an address nobody has proved goes to staff, not to the mailbox", () => {
    expect(routeRecovery({ ...proved, emailVerifiedAt: null })).toBe("staff");
  });

  it("FR-006: an account holding no address at all goes to staff (ADR 0018)", () => {
    // The nine accounts that predate ADR 0032. They are the reason the queue
    // was kept rather than deleted.
    expect(
      routeRecovery({ ...proved, email: null, emailVerifiedAt: null }),
    ).toBe("staff");
  });

  it("FR-006: an unknown identifier does nothing, and the caller is told the same", () => {
    expect(routeRecovery(null)).toBe("none");
  });

  it("FR-010: a blocked or deleting member is recovered by neither route", () => {
    for (const status of ["blocked", "pending_deletion"]) {
      expect(routeRecovery({ ...proved, status })).toBe("none");
      expect(routeRecovery({ ...proved, status, emailVerifiedAt: null })).toBe(
        "none",
      );
    }
  });
});
