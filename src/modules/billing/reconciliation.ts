import type Stripe from "stripe";
import { enqueueOutbox } from "@/data/outbox";
import { listAllSubscriptions, type AnySubscriptionRow } from "@/data/billing";
import type { DbClient } from "@/data/db";
import type { SubscriptionFetcher } from "./projection";

export const BILLING_RECONCILIATION_ALERT_TOPIC =
  "billing.reconciliation.divergence";

export type ReconciliationDifference = {
  field: string;
  local: string | null;
  stripe: string | null;
};

type ComparableSubscriptionField = {
  field: string;
  local: string | null;
  stripe: string | null;
};

export interface ReconciliationAlertPayload {
  stripeSubscriptionId: string;
  memberId: string;
  companyId: string | null;
  differences: ReconciliationDifference[];
}

export interface ReconciliationResult {
  checked: number;
  matched: number;
  divergences: number;
}

export async function reconcileLocalSubscriptions(
  db: DbClient,
  fetchSubscription: SubscriptionFetcher,
): Promise<ReconciliationResult> {
  const localSubscriptions = await listAllSubscriptions(db);
  const result: ReconciliationResult = {
    checked: localSubscriptions.length,
    matched: 0,
    divergences: 0,
  };

  for (const local of localSubscriptions) {
    const differences = await compareWithStripe(local, fetchSubscription);

    if (differences.length === 0) {
      result.matched += 1;
      continue;
    }

    result.divergences += 1;
    await enqueueOutbox(db, BILLING_RECONCILIATION_ALERT_TOPIC, {
      stripeSubscriptionId: local.stripeSubscriptionId,
      memberId: local.memberId,
      companyId: local.companyId,
      differences,
    } satisfies ReconciliationAlertPayload);
  }

  return result;
}

async function compareWithStripe(
  local: AnySubscriptionRow,
  fetchSubscription: SubscriptionFetcher,
): Promise<ReconciliationDifference[]> {
  try {
    const stripe = await fetchSubscription(local.stripeSubscriptionId);
    return compareSubscription(local, stripe);
  } catch (error) {
    if (isResourceMissing(error)) {
      return local.status === "deleted"
        ? []
        : [
            {
              field: "status",
              local: local.status,
              stripe: "deleted",
            },
          ];
    }

    throw error;
  }
}

function compareSubscription(
  local: AnySubscriptionRow,
  stripe: Stripe.Subscription,
): ReconciliationDifference[] {
  const item = stripe.items.data[0];
  const stripeCustomerId =
    typeof stripe.customer === "string"
      ? stripe.customer
      : stripe.customer.deleted
        ? null
        : stripe.customer.id;

  const expected = {
    memberId: stripe.metadata.memberId || null,
    companyId: stripe.metadata.companyId || null,
    stripeCustomerId,
    status: stripe.status,
    priceId: item?.price?.id ?? "",
    currentPeriodStart: epochToSecondString(item?.current_period_start),
    currentPeriodEnd: epochToSecondString(item?.current_period_end),
    cancelAtPeriodEnd: stripe.cancel_at_period_end
      ? epochToSecondString(stripe.cancel_at)
      : null,
    canceledAt: epochToSecondString(stripe.canceled_at),
  };

  const actual = {
    memberId: local.memberId,
    companyId: local.companyId,
    stripeCustomerId: local.stripeCustomerId,
    status: local.status,
    priceId: local.priceId,
    currentPeriodStart: dateToSecondString(local.currentPeriodStart),
    currentPeriodEnd: dateToSecondString(local.currentPeriodEnd),
    cancelAtPeriodEnd: dateToSecondString(local.cancelAtPeriodEnd),
    canceledAt: dateToSecondString(local.canceledAt),
  };

  return diffFields([
    { field: "memberId", local: actual.memberId, stripe: expected.memberId },
    { field: "companyId", local: actual.companyId, stripe: expected.companyId },
    {
      field: "stripeCustomerId",
      local: actual.stripeCustomerId,
      stripe: expected.stripeCustomerId,
    },
    { field: "status", local: actual.status, stripe: expected.status },
    { field: "priceId", local: actual.priceId, stripe: expected.priceId },
    {
      field: "currentPeriodStart",
      local: actual.currentPeriodStart,
      stripe: expected.currentPeriodStart,
    },
    {
      field: "currentPeriodEnd",
      local: actual.currentPeriodEnd,
      stripe: expected.currentPeriodEnd,
    },
    {
      field: "cancelAtPeriodEnd",
      local: actual.cancelAtPeriodEnd,
      stripe: expected.cancelAtPeriodEnd,
    },
    {
      field: "canceledAt",
      local: actual.canceledAt,
      stripe: expected.canceledAt,
    },
  ]);
}

function diffFields(
  fields: ComparableSubscriptionField[],
): ReconciliationDifference[] {
  return fields
    .filter((field) => field.local !== field.stripe)
    .map((field) => ({
      field: field.field,
      local: field.local,
      stripe: field.stripe,
    }));
}

function epochToSecondString(value: number | null | undefined): string | null {
  if (!value) return null;
  return String(value);
}

function dateToSecondString(value: Date | null): string | null {
  if (!value) return null;
  return String(Math.floor(value.getTime() / 1000));
}

function isResourceMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}
