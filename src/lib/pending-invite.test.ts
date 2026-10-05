import { describe, expect, it } from "vitest";

import { sealPendingJoin } from "./pending-join";
import {
  PENDING_INVITE_TTL_MS,
  openPendingInvite,
  sealPendingInvite,
} from "./pending-invite";

const SECRET = "test-secret";
const now = 1_700_000_000_000;
const invite = {
  inviteLinkId: "link-1",
  expiresAt: now + PENDING_INVITE_TTL_MS,
};

describe("FR-123: the invite link is proved on the server, never by the browser", () => {
  it("opens what it sealed", () => {
    expect(
      openPendingInvite(sealPendingInvite(invite, SECRET), SECRET, now),
    ).toEqual(invite);
  });

  it("refuses a seal signed with another secret", () => {
    expect(
      openPendingInvite(sealPendingInvite(invite, "other"), SECRET, now),
    ).toBeNull();
  });

  it("refuses a tampered payload", () => {
    const sealed = sealPendingInvite(invite, SECRET);
    const forged = Buffer.from(
      JSON.stringify({ inviteLinkId: "link-2", expiresAt: invite.expiresAt }),
      "utf8",
    ).toString("base64url");

    expect(
      openPendingInvite(`${forged}.${sealed.split(".")[1]}`, SECRET, now),
    ).toBeNull();
  });

  it("refuses a join-link seal: the two keys never open each other", () => {
    expect(
      openPendingInvite(
        sealPendingJoin({ joinLinkId: "link-1", expiresAt: now + 1 }, SECRET),
        SECRET,
        now,
      ),
    ).toBeNull();
  });

  it("refuses an expired seal", () => {
    expect(
      openPendingInvite(
        sealPendingInvite(invite, SECRET),
        SECRET,
        invite.expiresAt + 1,
      ),
    ).toBeNull();
  });

  it("treats a missing cookie as an ordinary registration", () => {
    expect(openPendingInvite(undefined, SECRET, now)).toBeNull();
  });
});
