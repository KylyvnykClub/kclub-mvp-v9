import { describe, it, expect } from "vitest";
import {
  DomainError,
  NotFound,
  Forbidden,
  Conflict,
  RateLimited,
  Validation,
  ExternalUnavailable,
} from "./errors.js";

describe("DomainError hierarchy", () => {
  it("NotFound has correct code and message", () => {
    const err = new NotFound("Company", "abc");
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.message).toBe("Company not found: abc");
  });

  it("NotFound works without id", () => {
    const err = new NotFound("Member");
    expect(err.message).toBe("Member not found");
  });

  it("Forbidden has correct code", () => {
    const err = new Forbidden("nope");
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("nope");
  });

  it("Conflict has correct code", () => {
    const err = new Conflict("already exists");
    expect(err.code).toBe("CONFLICT");
  });

  it("RateLimited carries retryAfterMs", () => {
    const err = new RateLimited("slow down", 5000);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryAfterMs).toBe(5000);
  });

  it("Validation carries field", () => {
    const err = new Validation("too short", "name");
    expect(err.code).toBe("VALIDATION");
    expect(err.field).toBe("name");
  });

  it("ExternalUnavailable names the service", () => {
    const err = new ExternalUnavailable("Stripe");
    expect(err.code).toBe("EXTERNAL_UNAVAILABLE");
    expect(err.message).toBe("Stripe is currently unavailable");
  });
});
