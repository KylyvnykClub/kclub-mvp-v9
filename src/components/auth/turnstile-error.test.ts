import { describe, expect, it } from "vitest";

import {
  TURNSTILE_NETWORK_CODE,
  classifyTurnstileError,
} from "./turnstile-error";

/**
 * The registration bot gate, client half (ADR 0012).
 *
 * The case that motivates this file is 110200: it reached the deployed site and
 * showed the member a message telling them to complete a challenge that could
 * never succeed, because the hostname was missing from the widget's allowed
 * list. A code that needs an operator must never be presented as retryable.
 */
describe("Turnstile client-side error classification (ADR 0012)", () => {
  it("treats 110200 as configuration, because a disallowed domain never retries into success", () => {
    const failure = classifyTurnstileError("110200");

    expect(failure.kind).toBe("configuration");
    expect(failure.operatorActionRequired).toBe(true);
    expect(failure.code).toBe("110200");
  });

  it.each(["110100", "110110", "110420", "110430"])(
    "treats %s as configuration",
    (code) => {
      const failure = classifyTurnstileError(code);

      expect(failure.kind).toBe("configuration");
      expect(failure.operatorActionRequired).toBe(true);
    },
  );

  it("treats 400020 as configuration, the code a malformed sitekey actually returns", () => {
    // Observed against a live widget: a broken sitekey answers 400020 rather
    // than any 110*** code, so advising the member to reload would be a lie.
    const failure = classifyTurnstileError("400020");

    expect(failure.kind).toBe("configuration");
    expect(failure.operatorActionRequired).toBe(true);
  });

  it.each(["400010", "400099"])(
    "treats the rest of the 400 family (%s) as configuration",
    (code) => {
      expect(classifyTurnstileError(code).kind).toBe("configuration");
    },
  );

  it.each(["110500", "110510"])(
    "treats %s as an unsupported browser, which is not the operator's to fix",
    (code) => {
      const failure = classifyTurnstileError(code);

      expect(failure.kind).toBe("unsupported");
      expect(failure.operatorActionRequired).toBe(false);
    },
  );

  it.each(["110600", "120000", "300010", "600010"])(
    "treats %s as retryable",
    (code) => {
      const failure = classifyTurnstileError(code);

      expect(failure.kind).toBe("retryable");
      expect(failure.operatorActionRequired).toBe(false);
    },
  );

  it("treats an unknown code as retryable rather than guessing it is fatal", () => {
    const failure = classifyTurnstileError("999999");

    expect(failure.kind).toBe("retryable");
    expect(failure.code).toBe("999999");
  });

  it.each([null, undefined, ""])(
    "reports a missing code (%s) as a network failure, which is how a blocked api.js arrives",
    (code) => {
      const failure = classifyTurnstileError(code);

      expect(failure.kind).toBe("network");
      expect(failure.code).toBe(TURNSTILE_NETWORK_CODE);
      expect(failure.operatorActionRequired).toBe(false);
    },
  );

  it("preserves the code it was given, so the member can quote it to support", () => {
    expect(classifyTurnstileError("110200").code).toBe("110200");
    expect(classifyTurnstileError("300010").code).toBe("300010");
  });
});
