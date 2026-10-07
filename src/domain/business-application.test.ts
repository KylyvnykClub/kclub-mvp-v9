import { describe, expect, it } from "vitest";

import {
  applicationTerms,
  isEuEeaResident,
  missingConsents,
  paymentAuthorityWording,
  withdrawalWindowOpen,
  type ConsentKind,
} from "./business-application";

const NOW = new Date("2026-10-07T12:00:00Z");

describe("ADR 0044: no Stripe without the three required consents", () => {
  it("refuses an application with nothing ticked", () => {
    expect(missingConsents(new Set())).toEqual([
      "terms",
      "payment_authority",
      "publication",
    ]);
  });

  it("refuses when only the terms are accepted - accepting the Terms is not payment consent", () => {
    expect(missingConsents(new Set<ConsentKind>(["terms"]))).toContain(
      "payment_authority",
    );
  });

  it("accepts the three required boxes without the optional ones", () => {
    expect(
      missingConsents(
        new Set<ConsentKind>(["terms", "payment_authority", "publication"]),
      ),
    ).toEqual([]);
  });

  it("never treats advertising or an early start as a substitute", () => {
    expect(
      missingConsents(
        new Set<ConsentKind>(["marketing", "eu_early_start", "terms"]),
      ),
    ).toEqual(["payment_authority", "publication"]);
  });
});

describe("ADR 0044: the route and the card collection are decided by the server", () => {
  it("an invited US business saves a card for a free month", () => {
    const terms = applicationTerms({
      invited: true,
      residenceCountry: "US",
      earlyStartRequested: false,
      now: NOW,
    });
    expect(terms).toEqual({
      route: "invite",
      collection: "setup",
      startNotBefore: null,
      euConsumer: false,
    });
    expect(paymentAuthorityWording(terms)).toBe("invite");
  });

  it("a public business outside the EU keeps the ADR 0037 hold", () => {
    const terms = applicationTerms({
      invited: false,
      residenceCountry: "UA",
      earlyStartRequested: false,
      now: NOW,
    });
    expect(terms.collection).toBe("hold");
    expect(paymentAuthorityWording(terms)).toBe("public_hold");
  });

  it("an EU consumer who asks for an early start is held like anyone else", () => {
    const terms = applicationTerms({
      invited: false,
      residenceCountry: "DE",
      earlyStartRequested: true,
      now: NOW,
    });
    expect(terms.collection).toBe("hold");
    expect(terms.startNotBefore).toBeNull();
    expect(terms.euConsumer).toBe(true);
  });

  it("an EU consumer without an early start is deferred 14 days and not held - a hold would lapse first", () => {
    const terms = applicationTerms({
      invited: false,
      residenceCountry: "pl",
      earlyStartRequested: false,
      now: NOW,
    });
    expect(terms.collection).toBe("setup");
    expect(terms.startNotBefore).toEqual(new Date("2026-10-21T12:00:00Z"));
    expect(paymentAuthorityWording(terms)).toBe("public_setup");
  });

  it("an invited EU consumer without an early start keeps the invite wording and is deferred", () => {
    const terms = applicationTerms({
      invited: true,
      residenceCountry: "FR",
      earlyStartRequested: false,
      now: NOW,
    });
    expect(paymentAuthorityWording(terms)).toBe("invite");
    expect(terms.startNotBefore).not.toBeNull();
  });
});

describe("ADR 0044 §5: who is an EU/EEA consumer", () => {
  it.each(["DE", "IE", "NO", "IS", "LI"])("%s is", (code) => {
    expect(isEuEeaResident(code)).toBe(true);
  });

  it.each(["US", "UA", "MD", "CH", "CA", "GB", null, ""])(
    "%s is not",
    (code) => {
      expect(isEuEeaResident(code)).toBe(false);
    },
  );

  it("offers the withdrawal button for 14 days and not after", () => {
    const contract = new Date("2026-10-01T00:00:00Z");
    expect(
      withdrawalWindowOpen(contract, new Date("2026-10-14T23:59:59Z")),
    ).toBe(true);
    expect(
      withdrawalWindowOpen(contract, new Date("2026-10-15T00:00:00Z")),
    ).toBe(false);
  });
});

describe("ADR 0040 + ADR 0044: the club's partner link lists a business free", () => {
  it("asks for no payment and keeps the invitation for later", () => {
    const terms = applicationTerms({
      invited: true,
      clubLinkWaiver: true,
      residenceCountry: "DE",
      earlyStartRequested: false,
      now: NOW,
    });
    expect(terms.collection).toBe("none");
    expect(terms.route).toBe("public");
    expect(terms.startNotBefore).toBeNull();
    expect(paymentAuthorityWording(terms)).toBeNull();
  });

  it("does not require payment authority when there is nothing to pay", () => {
    expect(
      missingConsents(new Set<ConsentKind>(["terms", "publication"]), false),
    ).toEqual([]);
  });

  it("still requires the terms and the publication right", () => {
    expect(missingConsents(new Set<ConsentKind>(), false)).toEqual([
      "terms",
      "publication",
    ]);
  });
});
