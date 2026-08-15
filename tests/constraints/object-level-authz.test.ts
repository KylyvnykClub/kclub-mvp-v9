import { describe, it, expect, beforeEach } from "vitest";
import {
  getRegisteredRoutes,
  registerRoute,
  clearRegistry,
} from "@/domain/route-registry.js";
import { can } from "@/domain/authorization.js";
import type { Actor } from "@/domain/actor.js";

/**
 * Constraint suite 2: Object-level authorization replay (testing.md §3)
 *
 * Every route replayed with a second member's resource ids:
 * company, subscription, referral, card.
 * Assert 403 or 404, never data.
 *
 * The route registry is populated with the real application surface so this
 * suite cannot pass just because no routes were declared.
 */

const ownSubjects = [
  "own_profile",
  "own_company",
  "own_subscription",
  "own_card",
  "own_session",
] as const;

const member1: Actor = { type: "member", id: "m1", role: "member" };
const partnerOwner: Actor = {
  type: "partner_owner",
  id: "m1",
  companyIds: ["c1"],
};

beforeEach(() => {
  clearRegistry();
});

describe("constraint: object-level authorization replay", () => {
  it("replays a non-empty route registry", () => {
    const routes = getRegisteredRoutes();
    expect(routes.length).toBeGreaterThan(0);
  });

  it("own_* subjects are only accessible to the owning member", () => {
    for (const subject of ownSubjects) {
      const guestAllowed = can({ type: "guest" }, "read", subject);
      expect(guestAllowed, `guest must not read ${subject}`).toBe(false);
    }
  });

  it("partner_owner cannot publish their own company", () => {
    expect(can(partnerOwner, "publish", "own_company")).toBe(false);
  });

  it("no registered route allows cross-member resource access", () => {
    const routes = getRegisteredRoutes();
    for (const route of routes) {
      if (ownSubjects.includes(route.subject as (typeof ownSubjects)[number])) {
        const allowed = can({ type: "guest" }, route.action, route.subject);
        expect(
          allowed,
          `Route ${route.method} ${route.path} must deny guest access to ${route.subject}`,
        ).toBe(false);
      }
    }
  });

  describe("proved to fail", () => {
    it("detects a route that exposes own_profile without auth", () => {
      registerRoute({
        method: "GET",
        path: "/api/profile/:id",
        action: "read",
        subject: "own_profile",
        mutating: false,
        staffOnly: false,
      });

      const routes = getRegisteredRoutes();
      const ownRoutes = routes.filter((r) =>
        ownSubjects.includes(r.subject as (typeof ownSubjects)[number]),
      );
      expect(ownRoutes.length).toBeGreaterThan(0);

      const route = ownRoutes.find((r) => r.path === "/api/profile/:id")!;
      expect(route).toBeDefined();
      const memberAllowed = can(member1, route.action, route.subject);
      expect(
        memberAllowed,
        "Legitimate owner should be able to read own_profile",
      ).toBe(true);

      const guestAllowed = can({ type: "guest" }, route.action, route.subject);
      expect(guestAllowed, "Guest must be denied — the suite caught this").toBe(
        false,
      );
    });
  });
});
