import type Stripe from "stripe";

import {
  findListingActivation,
  findListingActivationBySubscription,
  updateListingActivation,
} from "@/data/business-applications";
import { findMemberByStripeCustomerId } from "@/data/billing";
import { findCompanyById } from "@/data/companies";
import type { DbClient } from "@/data/db";
import { findMemberById } from "@/data/identity";
import { monthlyPrice } from "@/domain/pricing";

/**
 * Subscription and invoice events after a listing has started (ADR 0044 §6).
 * Each re-reads its object from Stripe; the payload carries only an id.
 *
 * - `trial_will_end` - the reminder before the first charge, from our side
 *   as well as Stripe's own reminder email.
 * - `invoice.paid` - the first invoice **with money in it** marks the first
 *   real payment. A $0 trial invoice is not a conversion, and `active` alone
 *   is not proof of payment.
 * - `invoice.payment_action_required` - the bank wants the cardholder (3-D
 *   Secure); they get Stripe's hosted page. For any subscription, VIP too.
 * - `invoice.finalization_failed` - logged for an operator; nothing was
 *   charged and Stripe retries finalisation itself.
 */

export interface ActivationEventPayload {
  type?: string;
  companyId?: string;
  subscriptionId?: string;
  invoiceId?: string;
}

export interface ActivationEventDeps {
  retrieveInvoice: (id: string) => Promise<Stripe.Invoice>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
  sendPublished: typeof import("@/modules/notifications/listing-emails").sendListingPublishedEmail;
  sendTrialEnding: typeof import("@/modules/notifications/listing-emails").sendTrialEndingEmail;
  sendPaymentActionRequired: typeof import("@/modules/notifications/listing-emails").sendPaymentActionRequiredEmail;
}

type Locale = "en" | "ru" | "uk";

function localeOf(language: string | null | undefined): Locale {
  return language === "ru" || language === "uk" ? language : "en";
}

function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const details = invoice.parent?.subscription_details;
  const subscription = details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

export type ActivationEventOutcome = "applied" | "ignored";

export async function handleListingActivationEvent(
  db: DbClient,
  deps: ActivationEventDeps,
  payload: ActivationEventPayload,
  now: Date,
): Promise<ActivationEventOutcome> {
  // A hidden listing's renewal, retried after Stripe was unreachable.
  if (payload.type === "cancel_renewal" && payload.companyId) {
    const { cancelListingRenewal, productionListingCancellationDeps } =
      await import("./listing-cancellation");
    const company = await findCompanyById(db, payload.companyId);
    if (company?.moderationStatus !== "rejected") return "ignored";
    await cancelListingRenewal(
      db,
      await productionListingCancellationDeps(),
      payload.companyId,
    );
    return "applied";
  }

  if (payload.type === "published" && payload.companyId) {
    const [activation, company] = await Promise.all([
      findListingActivation(db, payload.companyId),
      findCompanyById(db, payload.companyId),
    ]);
    if (!activation?.publishedAt || !company) return "ignored";
    const owner = await findMemberById(db, activation.memberId);
    const to = owner?.email ?? company.contactEmail;
    if (!to) return "ignored";
    const locale = localeOf(owner?.language);
    await deps.sendPublished({
      to,
      locale,
      companyName: company.name,
      publishedAt: activation.publishedAt,
      firstChargeAt: activation.trialEndsAt,
      price: monthlyPrice("listing", locale),
    });
    return "applied";
  }

  if (payload.type === "trial_will_end" && payload.subscriptionId) {
    const activation = await findListingActivationBySubscription(
      db,
      payload.subscriptionId,
    );
    if (!activation) return "ignored";

    // The date comes from Stripe's own record of the subscription, not the
    // event's copy, so a forged payload cannot announce a wrong charge date.
    const subscription = await deps.retrieveSubscription(
      payload.subscriptionId,
    );
    if (subscription.status !== "trialing" || !subscription.trial_end) {
      return "ignored";
    }
    if (subscription.cancel_at_period_end) return "ignored";

    const [company, owner] = await Promise.all([
      findCompanyById(db, activation.companyId),
      findMemberById(db, activation.memberId),
    ]);
    const to = owner?.email ?? company?.contactEmail;
    if (!company || !to) return "ignored";

    const locale = localeOf(owner?.language);
    await deps.sendTrialEnding({
      to,
      locale,
      companyName: company.name,
      firstChargeAt: new Date(subscription.trial_end * 1000),
      price: monthlyPrice("listing", locale),
    });
    return "applied";
  }

  if (!payload.invoiceId) return "ignored";
  const invoice = await deps.retrieveInvoice(payload.invoiceId);
  const subscriptionId = subscriptionIdOf(invoice);

  if (payload.type === "invoice.paid") {
    if (
      !subscriptionId ||
      invoice.status !== "paid" ||
      invoice.amount_paid <= 0
    )
      return "ignored";
    const activation = await findListingActivationBySubscription(
      db,
      subscriptionId,
    );
    if (!activation || activation.firstPaidAt) return "ignored";
    await updateListingActivation(db, activation.companyId, {
      firstPaidAt: now,
    });
    return "applied";
  }

  if (payload.type === "invoice.payment_action_required") {
    if (!invoice.hosted_invoice_url || invoice.status !== "open") {
      return "ignored";
    }
    const customerId =
      typeof invoice.customer === "string"
        ? invoice.customer
        : invoice.customer?.id;
    if (!customerId) return "ignored";
    const member = await findMemberByStripeCustomerId(db, customerId);
    if (!member) return "ignored";
    const full = await findMemberById(db, member.memberId);
    if (!full?.email) return "ignored";

    await deps.sendPaymentActionRequired({
      to: full.email,
      locale: localeOf(member.language),
      hostedInvoiceUrl: invoice.hosted_invoice_url,
    });
    return "applied";
  }

  if (payload.type === "invoice.finalization_failed") {
    console.error(
      `[listing-activation] invoice ${invoice.id} failed to finalise: ${invoice.last_finalization_error?.message ?? "no reason given"}`,
    );
    return "applied";
  }

  return "ignored";
}

export async function productionActivationEventDeps(): Promise<ActivationEventDeps> {
  const [{ default: StripeClient }, { env }, emails] = await Promise.all([
    import("stripe"),
    import("@/env"),
    import("@/modules/notifications/listing-emails"),
  ]);
  const stripe = new StripeClient(env.server.STRIPE_SECRET_KEY);
  return {
    retrieveInvoice: (id) => stripe.invoices.retrieve(id),
    retrieveSubscription: (id) => stripe.subscriptions.retrieve(id),
    sendPublished: emails.sendListingPublishedEmail,
    sendTrialEnding: emails.sendTrialEndingEmail,
    sendPaymentActionRequired: emails.sendPaymentActionRequiredEmail,
  };
}
