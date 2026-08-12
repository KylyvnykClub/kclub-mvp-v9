import { globSync } from "node:fs";
import { dirname } from "node:path";

import { describe, expect, it } from "vitest";

import { getRegisteredRoutes } from "@/domain/route-registry.js";

type SurfaceRoute = {
  path: string;
};

function normalizeSegment(segment: string): string | null {
  if (segment.startsWith("(") && segment.endsWith(")")) {
    return null;
  }

  if (segment.startsWith("[") && segment.endsWith("]")) {
    return `:${segment.slice(1, -1)}`;
  }

  return segment;
}

function routePathFromFile(filePath: string): string {
  const normalizedDirectory = dirname(filePath).replaceAll("\\", "/");
  const appRootIndex = normalizedDirectory.indexOf("src/app");
  const appRelativeDirectory =
    appRootIndex >= 0
      ? normalizedDirectory.slice(appRootIndex + "src/app".length + 1)
      : normalizedDirectory;

  if (appRelativeDirectory.length === 0 || appRelativeDirectory === ".") {
    return "/";
  }

  const segments = appRelativeDirectory
    .split("/")
    .map(normalizeSegment)
    .filter((segment) => segment !== null);

  return `/${segments.join("/")}`;
}

function collectSurfaceRoutes(): SurfaceRoute[] {
  const routes = globSync("src/app/**/{page.tsx,route.ts}").map((filePath) => ({
    path: routePathFromFile(filePath),
  }));

  if (globSync("src/app/robots.ts").length > 0) {
    routes.push({ path: "/robots.txt" });
  }

  return routes;
}

function routeKey(route: SurfaceRoute): string {
  return route.path;
}

describe("constraint: route registry coverage", () => {
  it("registers every production App Router route path", () => {
    const registered = new Set(
      getRegisteredRoutes()
        .filter((route) => !route.path.startsWith("action:"))
        .map(routeKey),
    );
    const surface = collectSurfaceRoutes();
    const missing = surface
      .filter((route) => !registered.has(routeKey(route)))
      .map(routeKey);

    expect(surface.length).toBeGreaterThan(0);
    expect(
      missing,
      `App Router route paths missing from src/domain/route-registry.ts:\n${missing.join("\n")}`,
    ).toHaveLength(0);
  });
});
