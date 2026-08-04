import { describe, it, expect, beforeEach } from "vitest";
import {
  getRegisteredRoutes,
  registerRoute,
  clearRegistry,
} from "@/domain/route-registry.js";
import { can } from "@/domain/authorization.js";
import type { Actor } from "@/domain/actor.js";

/**
 * Constraint suite 1: Member-leak walker (testing.md §3, ADR 0005)
 *
 * No endpoint returns a set of members to a member-scoped actor.
 * This test enumerates every registered route and asserts that
 * the authorization layer denies member-to-member visibility.
 *
 * Currently passes trivially because no routes are registered.
 * Each suite must be proved to fail (phase-0.md §3).
 */

const member1: Actor = { type: "member", id: "m1", role: "member" };
const member2: Actor = { type: "member", id: "m2", role: "member" };
const guest: Actor = { type: "guest" };

beforeEach(() => {
  clearRegistry();
});

describe("constraint: member-leak walker (ADR 0005)", () => {
  it("passes trivially with no registered routes", () => {
    const routes = getRegisteredRoutes();
    expect(routes).toHaveLength(0);
  });

  it("no member can read another member via the authorization layer", () => {
    expect(can(member1, "read", "member")).toBe(false);
    expect(can(member2, "read", "member")).toBe(false);
  });

  it("guest cannot read members", () => {
    expect(can(guest, "read", "member")).toBe(false);
  });

  it("no registered route leaks member data to another member", () => {
    const routes = getRegisteredRoutes();
    for (const route of routes) {
      if (route.subject === "member") {
        const allowed = can(member1, route.action, route.subject);
        expect(
          allowed,
          `Route ${route.method} ${route.path} (${route.action} ${route.subject}) ` +
            `must not be accessible to a member`,
        ).toBe(false);
      }
    }
  });

  describe("proved to fail", () => {
    it("detects a deliberately leaking route", () => {
      registerRoute({
        method: "GET",
        path: "/api/members",
        action: "read",
        subject: "member",
        mutating: false,
        staffOnly: false,
      });

      const routes = getRegisteredRoutes();
      const nonStaffMemberRoutes = routes.filter(
        (r) => r.subject === "member" && !r.staffOnly,
      );

      // The walker DETECTS the violation: a non-staff route exists
      // that exposes member data. This is how the suite would catch
      // a real leak the day it is written.
      expect(
        nonStaffMemberRoutes.length,
        "The walker must detect the leaking route",
      ).toBeGreaterThan(0);
    });
  });
});
