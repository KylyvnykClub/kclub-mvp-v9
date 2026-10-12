import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MembershipCard, type MembershipCardProps } from "./membership-card";

/**
 * FR-021: what each card face prints. The business face is the company's -
 * its name and the members' discount stand where a person's name would - and
 * every face wears its own metal.
 */
const base: MembershipCardProps = {
  face: "member",
  holder: "Olena Koval",
  membershipLabel: "Member",
  serial: "UA-10001",
  qrUrl: null,
  valid: true,
  labels: {
    holder: "Card holder",
    membership: "Membership",
    serial: "Serial",
    status: "Valid",
    company: "Company",
    discount: "For club members",
  },
};

const render = (props: Partial<MembershipCardProps>) =>
  renderToStaticMarkup(createElement(MembershipCard, { ...base, ...props }));

describe("FR-021: club card faces", () => {
  it("FR-021: a business card prints the company and its discount, not the holder", () => {
    const html = render({
      face: "business",
      membershipLabel: "Business partner",
      company: { name: "Century 21 Circle", logoSrc: null, discount: "−10%" },
    });

    expect(html).toContain("Century 21 Circle");
    expect(html).toContain("−10%");
    expect(html).toContain("Company");
    expect(html).not.toContain("Olena Koval");
    // No membership line on the company's card (owner's call, 2026-10-12).
    expect(html).not.toContain("Membership");
    expect(html).not.toContain("Business partner");
    // The serial stays, under the QR.
    expect(html).toContain("UA-10001");
  });

  it("FR-021: member and VIP cards keep their membership line", () => {
    expect(render({ face: "vip", membershipLabel: "VIP member" })).toContain(
      "VIP member",
    );
  });

  it("FR-021: member and VIP cards print the holder and no company", () => {
    for (const face of ["member", "vip"] as const) {
      const html = render({ face });
      expect(html).toContain("Olena Koval");
      expect(html).not.toContain("For club members");
    }
  });

  it("FR-021: each face wears its own metal", () => {
    const bases = (["member", "vip", "business"] as const).map((face) => {
      const match = render({ face }).match(/background-image:([^"]+)"/);
      return match?.[1];
    });

    expect(new Set(bases).size).toBe(3);
  });

  it("FR-021: a card with no serial prints none", () => {
    expect(render({ serial: null })).not.toContain("UA-10001");
  });
});
