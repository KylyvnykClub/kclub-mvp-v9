import { describe, expect, it } from "vitest";

import {
  PENDING_JOIN_TTL_MS,
  openPendingJoin,
  sealPendingJoin,
} from "./pending-join";

const SECRET = "test-secret";
const now = 1_700_000_000_000;
const join = { joinLinkId: "link-1", expiresAt: now + PENDING_JOIN_TTL_MS };

describe("FR-105: the join link is proved on the server, never by the browser", () => {
  it("opens what it sealed", () => {
    expect(openPendingJoin(sealPendingJoin(join, SECRET), SECRET, now)).toEqual(
      join,
    );
  });

  it("refuses a seal signed with another secret", () => {
    expect(
      openPendingJoin(sealPendingJoin(join, "other"), SECRET, now),
    ).toBeNull();
  });

  it("refuses a tampered payload", () => {
    const sealed = sealPendingJoin(join, SECRET);
    const forged = Buffer.from(
      JSON.stringify({ joinLinkId: "link-2", expiresAt: join.expiresAt }),
      "utf8",
    ).toString("base64url");

    expect(
      openPendingJoin(`${forged}.${sealed.split(".")[1]}`, SECRET, now),
    ).toBeNull();
  });

  it("refuses an expired seal", () => {
    expect(
      openPendingJoin(
        sealPendingJoin(join, SECRET),
        SECRET,
        join.expiresAt + 1,
      ),
    ).toBeNull();
  });

  it("treats a missing cookie as an ordinary registration", () => {
    expect(openPendingJoin(undefined, SECRET, now)).toBeNull();
  });
});
