"use server";

import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { can } from "@/domain/authorization";
import { buildActor } from "@/domain/actor";
import { getAdminDashboardMetrics } from "@/data/admin";
import Stripe from "stripe";
import { env } from "@/env";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

export async function getAdminDashboardMetricsAction() {
  const session = await getCurrentMember();
  if (!session?.member) throw new Error("Unauthorized");

  const actor = buildActor(session.member);
  if (!can(actor, "read", "finance_dashboard")) {
    throw new Error("Unauthorized");
  }

  const { activeVip, activeCompany, renewalsDue } =
    await getAdminDashboardMetrics(db);

  // Stripe metrics
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  // We fetch up to 100 recent successful charges to calculate 30d revenue and country map
  // For a real production app with thousands of payments, this would use Stripe's reporting API
  // or a local projection of payments.
  const charges = await stripe.charges.list({
    created: { gte: thirtyDaysAgo },
    limit: 100,
  });

  let revenue30d = 0;
  const revenueByCountry = new Map<string, number>();
  const recentPayments = [];

  for (const charge of charges.data) {
    if (charge.paid && !charge.refunded) {
      revenue30d += charge.amount;

      const country = charge.billing_details?.address?.country || "Unknown";
      revenueByCountry.set(
        country,
        (revenueByCountry.get(country) ?? 0) + charge.amount,
      );

      if (recentPayments.length < 50) {
        recentPayments.push({
          id: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          country,
          created: charge.created,
          receipt_url: charge.receipt_url,
          customer_email: charge.billing_details?.email,
        });
      }
    }
  }

  return {
    revenue30d: revenue30d / 100, // Assuming USD cents
    activeVip,
    activeCompany,
    renewalsDue,
    revenueByCountry: Object.fromEntries(revenueByCountry),
    recentPayments,
  };
}
