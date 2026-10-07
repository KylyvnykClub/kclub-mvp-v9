import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/data/db";

const state = vi.hoisted(() => ({
  activation: null as null | Record<string, unknown>,
  updates: [] as unknown[],
}));

vi.mock("@/data/business-applications", () => ({
  findListingActivation: vi.fn(() => Promise.resolve(state.activation)),
  findListingActivationBySubscription: vi.fn(() =>
    Promise.resolve(state.activation),
  ),
  updateListingActivation: vi.fn(
    (_db: unknown, _id: string, patch: unknown) => {
      state.updates.push(patch);
      return Promise.resolve();
    },
  ),
}));
vi.mock("@/data/billing", () => ({
  findMemberByStripeCustomerId: vi.fn(() =>
    Promise.resolve({ memberId: "m1", displayName: "A", language: "uk" }),
  ),
}));
vi.mock("@/data/companies", () => ({
  findCompanyById: vi.fn(() =>
    Promise.resolve({ id: "c1", name: "Brought Co", contactEmail: null }),
  ),
}));
vi.mock("@/data/identity", () => ({
  findMemberById: vi.fn(() =>
    Promise.resolve({ email: "owner@example.test", language: "uk" }),
  ),
}));

import {
  handleListingActivationEvent,
  type ActivationEventDeps,
} from "./listing-activation-events";

const db = {} as DbClient;
const NOW = new Date("2026-11-30T09:00:00Z");

function deps(
  invoice: Partial<Stripe.Invoice>,
  subscription?: Partial<Stripe.Subscription>,
) {
  return {
    retrieveInvoice: vi.fn(() => Promise.resolve(invoice as Stripe.Invoice)),
    retrieveSubscription: vi.fn(() =>
      Promise.resolve(subscription as Stripe.Subscription),
    ),
    sendPublished: vi.fn(() => Promise.resolve(true)),
    sendTrialEnding: vi.fn(() => Promise.resolve(true)),
    sendPaymentActionRequired: vi.fn(() => Promise.resolve(true)),
  } satisfies ActivationEventDeps;
}

const paidInvoice = (amount: number) =>
  ({
    id: "in_1",
    status: "paid",
    amount_paid: amount,
    parent: { subscription_details: { subscription: "sub_1" } },
  }) as unknown as Partial<Stripe.Invoice>;

beforeEach(() => {
  state.updates = [];
  state.activation = {
    companyId: "c1",
    memberId: "m1",
    firstPaidAt: null,
    publishedAt: new Date("2026-10-31T09:00:00Z"),
    trialEndsAt: new Date("2026-11-30T09:00:00Z"),
  };
});

describe("ADR 0044 §6: the first real payment is money, not a status", () => {
  it("records the first invoice with money in it", async () => {
    await handleListingActivationEvent(
      db,
      deps(paidInvoice(1999)),
      { type: "invoice.paid", invoiceId: "in_1" },
      NOW,
    );
    expect(state.updates).toEqual([{ firstPaidAt: NOW }]);
  });

  it("does not count the $0 trial invoice as a payment", async () => {
    expect(
      await handleListingActivationEvent(
        db,
        deps(paidInvoice(0)),
        { type: "invoice.paid", invoiceId: "in_0" },
        NOW,
      ),
    ).toBe("ignored");
    expect(state.updates).toEqual([]);
  });

  it("records the first payment once", async () => {
    state.activation!.firstPaidAt = new Date("2026-11-30T09:00:00Z");
    await handleListingActivationEvent(
      db,
      deps(paidInvoice(1999)),
      { type: "invoice.paid", invoiceId: "in_2" },
      NOW,
    );
    expect(state.updates).toEqual([]);
  });
});

describe("ADR 0044 §6: emails at the moments the partner may want to cancel", () => {
  it("reminds before the first charge, with the date Stripe has, not the event's", async () => {
    const d = deps(
      {},
      {
        status: "trialing",
        trial_end: 1_800_000_000,
        cancel_at_period_end: false,
      },
    );
    await handleListingActivationEvent(
      db,
      d,
      { type: "trial_will_end", subscriptionId: "sub_1" },
      NOW,
    );
    expect(d.sendTrialEnding).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.test",
        locale: "uk",
        firstChargeAt: new Date(1_800_000_000 * 1000),
      }),
    );
  });

  it("sends no reminder for a renewal already cancelled - nothing will be charged", async () => {
    const d = deps(
      {},
      {
        status: "trialing",
        trial_end: 1_800_000_000,
        cancel_at_period_end: true,
      },
    );
    await handleListingActivationEvent(
      db,
      d,
      { type: "trial_will_end", subscriptionId: "sub_1" },
      NOW,
    );
    expect(d.sendTrialEnding).not.toHaveBeenCalled();
  });

  it("sends Stripe's hosted page when the bank wants the cardholder", async () => {
    const d = deps({
      status: "open",
      hosted_invoice_url: "https://invoice.stripe.test/i_1",
      customer: "cus_1",
    });
    await handleListingActivationEvent(
      db,
      d,
      { type: "invoice.payment_action_required", invoiceId: "in_1" },
      NOW,
    );
    expect(d.sendPaymentActionRequired).toHaveBeenCalledWith({
      to: "owner@example.test",
      locale: "uk",
      hostedInvoiceUrl: "https://invoice.stripe.test/i_1",
    });
  });

  it("announces publication with the free month's end as the first charge date", async () => {
    const d = deps({});
    await handleListingActivationEvent(
      db,
      d,
      { type: "published", companyId: "c1" },
      NOW,
    );
    expect(d.sendPublished).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Brought Co",
        publishedAt: new Date("2026-10-31T09:00:00Z"),
        firstChargeAt: new Date("2026-11-30T09:00:00Z"),
      }),
    );
  });
});
