"use server";

import { db } from "@/data/db";
import { getCurrentMember } from "@/actions/session";
import { can } from "@/domain/authorization";
import { buildActor } from "@/domain/actor";
import { getAdminDashboardMetrics, getRegistrationsByDay } from "@/data/admin";
import Stripe from "stripe";
import { env } from "@/env";

const stripe = new Stripe(env.server.STRIPE_SECRET_KEY);

export type DashboardPeriodDays = 7 | 30 | 90;

export async function getAdminDashboardMetricsAction(
  days: DashboardPeriodDays = 30,
) {
  const session = await getCurrentMember();
  if (!session?.member) throw new Error("Unauthorized");

  const actor = buildActor(session.member);
  if (!can(actor, "read", "finance_dashboard")) {
    throw new Error("Unauthorized");
  }

  const [{ activeVip, activeCompany, renewalsDue }, registrationsByDay] =
    await Promise.all([
      getAdminDashboardMetrics(db),
      getRegistrationsByDay(db, days),
    ]);

  // Stripe metrics
  const sinceEpoch = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  // We fetch up to 100 recent successful charges to calculate revenue and
  // country map for the selected period. For a real production app with
  // thousands of payments, this would use Stripe's reporting API or a local
  // projection of payments.
  const charges = await stripe.charges.list({
    created: { gte: sinceEpoch },
    limit: 100,
  });

  let revenue = 0;
  const revenueByCountry = new Map<string, number>();
  const revenueByDay = new Map<string, number>();
  const recentPayments = [];

  for (const charge of charges.data) {
    if (charge.paid && !charge.refunded) {
      revenue += charge.amount;

      const country = charge.billing_details?.address?.country || "Unknown";
      revenueByCountry.set(
        country,
        (revenueByCountry.get(country) ?? 0) + charge.amount,
      );

      const day = new Date(charge.created * 1000).toISOString().slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) ?? 0) + charge.amount);

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
    days,
    revenue: revenue / 100, // Assuming USD cents
    activeVip,
    activeCompany,
    renewalsDue,
    revenueByCountry: Object.fromEntries(revenueByCountry),
    revenueSparkline: registrationsByDay.map(
      (bucket) => (revenueByDay.get(bucket.date) ?? 0) / 100,
    ),
    recentPayments,
    registrationsByDay,
  };
}
