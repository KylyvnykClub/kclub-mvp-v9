import { describe, expect, it } from "vitest";
import { computeProfileCompleteness } from "./profile-completeness";

describe("computeProfileCompleteness", () => {
  it("reports nothing complete for a member with no profile row", () => {
    const result = computeProfileCompleteness({
      totpEnabled: false,
      profile: null,
    });

    expect(result.percent).toBe(0);
    expect(result.missing).toEqual([
      "bio",
      "industry",
      "location",
      "avatarUrl",
      "totpEnabled",
    ]);
  });

  it("counts an empty string as missing, not as filled in", () => {
    const result = computeProfileCompleteness({
      totpEnabled: true,
      profile: {
        bio: "",
        industry: "Legal",
        location: null,
        avatarUrl: null,
      },
    });

    expect(result.missing).toEqual(["bio", "location", "avatarUrl"]);
    expect(result.percent).toBe(40);
  });

  it("reports a fully filled profile as complete", () => {
    const result = computeProfileCompleteness({
      totpEnabled: true,
      profile: {
        bio: "Advises family offices.",
        industry: "Finance",
        location: "Warsaw",
        avatarUrl: "https://example.test/a.png",
      },
    });

    expect(result.percent).toBe(100);
    expect(result.missing).toEqual([]);
  });
});
