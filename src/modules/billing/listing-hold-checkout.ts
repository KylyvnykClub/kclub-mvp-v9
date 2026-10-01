import Stripe from "stripe";
import { headers } from "next/headers";

import {
  findStripeCustomerIdByMember,
  upsertStripeCustomerMapping,
} from "@/data/billing";
import { findCompanyByOwner } from "@/data/companies";
import { db } from "@/data/db";
import { awaitsPaymentOutsideClub } from "@/data/membership-access";
import { env } from "@/env";
import { logger } from "@/lib/logger";
import { safeErrorFields } from "@/lib/safe-error";
import {
  openListingHoldCheckout,
  productionListingHoldDeps,
} from "@/modules/billing/listing-hold";
import { checkoutPriceIdForPlan } from "@/modules/billing/prices";

/**
 * Where the owner of a just-filed or waiting application goes to reserve the
 * listing (ADR 0037, FR-113): Stripe Checkout, or - with nothing to reserve,
 * such as a listing waived by the partner link (ADR 0040) - back to the screen
 * that shows the application's standing.
 *
 * A plain module rather than part of the `"use server"` file: it takes the
 * owner from its caller, and every export of a server-action file is a public
 * endpoint. Callers authorise first and pass a member they already trust.
 */

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

export type HoldOwner = Parameters<typeof awaitsPaymentOutsideClub>[1] & {
  language: string | null;
  email: string | null;
  displayName: string;
};

function stripeResourceMissing(error: unknown): boolean {
  return (
    error instanceof Stripe.errors.StripeInvalidRequestError &&
    error.code === "resource_missing"
  );
}

async function stripeCustomerIsUsable(stripeCustomerId: string) {
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    return !customer.deleted;
  } catch (error) {
    if (stripeResourceMissing(error)) {
      return false;
    }

    throw error;
  }
}

export async function getOrCreateStripeCustomer(
  memberId: string,
  email?: string,
  name?: string,
) {
  const existing = await findStripeCustomerIdByMember(db, memberId);

  if (existing && (await stripeCustomerIsUsable(existing))) {
    return existing;
  }

  const customer = await stripe.customers.create({
    metadata: {
      memberId: memberId,
    },
    email: email || undefined,
    name: name || undefined,
  });

  await upsertStripeCustomerMapping(db, memberId, customer.id);

  return customer.id;
}

export async function appOrigin(): Promise<string> {
  const headersList = await headers();
  return headersList.get("origin") || env.server.NEXT_PUBLIC_APP_URL;
}

/** The url to send the owner to. Throws if the company is not theirs. */
export async function listingHoldCheckoutUrl(
  owner: HoldOwner,
  companyId: string,
): Promise<string> {
  const locale = owner.language || "en";
  const company = await findCompanyByOwner(db, companyId, owner.id);
  if (!company) {
    throw new Error("Company not found");
  }

  // Back to wherever this owner watches the application: a partner, or a
  // member whose dues are unpaid, on the standing screen (the dashboard is
  // closed to them, FR-103); a member in the club in Profile → Companies.
  const [outsideTheClub, stripeCustomerId, priceId, origin] = await Promise.all(
    [
      // A partner's return address is settled by what they are.
      owner.duesKind === "partner"
        ? Promise.resolve(true)
        : awaitsPaymentOutsideClub(db, owner, new Date()),
      getOrCreateStripeCustomer(
        owner.id,
        owner.email ?? undefined,
        owner.displayName,
      ),
      checkoutPriceIdForPlan(db, "listing"),
      appOrigin(),
    ],
  );
  const back = outsideTheClub
    ? `/${locale}/membership`
    : `/${locale}/dashboard/profile?tab=companies`;

  const separator = back.includes("?") ? "&" : "?";
  const result = await openListingHoldCheckout(
    db,
    await productionListingHoldDeps(),
    {
      memberId: owner.id,
      companyId: company.id,
      stripeCustomerId,
      receiptEmail: owner.email || company.contactEmail || null,
      priceId,
      // The company rides along, so a screen listing several applications
      // marks only this one as "confirming".
      successUrl: `${origin}${back}${separator}hold=returned&company=${company.id}`,
      cancelUrl: `${origin}${back}`,
      now: new Date(),
    },
  );

  return result.outcome === "opened" ? result.url : back;
}

/**
 * The same, for the moment an application has just been filed. Null when
 * Stripe cannot be reached: the application exists either way, and its
 * success screen and standing screen both offer the reservation again.
 */
export async function holdCheckoutUrlOrNull(
  owner: HoldOwner,
  companyId: string,
): Promise<string | null> {
  try {
    return await listingHoldCheckoutUrl(owner, companyId);
  } catch (error) {
    logger.error("Could not open the listing hold checkout", {
      companyId,
      ...safeErrorFields(error),
    });
    return null;
  }
}
