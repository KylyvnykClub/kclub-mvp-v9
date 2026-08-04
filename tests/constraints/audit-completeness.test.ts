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
 * Currently passes trivially because no mutating staff routes are
 * registered. Each suite must be proved to fail (phase-0.md §3).
 */

/**
 * Tracks which actions have audit handlers wired.
 * Modules call registerAuditedAction() when they set up their use cases.
 */
const auditedActions = new Set<string>();

export function registerAuditedAction(action: string, subject: string): void {
  auditedActions.add(`${action}:${subject}`);
}

export function clearAuditedActions(): void {
  auditedActions.clear();
}

function auditKey(action: string, subject: string): string {
  return `${action}:${subject}`;
}

beforeEach(() => {
  clearRegistry();
  clearAuditedActions();
});

describe("constraint: audit completeness", () => {
  it("passes trivially with no mutating staff routes", () => {
    const routes = getMutatingStaffRoutes();
    expect(routes).toHaveLength(0);
  });

  it("every mutating staff route has a declared audit handler", () => {
    const routes = getMutatingStaffRoutes();
    const unaudited: string[] = [];

    for (const route of routes) {
      const key = auditKey(route.action, route.subject);
      if (!auditedActions.has(key)) {
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
      expect(routes).toHaveLength(1);

      const key = auditKey("block", "member");
      expect(auditedActions.has(key)).toBe(false);
    });

    it("passes when the audit handler is registered", () => {
      registerRoute({
        method: "POST",
        path: "/admin/api/members/:id/block",
        action: "block",
        subject: "member",
        mutating: true,
        staffOnly: true,
      });

      registerAuditedAction("block", "member");

      const routes = getMutatingStaffRoutes();
      const unaudited = routes.filter(
        (r) => !auditedActions.has(auditKey(r.action, r.subject)),
      );
      expect(unaudited).toHaveLength(0);
    });
  });
});
