"use server";

import Stripe from "stripe";
import { z } from "zod";
import { getCurrentMember } from "./session";
import { db } from "@/data/db";
import {
  findAccessGrantingSubscription,
  findStripeCustomerIdByMember,
} from "@/data/billing";
import { buildActor } from "@/domain/actor";
import { assertCan } from "@/domain/authorization";
import {
  appOrigin,
  getOrCreateStripeCustomer,
  listingHoldCheckoutUrl,
} from "@/modules/billing/listing-hold-checkout";
import { redirect } from "next/navigation";
import { env } from "@/env";
import {
  checkoutIdempotencyKey,
  type CheckoutPlan,
} from "@/modules/billing/checkout";
import { checkoutPriceIdForPlan } from "@/modules/billing/prices";
import {
  membershipConsentTicked,
  postedMembershipWording,
  recordMembershipPaymentAuthority,
  type MembershipConsentWording,
} from "@/modules/billing/membership-consent";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

async function createSubscriptionCheckout(params: {
  plan: CheckoutPlan;
  priceId: string;
  companyId?: string;
}) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const locale = auth.member.language || "en";

  const stripeCustomerId = await getOrCreateStripeCustomer(
    auth.member.id,
    undefined,
    auth.member.displayName,
  );

  const origin = await appOrigin();

  const metadata: Record<string, string> = {
    memberId: auth.member.id,
  };

  if (params.companyId) {
    metadata.companyId = params.companyId;
  }

  const companyQuery = params.companyId
    ? `?company=${encodeURIComponent(params.companyId)}`
    : "";

  const session = await stripe.checkout.sessions.create(
    {
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      metadata,
      subscription_data: {
        metadata,
      },
      // The company id lets the result pages name what was paid for and say
      // what happens next. It selects copy and nothing else - entitlement is
      // projected from the webhook alone (ADR 0004).
      success_url: `${origin}/${locale}/dashboard/checkout/success${companyQuery}`,
      cancel_url: `${origin}/${locale}/dashboard/checkout/canceled${companyQuery}`,
    },
    {
      idempotencyKey: checkoutIdempotencyKey({
        memberId: auth.member.id,
        plan: params.plan,
        priceId: params.priceId,
        companyId: params.companyId,
      }),
    },
  );

  if (!session.url) {
    throw new Error("Failed to create checkout session");
  }

  redirect(session.url);
}

/**
 * The box above every membership or VIP button. Throws without it - the
 * buttons are disabled until it is ticked, so only a forged request gets
 * here - and records it when it is there.
 */
async function requireMembershipConsent(
  formData: FormData | undefined,
  accepted: readonly MembershipConsentWording[],
): Promise<void> {
  const auth = await getCurrentMember();
  if (!auth?.member) throw new Error("Unauthorized");
  // The words shown must be words for this charge: a switch is authorised
  // as a switch, never by the dues screen's box.
  const wording = postedMembershipWording(formData);
  if (
    !membershipConsentTicked(formData) ||
    !wording ||
    !accepted.includes(wording)
  ) {
    throw new Error("Payment authority is required");
  }
  await recordMembershipPaymentAuthority(db, {
    memberId: auth.member.id,
    locale: auth.member.language || "en",
    residenceCountry: auth.member.country ?? null,
    wording,
    now: new Date(),
  });
}

/**
 * Open membership dues checkout (FR-102).
 *
 * The session grants nothing on its return, exactly like the two beside it: the
 * member reaches the club when the subscription is projected from Stripe's own
 * event (FR-104, ADR 0004). Until then they are back on the dues screen, which
 * is the correct place for someone who has not paid.
 */
export async function createMembershipCheckoutAction(formData?: FormData) {
  // The payment authority box (ADR 0044 §2): no Checkout without it, and the
  // words it showed are recorded before Stripe is opened.
  await requireMembershipConsent(formData, ["member_dues"]);
  await createSubscriptionCheckout({
    plan: "membership",
    priceId: await checkoutPriceIdForPlan(db, "membership"),
  });
}

/**
 * Become a VIP member (FR-050). VIP includes membership (ADR 0043), so it is
 * one subscription either way:
 *
 * - somebody not yet paying anything opens Checkout for the VIP price, and
 *   that subscription alone opens the club;
 * - somebody already paying dues has that subscription switched to the VIP
 *   price, charged the prorated difference now. Opening a second subscription
 *   would bill them for membership twice.
 *
 * The switch uses `pending_if_incomplete`, so Stripe applies the new price
 * only once the difference is paid. Either way nothing is granted here: the
 * plan and the card tier follow when `customer.subscription.updated` is
 * projected, which resolves the plan from the new price (ADR 0004).
 */
export async function createVipCheckoutAction(formData?: FormData) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const vipPriceId = await checkoutPriceIdForPlan(db, "vip");
  const locale = auth.member.language || "en";
  const origin = await appOrigin();

  if (await findAccessGrantingSubscription(db, auth.member.id, "vip")) {
    redirect(`${origin}/${locale}/dashboard/profile?tab=billing`);
  }

  const dues = await findAccessGrantingSubscription(
    db,
    auth.member.id,
    "membership",
  );
  // A new VIP subscription and a switch are authorised in different words:
  // the second charges the difference now.
  await requireMembershipConsent(
    formData,
    dues ? ["vip_switch"] : ["member_dues", "vip_new"],
  );
  if (!dues) {
    await createSubscriptionCheckout({ plan: "vip", priceId: vipPriceId });
    return;
  }

  const current = await stripe.subscriptions.retrieve(
    dues.stripeSubscriptionId,
  );
  const item = current.items.data[0];
  if (!item) {
    throw new Error("Dues subscription has no item to switch");
  }

  const updated = await stripe.subscriptions.update(
    current.id,
    {
      items: [{ id: item.id, price: vipPriceId }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      expand: ["latest_invoice"],
    },
    // A minute bucket, like every checkout here: a double click switches once,
    // and a retry after an abandoned 3-D Secure step is a new request rather
    // than a replay of the old answer.
    {
      idempotencyKey: `kclub.vip-switch.v1:${current.id}:${vipPriceId}:${Math.floor(Date.now() / 60_000)}`,
    },
  );

  // The card needs the member (3-D Secure, a decline): the switch waits on the
  // invoice, and Stripe's hosted page is where it is paid.
  const invoice = updated.latest_invoice;
  if (
    updated.pending_update &&
    invoice &&
    typeof invoice !== "string" &&
    invoice.hosted_invoice_url
  ) {
    redirect(invoice.hosted_invoice_url);
  }

  redirect(`${origin}/${locale}/dashboard/checkout/success`);
}

/**
 * Reserve the listing price on the card of whoever owns the company
 * (ADR 0037, FR-113) - a partner from their standing screen, or a member from
 * Profile → Companies. The one way a listing is paid for.
 *
 * Opens Stripe Checkout in `payment` mode with a manually captured
 * PaymentIntent, so the price is authorised and not charged. It is captured
 * when a moderator approves the application - or at once, if the application
 * is already approved - and released when one rejects it. The card is saved for
 * the monthly subscription that follows the first capture, and the receipt goes
 * to the owner's own address.
 *
 * The company id comes from the browser, so it is parsed and ownership is
 * checked inside `openListingHoldCheckout`. Like every checkout here, the
 * return grants nothing: the hold is recorded when Stripe's own
 * `payment_intent.*` event is projected (ADR 0004). An owner with nothing to
 * reserve - already held, already paid, rejected - is sent back to the screen
 * that says so.
 */
export async function createListingHoldCheckoutAction(companyId: string) {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const actor = buildActor(auth.member);
  assertCan(actor, "update", "own_company");

  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) {
    throw new Error("Invalid company id");
  }

  redirect(await listingHoldCheckoutUrl(auth.member, parsed.data));
}

export async function createPortalSessionAction() {
  const auth = await getCurrentMember();
  if (!auth?.member) {
    throw new Error("Unauthorized");
  }

  const stripeCustomerId = await findStripeCustomerIdByMember(
    db,
    auth.member.id,
  );

  if (!stripeCustomerId) {
    throw new Error("No billing account found");
  }

  const locale = auth.member.language || "en";
  const origin = await appOrigin();

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/${locale}/dashboard/profile`,
  });

  if (!portalSession.url) {
    throw new Error("Failed to create portal session");
  }

  redirect(portalSession.url);
}
