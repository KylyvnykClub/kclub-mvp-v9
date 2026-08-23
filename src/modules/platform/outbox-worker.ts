import type Stripe from "stripe";
import type { Db, DbClient } from "@/data/db";
import { findMemberByStripeCustomerId } from "@/data/billing";
import { findCompanyById } from "@/data/companies";
import { findMemberLanguage } from "@/data/members";
import { drainOutbox, markProcessed } from "@/data/outbox";
import {
  BILLING_OUTBOX_TOPIC,
  BILLING_NOTIFICATION_TOPIC,
  reconcileSubscription,
  type SubscriptionFetcher,
} from "@/modules/billing/projection";
import {
  BILLING_RECONCILIATION_ALERT_TOPIC,
  type ReconciliationAlertPayload,
} from "@/modules/billing/reconciliation";
import {
  COMPANY_MODERATION_TOPIC,
  type CompanyModerationPayload,
} from "@/modules/moderation/outbox";

/**
 * The Stripe client, the connection and the email sender are all reached
 * through dynamic imports rather than at module scope, because every one of
 * them reads `@/env` and would otherwise make this module impossible to import
 * in a test that has no secrets. Nothing about production changes: the first
 * drain pays one module resolution.
 */
let stripeClient: Stripe | undefined;

async function getStripe(): Promise<Stripe> {
  if (!stripeClient) {
    const [{ default: Stripe }, { env }] = await Promise.all([
      import("stripe"),
      import("@/env"),
    ]);
    stripeClient = new Stripe(env.server.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/** The scheduled sweep takes a full batch; the inline drain takes what it wrote. */
export const CRON_BATCH_SIZE = 25;
export const INLINE_BATCH_SIZE = 5;

interface SubscriptionSyncPayload {
  eventId?: string;
  eventCreated?: number;
  subscriptionId?: string;
}

interface NotificationPayload {
  type?: string;
  subscriptionId?: string;
  customerId?: string;
  attemptCount?: number;
}

/**
 * The database and the Stripe reader, injected so the drain can be exercised
 * against the integration harness's own driver and a fixture fetcher rather
 * than against production Neon and the live Stripe API.
 */
export interface DrainDeps {
  db: Db;
  fetchSubscription: SubscriptionFetcher;
}

/** The real connection and the real Stripe reader, resolved on first use. */
export async function productionDrainDeps(): Promise<DrainDeps> {
  const [{ db }, stripe] = await Promise.all([
    import("@/data/db"),
    getStripe(),
  ]);
  return { db, fetchSubscription: stripe.subscriptions.retrieve.bind(stripe) };
}

/** Result of the drain, for observability. */
export interface DrainResult {
  drained: number;
  processed: number;
  stale: number;
  deleted: number;
  notified: number;
  alerted: number;
  failed: number;
}

/**
 * The projection worker for ADR 0004, called from two places: the scheduled
 * sweep at `/api/cron/outbox-drain`, and — since ADR 0017 — the Stripe webhook
 * itself, from an `after()` callback that runs once the 200 is already on the
 * wire. The webhook still does nothing but verify, insert and enqueue *before*
 * responding, which is the property integration.md §4's contract is protecting.
 *
 * The whole drain runs in one transaction. `drainOutbox` selects
 * `FOR UPDATE SKIP LOCKED`, and that lock only means anything for as long as a
 * transaction holds it — outside one it is released microseconds later, long
 * before the row is marked processed. That was harmless while exactly one drain
 * ran per day and stopped being harmless the moment every webhook started one.
 *
 * A row that fails is left unprocessed for the next drain, and a failure is
 * caught per row so that one poisoned payload cannot roll back the rows that
 * succeeded beside it.
 */
export async function runOutboxDrain(
  batchSize: number,
  injected?: DrainDeps,
): Promise<DrainResult> {
  const deps = injected ?? (await productionDrainDeps());

  return deps.db.transaction(async (tx) => {
    const entries = await drainOutbox(tx, batchSize);
    const result: DrainResult = {
      drained: entries.length,
      processed: 0,
      stale: 0,
      deleted: 0,
      notified: 0,
      alerted: 0,
      failed: 0,
    };

    for (const entry of entries) {
      if (entry.topic === BILLING_RECONCILIATION_ALERT_TOPIC) {
        processReconciliationAlert(entry.payload as ReconciliationAlertPayload);
        result.alerted += 1;
        await markProcessed(tx, entry.id);
        continue;
      }

      if (entry.topic === BILLING_NOTIFICATION_TOPIC) {
        try {
          await processNotification(tx, entry.payload as NotificationPayload);
          result.notified += 1;
          await markProcessed(tx, entry.id);
        } catch (error) {
          result.failed += 1;
          const message =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`[billing-notification] failed: ${message}`);
        }
        continue;
      }

      if (entry.topic === COMPANY_MODERATION_TOPIC) {
        try {
          await processCompanyModeration(
            tx,
            entry.payload as CompanyModerationPayload,
          );
          result.notified += 1;
          await markProcessed(tx, entry.id);
        } catch (error) {
          result.failed += 1;
          const message =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`[company-moderation] notification failed: ${message}`);
        }
        continue;
      }

      if (entry.topic !== BILLING_OUTBOX_TOPIC) {
        await markProcessed(tx, entry.id);
        continue;
      }

      const payload = entry.payload as SubscriptionSyncPayload;
      const subscriptionId = payload.subscriptionId;
      const eventCreated = payload.eventCreated;

      if (!subscriptionId || !eventCreated) {
        result.failed += 1;
        continue;
      }

      try {
        const outcome = await reconcileSubscription(
          tx,
          deps.fetchSubscription,
          subscriptionId,
          eventCreated,
        );
        if (outcome === "stale") result.stale += 1;
        else if (outcome === "deleted") result.deleted += 1;
        else result.processed += 1;
        await markProcessed(tx, entry.id);
      } catch (error) {
        result.failed += 1;
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[billing-projection] failed for subscription ${subscriptionId}: ${message}`,
        );
      }
    }

    return result;
  });
}

function processReconciliationAlert(payload: ReconciliationAlertPayload): void {
  console.error(
    `[billing-reconciliation] divergence for ${payload.stripeSubscriptionId}: ${payload.differences
      .map(
        (d) =>
          `${d.field} local=${d.local ?? "<null>"} stripe=${d.stripe ?? "<null>"}`,
      )
      .join(", ")}`,
  );
}

async function processNotification(
  client: DbClient,
  payload: NotificationPayload,
): Promise<void> {
  if (payload.type !== "payment_failed" || !payload.customerId) return;

  const member = await findMemberByStripeCustomerId(client, payload.customerId);
  if (!member) {
    console.warn(
      `[billing-notification] no member found for customer ${payload.customerId}`,
    );
    return;
  }

  // Look up email from the Stripe customer — members table has no email column.
  const stripe = await getStripe();
  const customer = await stripe.customers.retrieve(payload.customerId);
  if (customer.deleted || !customer.email) {
    console.warn(
      `[billing-notification] no email for customer ${payload.customerId}`,
    );
    return;
  }

  const locale = (
    ["en", "ru", "uk"].includes(member.language) ? member.language : "en"
  ) as "en" | "ru" | "uk";

  const { sendPaymentFailedEmail } =
    await import("@/modules/notifications/email");

  await sendPaymentFailedEmail({
    to: customer.email,
    displayName: member.displayName,
    locale,
  });
}

async function processCompanyModeration(
  client: DbClient,
  payload: CompanyModerationPayload,
): Promise<void> {
  if (!payload.companyId || !payload.status) return;

  const company = await findCompanyById(client, payload.companyId);
  if (!company || !company.contactEmail) {
    console.warn(
      `[company-moderation] no company or contact email for ${payload.companyId}`,
    );
    return;
  }

  const ownerLanguage = await findMemberLanguage(client, company.ownerId);

  const locale = (
    ownerLanguage && ["en", "ru", "uk"].includes(ownerLanguage)
      ? ownerLanguage
      : "en"
  ) as "en" | "ru" | "uk";

  const { sendCompanyApprovedEmail, sendCompanyRejectedEmail } =
    await import("@/modules/notifications/email");

  if (payload.status === "approved") {
    await sendCompanyApprovedEmail({
      to: company.contactEmail,
      companyName: company.name,
      locale,
    });
  } else if (payload.status === "rejected") {
    await sendCompanyRejectedEmail({
      to: company.contactEmail,
      companyName: company.name,
      reason: payload.reason ?? "Not specified",
      locale,
    });
  }
}
