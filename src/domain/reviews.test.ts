import { describe, expect, it } from "vitest";

import { reviewEligibility } from "./reviews";

const company = { ownerId: "owner", visible: true };
const member = { id: "m1", inClub: true };

describe("FR-127: who may review a partner", () => {
  it("lets a member in the club review a partner they do not own", () => {
    expect(reviewEligibility({ viewer: member, company })).toBe("reviewer");
  });

  it("asks a guest to sign in", () => {
    expect(reviewEligibility({ viewer: null, company })).toBe("guest");
  });

  it("refuses a member outside the club, such as one with unpaid dues", () => {
    expect(
      reviewEligibility({ viewer: { id: "m1", inClub: false }, company }),
    ).toBe("not_in_club");
  });

  it("refuses the partner's owner, even in the club", () => {
    expect(
      reviewEligibility({ viewer: { id: "owner", inClub: true }, company }),
    ).toBe("own_company");
  });

  it("refuses a partner the catalogue does not show", () => {
    expect(
      reviewEligibility({
        viewer: member,
        company: { ownerId: "owner", visible: false },
      }),
    ).toBe("not_found");
    expect(reviewEligibility({ viewer: member, company: null })).toBe(
      "not_found",
    );
  });
});
