import { describe, expect, it } from "vitest";
import { avatarObjectKey } from "./avatar-path";

describe("avatarObjectKey", () => {
  it("is scoped under media/avatars/, distinct from the backups/ prefix", () => {
    expect(avatarObjectKey("m1")).toBe("media/avatars/m1.webp");
  });

  it("is one slot per member id — deterministic, not per-upload", () => {
    expect(avatarObjectKey("m1")).toBe(avatarObjectKey("m1"));
  });
});
