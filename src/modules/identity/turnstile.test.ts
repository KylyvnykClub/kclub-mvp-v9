import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serverEnv: { TURNSTILE_SECRET_KEY?: string } = {};

vi.mock("@/env", () => ({
  env: {
    get server() {
      return serverEnv;
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { verifyTurnstileToken } = await import("./turnstile");

/**
 * The registration bot gate (ADR 0012).
 *
 * With phone verification postponed this is the only cost a bot pays to create
 * an account, so the cases that matter are the ones where it must NOT pass:
 * no token, a token Cloudflare rejects, and Cloudflare being unreachable.
 */

function respondWith(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 502,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  serverEnv.TURNSTILE_SECRET_KEY = "secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Turnstile registration gate (ADR 0012)", () => {
  it("accepts a token Cloudflare confirms", async () => {
    vi.stubGlobal("fetch", respondWith({ success: true }));

    expect(await verifyTurnstileToken("token")).toEqual({ ok: true });
  });

  it("rejects a missing token without calling Cloudflare", async () => {
    const fetchMock = respondWith({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyTurnstileToken(undefined)).toEqual({
      ok: false,
      reason: "missing_token",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty token", async () => {
    vi.stubGlobal("fetch", respondWith({ success: true }));

    expect(await verifyTurnstileToken("")).toEqual({
      ok: false,
      reason: "missing_token",
    });
  });

  it("rejects a token Cloudflare refuses", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    );

    expect(await verifyTurnstileToken("token")).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("fails closed when Cloudflare returns an error status", async () => {
    vi.stubGlobal("fetch", respondWith({}, false));

    expect(await verifyTurnstileToken("token")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("fails closed when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    expect(await verifyTurnstileToken("token")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("fails closed when the response body is not the shape Cloudflare documents", async () => {
    vi.stubGlobal("fetch", respondWith({ unexpected: true }));

    expect(await verifyTurnstileToken("token")).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("skips the check when no secret is configured, so local and preview work", async () => {
    delete serverEnv.TURNSTILE_SECRET_KEY;
    const fetchMock = respondWith({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(await verifyTurnstileToken(undefined)).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the secret and the token, and omits a loopback remote ip", async () => {
    const fetchMock = respondWith({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileToken("token", "127.0.0.1");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = init?.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("token");
    expect(body.get("remoteip")).toBeNull();
  });

  it("passes a real client ip through to Cloudflare", async () => {
    const fetchMock = respondWith({ success: true });
    vi.stubGlobal("fetch", fetchMock);

    await verifyTurnstileToken("token", "203.0.113.7");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = init?.body as URLSearchParams;
    expect(body.get("remoteip")).toBe("203.0.113.7");
  });
});
