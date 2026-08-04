import type { Action, Subject } from "./authorization.js";

export interface RouteEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  action: Action;
  subject: Subject;
  mutating: boolean;
  staffOnly: boolean;
}

const routes: RouteEntry[] = [];

export function registerRoute(entry: RouteEntry): void {
  routes.push(entry);
}

export function getRegisteredRoutes(): readonly RouteEntry[] {
  return routes;
}

export function getMutatingStaffRoutes(): readonly RouteEntry[] {
  return routes.filter((r) => r.mutating && r.staffOnly);
}

export function clearRegistry(): void {
  routes.length = 0;
}
