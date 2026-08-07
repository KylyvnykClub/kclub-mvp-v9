import { describe, it, expect } from "vitest";
import {
  realClock,
  realIdSource,
  deterministicClock,
  deterministicIdSource,
} from "./context";

describe("Clock", () => {
  it("realClock returns a recent Date", () => {
    const now = realClock.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it("deterministicClock starts at the given time", () => {
    const epoch = new Date("2026-03-01T00:00:00Z");
    const clock = deterministicClock(epoch);
    expect(clock.now()).toEqual(epoch);
  });

  it("deterministicClock advances by stepMs on each call", () => {
    const epoch = new Date("2026-03-01T00:00:00Z");
    const clock = deterministicClock(epoch, 2000);
    clock.now(); // consume first
    expect(clock.now()).toEqual(new Date("2026-03-01T00:00:02Z"));
    expect(clock.now()).toEqual(new Date("2026-03-01T00:00:04Z"));
  });
});

describe("IdSource", () => {
  it("realIdSource returns valid UUIDs", () => {
    const id = realIdSource.uuid();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("deterministicIdSource produces sequential ids", () => {
    const ids = deterministicIdSource();
    expect(ids.uuid()).toBe("00000000-0000-0000-0000-000000000001");
    expect(ids.uuid()).toBe("00000000-0000-0000-0000-000000000002");
  });

  it("deterministicIdSource accepts a custom prefix", () => {
    const ids = deterministicIdSource("aaaaaaaa-bbbb-cccc-dddd");
    expect(ids.uuid()).toBe("aaaaaaaa-bbbb-cccc-dddd-000000000001");
  });
});
