import { describe, expect, it } from "vitest";

import {
  DEPLOYMENT_SMOKE_TARGETS,
  normalizeBaseUrl,
  smokeUrl,
} from "../../tools/smoke-deployment";

describe("constraint: deployment smoke targets", () => {
  it("covers the launch-blocking public, auth, dashboard, and health routes", () => {
    expect(DEPLOYMENT_SMOKE_TARGETS.map((target) => target.path)).toEqual([
      "/health/live",
      "/health/ready",
      "/en",
      "/en/login",
      "/en/register",
      "/en/legal",
      "/en/directory",
      "/en/dashboard/profile",
    ]);
  });

  it("normalizes base URLs before appending smoke paths", () => {
    const baseUrl = normalizeBaseUrl("https://preview.kclub.example///?x=1");

    expect(baseUrl.toString()).toBe("https://preview.kclub.example/");
    expect(smokeUrl(baseUrl, "/health/live")).toBe(
      "https://preview.kclub.example/health/live",
    );
  });
});
