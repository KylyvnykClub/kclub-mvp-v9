import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The one behaviour of the sender that the outbox depends on: whether a failure
 * throws or returns false decides whether the row is retried or silently
 * dropped. FR-056's grace warning is the case that made this matter - a dropped
 * warning is never retried, because the enqueued row still suppresses the next
 * sweep, so the member is never warned at all.
 */

const send = vi.fn();

vi.mock("@/env", () => ({
  env: {
    server: {
      RESEND_API_KEY: "re_test_stub",
      EMAIL_FROM: "test@kclub.local",
    },
  },
}));

vi.mock("resend", () => ({
  Resend: class ResendStub {
    emails = { send };
  },
}));

const { sendGraceExpiryWarningEmail, sendPaymentFailedEmail } =
  await import("./email");

const params = {
  to: "member@example.com",
  displayName: "Test Member",
  locale: "en" as const,
};

describe("transactional email delivery", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("FR-056: a Resend error throws, so the outbox row is retried rather than dropped", async () => {
    send.mockResolvedValue({
      error: { statusCode: 429, message: "slow down" },
    });

    await expect(sendGraceExpiryWarningEmail(params)).rejects.toThrow(
      /Resend refused the message/,
    );
  });

  it("FR-056: the same holds for the payment failure notice", async () => {
    send.mockResolvedValue({ error: { statusCode: 500, message: "boom" } });

    await expect(sendPaymentFailedEmail(params)).rejects.toThrow(
      /Resend refused the message/,
    );
  });

  it("FR-056: a delivered message resolves true", async () => {
    send.mockResolvedValue({ error: null, data: { id: "msg_1" } });

    await expect(sendGraceExpiryWarningEmail(params)).resolves.toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
