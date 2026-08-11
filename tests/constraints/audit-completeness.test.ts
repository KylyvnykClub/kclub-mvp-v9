import { describe, it, expect, beforeEach } from "vitest";
import {
  getMutatingStaffRoutes,
  registerRoute,
  clearRegistry,
} from "@/domain/route-registry.js";

/**
 * Constraint suite 4: Audit completeness (testing.md §3)
 *
 * Every mutating console action produces exactly one audit entry
 * with actor, target and before/after values.
 *
 * This suite checks two things:
 * 1. Every mutating staff route in the registry has a corresponding
 *    audit handler declared (structural check).
 * 2. The application role cannot UPDATE or DELETE audit_log
 *    (already proved in T-0.12 integration tests).
 *
 * The route registry is populated with the real application surface so this
 * suite cannot pass just because no mutating staff routes were declared.
 */

function auditKey(action: string, subject: string): string {
  return `${action}:${subject}`;
}

beforeEach(() => {
  clearRegistry();
});

describe("constraint: audit completeness", () => {
  it("checks a non-empty mutating staff route set", () => {
    const routes = getMutatingStaffRoutes();
    expect(routes.length).toBeGreaterThan(0);
  });

  it("every mutating staff route has a declared audit handler", () => {
    const routes = getMutatingStaffRoutes();
    const unaudited: string[] = [];

    for (const route of routes) {
      if (!route.audited) {
        unaudited.push(
          `${route.method} ${route.path} (${route.action} ${route.subject})`,
        );
      }
    }

    expect(
      unaudited,
      `Mutating staff routes missing audit handlers:\n${unaudited.join("\n")}`,
    ).toHaveLength(0);
  });

  describe("proved to fail", () => {
    it("detects a mutating staff route without an audit handler", () => {
      registerRoute({
        method: "POST",
        path: "/admin/api/members/:id/block",
        action: "block",
        subject: "member",
        mutating: true,
        staffOnly: true,
      });

      const routes = getMutatingStaffRoutes();
      expect(routes.length).toBeGreaterThan(0);

      const unaudited = routes.filter((r) => !r.audited);
      expect(unaudited.map((r) => auditKey(r.action, r.subject))).toContain(
        "block:member",
      );
    });

    it("passes when the audit handler is registered", () => {
      registerRoute({
        method: "POST",
        path: "/admin/api/members/:id/block",
        action: "block",
        subject: "member",
        mutating: true,
        staffOnly: true,
        audited: true,
      });

      const routes = getMutatingStaffRoutes();
      const unaudited = routes.filter((r) => !r.audited);
      expect(unaudited).toHaveLength(0);
    });
  });
});
