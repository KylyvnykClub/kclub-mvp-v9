import { beforeEach, describe, expect, it, vi } from "vitest";

import type Stripe from "stripe";

import type { DbClient } from "@/data/db";

/**
 * ADR 0044: the invite route's card and free month. The database half is
 * replaced by an in-memory stand-in so the rules - the consent gate, the
 * projection's checks, the start conditions and the trial date - are tested
 * without Postgres or Stripe.
 */

type Activation = {
  companyId: string;
  memberId: string;
  route: "invite" | "public";
  freeMonth: boolean;
  startNotBefore: Date | null;
  stripeCustomerId: string | null;
  setupCheckoutSessionId: string | null;
  setupIntentId: string | null;
  paymentMethodId: string | null;
  cardSavedAt: Date | null;
  publishedAt: Date | null;
  trialEndsAt: Date | null;
  stripeSubscriptionId: string | null;
  firstPaidAt: Date | null;
  stripeUpdatedAt: Date | null;
};

const state = vi.hoisted(() => ({
  activation: null as Activation | null,
  company: null as null | {
    id: string;
    ownerId: string;
    name: string;
    moderationStatus: string;
    withdrawnAt: Date | null;
  },
  consent: true,
  outbox: [] as { topic: string; payload: unknown }[],
  localSubscriptions: [] as { status: string }[],
  holds: [] as unknown[],
  ownerCustomer: "cus_1",
}));

vi.mock("@/data/business-applications", () => ({
  findListingActivation: vi.fn(() => Promise.resolve(state.activation)),
  hasPaymentAuthority: vi.fn(() => Promise.resolve(state.consent)),
  listActivationsDueForStart: vi.fn(() => Promise.resolve([])),
  updateListingActivation: vi.fn(
    (_db: unknown, _id: string, patch: Partial<Activation>) => {
      state.activation = { ...state.activation!, ...patch };
      return Promise.resolve();
    },
  ),
}));
vi.mock("@/data/billing", () => ({
  listSubscriptionsByCompanyId: vi.fn(() =>
    Promise.resolve(state.localSubscriptions),
  ),
  findStripeCustomerIdByMember: vi.fn(() =>
    Promise.resolve(state.ownerCustomer),
  ),
}));
vi.mock("@/data/listing-holds", () => ({
  listListingHoldsByCompany: vi.fn(() => Promise.resolve(state.holds)),
}));
vi.mock("@/data/companies", () => ({
  findCompanyById: vi.fn(() => Promise.resolve(state.company)),
}));
vi.mock("@/data/outbox", () => ({
  enqueueOutbox: vi.fn((_db: unknown, topic: string, payload: unknown) => {
    state.outbox.push({ topic, payload });
    return Promise.resolve();
  }),
}));

import {
  activationDue,
  LISTING_SETUP_KIND,
  listingActivationKey,
  openListingSetupCheckout,
  projectListingSetup,
  settleListingActivation,
  type ListingActivationDeps,
} from "./listing-activation";

const db = {
  transaction: (fn: (tx: unknown) => unknown) => fn({}),
} as unknown as DbClient;
const NOW = new Date("2026-10-31T09:00:00Z");
const COMPANY = "11111111-1111-1111-1111-111111111111";
const MEMBER = "22222222-2222-2222-2222-222222222222";

function deps(overrides: Partial<ListingActivationDeps> = {}) {
  const createCheckoutSession = vi.fn(
    (_params: Stripe.Checkout.SessionCreateParams, _key: string) =>
      Promise.resolve({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" }),
  );
  const createSubscription = vi.fn(
    (params: Stripe.SubscriptionCreateParams, _key: string) =>
      Promise.resolve({
        id: "sub_1",
        trial_end:
          typeof params.trial_end === "number" ? params.trial_end : null,
      }),
  );
  return {
    createCheckoutSession,
    retrieveCheckoutSession: vi.fn(),
    createSubscription,
    listingPriceId: vi.fn(() => Promise.resolve("price_listing")),
    listCustomerSubscriptions: vi.fn(() => Promise.resolve([])),
    retrieveSetupIntent: vi.fn(),
    ...overrides,
  } as Omit<
    ListingActivationDeps,
    "createCheckoutSession" | "createSubscription"
  > & {
    createCheckoutSession: typeof createCheckoutSession;
    createSubscription: typeof createSubscription;
  };
}

/** A stand-in for Stripe's session read, typed as the deps expect. */
function returning(value: unknown) {
  return vi.fn(() =>
    Promise.resolve(value as Stripe.Checkout.Session),
  ) as ListingActivationDeps["retrieveCheckoutSession"];
}

beforeEach(() => {
  state.consent = true;
  state.localSubscriptions = [];
  state.holds = [];
  state.ownerCustomer = "cus_1";
  state.outbox = [];
  state.company = {
    id: COMPANY,
    ownerId: MEMBER,
    name: "Brought Co",
    moderationStatus: "pending",
    withdrawnAt: null,
  };
  state.activation = {
    companyId: COMPANY,
    memberId: MEMBER,
    route: "invite",
    freeMonth: true,
    startNotBefore: null,
    stripeCustomerId: "cus_1",
    setupCheckoutSessionId: null,
    setupIntentId: null,
    paymentMethodId: null,
    cardSavedAt: null,
    publishedAt: null,
    trialEndsAt: null,
    stripeSubscriptionId: null,
    firstPaidAt: null,
    stripeUpdatedAt: null,
  };
});

const openInput = {
  memberId: MEMBER,
  companyId: COMPANY,
  stripeCustomerId: "cus_1",
  successUrl: "https://kclub.test/ok",
  cancelUrl: "https://kclub.test/no",
  now: NOW,
};

describe("ADR 0044 §2: no setup Checkout without the payment authority", () => {
  it("opens nothing for a listing a hold or a subscription already pays for", async () => {
    state.localSubscriptions = [{ status: "trialing" }];
    const stripe = deps();
    expect(await openListingSetupCheckout(db, stripe, openInput)).toEqual({
      outcome: "not_needed",
    });
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses, and calls Stripe not at all, when the consent is not on record", async () => {
    state.consent = false;
    const stripe = deps();
    expect(await openListingSetupCheckout(db, stripe, openInput)).toEqual({
      outcome: "consent_missing",
    });
    expect(stripe.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("opens a setup-mode session in USD that saves the card and charges nothing", async () => {
    const stripe = deps();
    const result = await openListingSetupCheckout(db, stripe, openInput);
    expect(result).toEqual({
      outcome: "opened",
      url: "https://checkout.stripe.test/cs_1",
    });
    const [params, key] = stripe.createCheckoutSession.mock.calls[0]!;
    expect(params).toMatchObject({
      mode: "setup",
      currency: "usd",
      customer: "cus_1",
      client_reference_id: COMPANY,
      metadata: { kind: LISTING_SETUP_KIND, companyId: COMPANY },
      setup_intent_data: { metadata: { companyId: COMPANY } },
    });
    expect(params).not.toHaveProperty("line_items");
    expect(key).toBe(listingActivationKey("checkout", COMPANY, NOW));
    expect(state.activation?.setupCheckoutSessionId).toBe("cs_1");
  });

  it("refuses somebody else's company", async () => {
    await expect(
      openListingSetupCheckout(db, deps(), { ...openInput, memberId: "other" }),
    ).rejects.toThrow();
  });
});

describe("ADR 0044 §3: the card is recorded from Stripe, never from the redirect", () => {
  function session(overrides: Record<string, unknown> = {}) {
    return {
      id: "cs_1",
      mode: "setup",
      customer: "cus_1",
      metadata: { kind: LISTING_SETUP_KIND, companyId: COMPANY },
      setup_intent: {
        id: "seti_1",
        status: "succeeded",
        payment_method: "pm_1",
      },
      ...overrides,
    };
  }

  it("records the payment method of a succeeded SetupIntent", async () => {
    const stripe = deps({
      retrieveCheckoutSession: returning(session()),
    });
    expect(
      await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW),
    ).toBe("applied");
    expect(state.activation).toMatchObject({
      paymentMethodId: "pm_1",
      setupIntentId: "seti_1",
      cardSavedAt: NOW,
    });
  });

  it("records no card while the SetupIntent has not succeeded", async () => {
    const stripe = deps({
      retrieveCheckoutSession: returning(
        session({
          setup_intent: {
            id: "seti_1",
            status: "requires_action",
            payment_method: "pm_1",
          },
        }),
      ),
    });
    await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW);
    expect(state.activation?.cardSavedAt).toBeNull();
  });

  it("ignores a session under another Customer - not this owner's card", async () => {
    const stripe = deps({
      retrieveCheckoutSession: returning(
        session({ customer: "cus_someone_else" }),
      ),
    });
    expect(
      await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW),
    ).toBe("ignored");
    expect(state.activation?.paymentMethodId).toBeNull();
  });

  it("ignores a payment-mode session and one that is not a listing's", async () => {
    for (const overrides of [{ mode: "payment" }, { metadata: {} }]) {
      const stripe = deps({
        retrieveCheckoutSession: returning(session(overrides)),
      });
      expect(
        await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW),
      ).toBe("ignored");
    }
  });

  it("is one-way: once the card is saved, a later event about another session changes nothing", async () => {
    state.activation!.cardSavedAt = NOW;
    state.activation!.paymentMethodId = "pm_first";
    const stripe = deps({ retrieveCheckoutSession: returning(session()) });
    expect(
      await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW),
    ).toBe("stale");
    expect(state.activation?.paymentMethodId).toBe("pm_first");
  });

  it("does not let an abandoned session's newer event hide the one that succeeded", async () => {
    const abandoned = deps({
      retrieveCheckoutSession: returning(
        session({
          id: "cs_2",
          setup_intent: { id: "seti_2", status: "requires_payment_method" },
        }),
      ),
    });
    await projectListingSetup(db, abandoned, "cs_2", 1_800_000_100, NOW);
    const completed = deps({ retrieveCheckoutSession: returning(session()) });
    expect(
      await projectListingSetup(db, completed, "cs_1", 1_800_000_000, NOW),
    ).toBe("applied");
    expect(state.activation?.paymentMethodId).toBe("pm_1");
  });

  it("checks the owner's own Customer when the session's was never recorded", async () => {
    state.activation!.stripeCustomerId = null;
    state.ownerCustomer = "cus_owner";
    const stripe = deps({ retrieveCheckoutSession: returning(session()) });
    expect(
      await projectListingSetup(db, stripe, "cs_1", 1_800_000_000, NOW),
    ).toBe("ignored");
  });
});

describe("ADR 0044 §1: the free month starts at publication, once", () => {
  function ready() {
    state.company!.moderationStatus = "approved";
    state.activation!.paymentMethodId = "pm_1";
    state.activation!.cardSavedAt = NOW;
  }

  it("starts a subscription whose trial ends one calendar month after publication, clamped to the month's end", async () => {
    ready();
    const stripe = deps();
    expect(await settleListingActivation(db, stripe, COMPANY, NOW)).toBe(
      "started",
    );

    const [params, key] = stripe.createSubscription.mock.calls[0]!;
    // 31 October + one calendar month = 30 November (no 31st), UTC.
    expect(params.trial_end).toBe(
      Math.floor(new Date("2026-11-30T09:00:00Z").getTime() / 1000),
    );
    expect(params).toMatchObject({
      customer: "cus_1",
      items: [{ price: "price_listing", quantity: 1 }],
      default_payment_method: "pm_1",
      collection_method: "charge_automatically",
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { companyId: COMPANY, memberId: MEMBER },
    });
    expect(params.metadata).not.toHaveProperty("inviterMemberId");
    expect(key).toBe(listingActivationKey("subscription", COMPANY));
    expect(state.activation?.publishedAt).toEqual(NOW);
    expect(state.activation?.stripeSubscriptionId).toBe("sub_1");
    expect(state.outbox).toContainEqual({
      topic: "billing.listing_activation.event",
      payload: { type: "published", companyId: COMPANY },
    });
  });

  it("never starts beside a listing subscription that already exists", async () => {
    ready();
    state.localSubscriptions = [{ status: "active" }];
    const stripe = deps();
    expect(await settleListingActivation(db, stripe, COMPANY, NOW)).toBe(
      "not_applicable",
    );
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it("checks Stripe first, and adopts a subscription an earlier attempt created", async () => {
    ready();
    const stripe = deps({
      listCustomerSubscriptions: vi.fn(() =>
        Promise.resolve([
          {
            id: "sub_lost",
            status: "trialing",
            trial_end: 1_800_000_000,
            metadata: { companyId: COMPANY },
          },
        ]),
      ),
    });
    expect(await settleListingActivation(db, stripe, COMPANY, NOW)).toBe(
      "already_started",
    );
    expect(stripe.createSubscription).not.toHaveBeenCalled();
    expect(state.activation?.stripeSubscriptionId).toBe("sub_lost");
  });

  it("does not start twice", async () => {
    ready();
    state.activation!.stripeSubscriptionId = "sub_1";
    const stripe = deps();
    expect(await settleListingActivation(db, stripe, COMPANY, NOW)).toBe(
      "already_started",
    );
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });

  it("keeps the first attempt's publication moment on a retry", async () => {
    ready();
    const first = new Date("2026-10-30T09:00:00Z");
    state.activation!.publishedAt = first;
    const stripe = deps();
    await settleListingActivation(db, stripe, COMPANY, NOW);
    expect(stripe.createSubscription.mock.calls[0]![0].trial_end).toBe(
      Math.floor(new Date("2026-11-30T09:00:00Z").getTime() / 1000),
    );
  });

  it("charges at once, with no trial, for a deferred public listing", async () => {
    ready();
    state.activation!.freeMonth = false;
    state.activation!.route = "public";
    const stripe = deps();
    await settleListingActivation(db, stripe, COMPANY, NOW);
    expect(stripe.createSubscription.mock.calls[0]![0]).not.toHaveProperty(
      "trial_end",
    );
  });

  it.each([
    ["not yet approved", () => (state.company!.moderationStatus = "pending")],
    ["withdrawn", () => (state.company!.withdrawnAt = NOW)],
    ["without a card", () => (state.activation!.paymentMethodId = null)],
    ["without the consent", () => (state.consent = false)],
    [
      "before an EU consumer's 14 days",
      () =>
        (state.activation!.startNotBefore = new Date("2026-11-01T00:00:00Z")),
    ],
  ])("never starts %s", async (_label, spoil) => {
    ready();
    spoil();
    const stripe = deps();
    expect(await settleListingActivation(db, stripe, COMPANY, NOW)).toBe(
      "not_ready",
    );
    expect(stripe.createSubscription).not.toHaveBeenCalled();
  });
});

describe("ADR 0044: activationDue is the whole start rule", () => {
  const base = {
    paymentMethodId: "pm_1",
    stripeSubscriptionId: null,
    startNotBefore: null,
  };
  const approved = { moderationStatus: "approved", withdrawnAt: null };

  it("is due when approved, with a card, consent and no subscription", () => {
    expect(activationDue(base, approved, true, NOW)).toBe(true);
  });

  it("is due on the day an EU start date arrives", () => {
    expect(
      activationDue({ ...base, startNotBefore: NOW }, approved, true, NOW),
    ).toBe(true);
  });
});
