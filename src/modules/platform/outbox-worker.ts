import type Stripe from "stripe";
import type { Db, DbClient } from "@/data/db";
import { findMemberByStripeCustomerId } from "@/data/billing";
import { findCompanyById } from "@/data/companies";
import { findMemberLanguage } from "@/data/members";
import { createNotification } from "@/data/notifications";
import {
  BILLING_REFUND_RETRY_TOPIC,
  GRACE_EXPIRY_WARNING_NOTIFICATION,
  PAYMENT_FAILED_NOTIFICATION,
  claimOutboxRow,
  drainOutbox,
  markProcessed,
  type OutboxEntry,
} from "@/data/outbox";
import {
  BILLING_OUTBOX_TOPIC,
  BILLING_NOTIFICATION_TOPIC,
  reconcileSubscription,
  type ProjectionResult,
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

/**
 * Flat and entirely optional on purpose: this arrives from a `jsonb` column and
 * nothing validates it at runtime, so a discriminated union would imply a
 * guarantee the row does not carry.
 */
interface NotificationPayload {
  type?: string;
  subscriptionId?: string;
  customerId?: string;
  memberId?: string;
  attemptCount?: number;
  graceEndsAt?: string;
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
 * **One transaction per row, not one per batch.** `drainOutbox` selects
 * `FOR UPDATE SKIP LOCKED`, and that lock only means anything for as long as a
 * transaction holds it — outside one it is released microseconds later, long
 * before the row is marked processed. That was harmless while exactly one drain
 * ran per day and stopped being harmless the moment every webhook started one.
 *
 * Wrapping the whole batch instead would fix the lock and break something else:
 * one SQL error puts Postgres into `aborted`, a JavaScript `catch` cannot undo
 * that, and the commit at the end of the batch degrades to a rollback — so rows
 * whose emails had already been sent lose their `processed_at` and are sent
 * again on the next drain. A per-row transaction keeps the lock meaningful and
 * confines a failure to the row that caused it.
 *
 * In practice that abort takes an infrastructure failure — a dropped
 * connection, a statement timeout — rather than bad data, because
 * `foldSubscription` wraps its own writes in a nested transaction and a
 * constraint violation there is rolled back to that savepoint. No test reaches
 * it; this shape is defensive, and cheap.
 *
 * A row that fails is left unprocessed for the next drain, which is also what
 * happens if the invocation is killed mid-row: the transaction never commits,
 * so the work is retried rather than lost. That is the right way round for
 * entitlements — the fold is idempotent, so a repeat is free, while a loss is
 * money and access disagreeing.
 *
 * The Stripe and Resend calls still happen inside their row's transaction,
 * which holds one pool connection for the length of a round trip. Bounded and
 * acceptable at this volume; the way out is a claim column, which needs a
 * migration (backlog `outbox-has-no-retention-and-no-payload-index`).
 */
export async function runOutboxDrain(
  batchSize: number,
  injected?: DrainDeps,
): Promise<DrainResult> {
  const deps = injected ?? (await productionDrainDeps());

  const result: DrainResult = {
    drained: 0,
    processed: 0,
    stale: 0,
    deleted: 0,
    notified: 0,
    alerted: 0,
    failed: 0,
  };

  // Candidates first, outside any transaction. Listing and taking are separate
  // steps so that a row which fails cannot be re-selected by the next
  // iteration and starve the rest of the batch behind it.
  const candidates = await drainOutbox(deps.db, batchSize);

  for (const candidate of candidates) {
    try {
      const outcome = await deps.db.transaction(async (tx) => {
        const entry = await claimOutboxRow(tx, candidate.id);
        if (!entry) return "taken-by-another";

        return handleEntry(tx, entry, deps);
      });

      if (outcome === "taken-by-another") continue;

      result.drained += 1;
      if (outcome === "alerted") result.alerted += 1;
      else if (outcome === "notified") result.notified += 1;
      else if (outcome === "stale") result.stale += 1;
      else if (outcome === "deleted") result.deleted += 1;
      else if (outcome === "applied") result.processed += 1;
      else if (outcome === "malformed") result.failed += 1;
    } catch (error) {
      // The transaction rolled back, so this row keeps its null processed_at
      // and the next drain will try it again. Its siblings are already
      // committed and are not touched by it.
      result.drained += 1;
      result.failed += 1;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[outbox-drain] failed for row ${candidate.id} on topic ${candidate.topic}: ${message}`,
      );
    }
  }

  return result;
}

type EntryOutcome =
  | "alerted"
  | "notified"
  | "ignored"
  | "malformed"
  | "taken-by-another"
  | ProjectionResult;

/**
 * Handle exactly one outbox row inside its own transaction. Throwing is how a
 * row asks to be retried: the transaction rolls back and `processed_at` stays
 * null.
 */
async function handleEntry(
  tx: DbClient,
  entry: OutboxEntry,
  deps: DrainDeps,
): Promise<EntryOutcome> {
  if (entry.topic === BILLING_RECONCILIATION_ALERT_TOPIC) {
    processReconciliationAlert(entry.payload as ReconciliationAlertPayload);
    await markProcessed(tx, entry.id);
    return "alerted";
  }

  if (entry.topic === BILLING_NOTIFICATION_TOPIC) {
    await processNotification(tx, entry.payload as NotificationPayload);
    await markProcessed(tx, entry.id);
    return "notified";
  }

  if (entry.topic === COMPANY_MODERATION_TOPIC) {
    await processCompanyModeration(
      tx,
      entry.payload as CompanyModerationPayload,
    );
    await markProcessed(tx, entry.id);
    return "notified";
  }

  if (entry.topic === BILLING_REFUND_RETRY_TOPIC) {
    // The rejection already committed; this is the money half retrying after
    // Stripe was unreachable (ADR 0019). Throwing leaves processed_at null, so
    // a still-unreachable Stripe simply gets tried again next drain.
    const { companyId } = entry.payload as { companyId?: string };
    if (!companyId) {
      console.error(`[listing-refund] outbox row ${entry.id} has no companyId`);
      await markProcessed(tx, entry.id);
      return "malformed";
    }

    const { refundListingForCompany, productionRefundDeps } =
      await import("@/modules/billing/refund");
    await refundListingForCompany(tx, await productionRefundDeps(), companyId);
    await markProcessed(tx, entry.id);
    return "notified";
  }

  if (entry.topic !== BILLING_OUTBOX_TOPIC) {
    await markProcessed(tx, entry.id);
    return "ignored";
  }

  const payload = entry.payload as SubscriptionSyncPayload;
  const subscriptionId = payload.subscriptionId;
  const eventCreated = payload.eventCreated;

  if (!subscriptionId || !eventCreated) {
    // Not retryable: no later drain will find the missing fields. Marked
    // processed so it cannot be re-selected forever, and counted as failed so
    // it is visible in the cron response.
    console.error(
      `[billing-projection] outbox row ${entry.id} has no subscriptionId or eventCreated`,
    );
    await markProcessed(tx, entry.id);
    return "malformed";
  }

  const outcome = await reconcileSubscription(
    tx,
    deps.fetchSubscription,
    subscriptionId,
    eventCreated,
  );
  await markProcessed(tx, entry.id);
  return outcome;
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

interface Recipient {
  email: string;
  displayName: string;
  locale: "en" | "ru" | "uk";
}

/**
 * Resolve who to write to. The email comes from the Stripe customer, not from
 * us — the members table has no email column — so a deleted customer or one
 * without an address is unrecoverable here rather than retryable.
 */
async function resolveRecipient(
  client: DbClient,
  customerId: string,
): Promise<Recipient | null> {
  const member = await findMemberByStripeCustomerId(client, customerId);
  if (!member) {
    console.warn(
      `[billing-notification] no member found for customer ${customerId}`,
    );
    return null;
  }

  const stripe = await getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted || !customer.email) {
    console.warn(`[billing-notification] no email for customer ${customerId}`);
    return null;
  }

  const locale = (
    ["en", "ru", "uk"].includes(member.language) ? member.language : "en"
  ) as "en" | "ru" | "uk";

  return {
    email: customer.email,
    displayName: member.displayName,
    locale,
  };
}

/**
 * The two halves of FR-056's notification requirement: the failure notice from
 * the `invoice.payment_failed` webhook, and the warning before the grace period
 * ends from the daily sweep.
 *
 * The default branch warns rather than throwing, deliberately. `runOutboxDrain`
 * leaves a failed row unprocessed for the next drain, and a row whose type
 * nobody handles never gets better — throwing would make it immortal, and since
 * ADR 0017 every Stripe webhook starts a drain that would re-select it, so it
 * would eventually crowd out live rows. Warn, mark processed, move on.
 */
async function processNotification(
  client: DbClient,
  payload: NotificationPayload,
): Promise<void> {
  if (!payload.customerId) {
    console.warn(
      `[billing-notification] no customer on a ${payload.type ?? "typeless"} row`,
    );
    return;
  }

  if (
    payload.type !== PAYMENT_FAILED_NOTIFICATION &&
    payload.type !== GRACE_EXPIRY_WARNING_NOTIFICATION
  ) {
    console.warn(
      `[billing-notification] unhandled notification type: ${payload.type ?? "<none>"}`,
    );
    return;
  }

  // The inbox row is written from the member lookup alone, before and
  // independently of the email (ADR 0020). `resolveRecipient` returns null when
  // Stripe holds no email address - and a member with no email is precisely the
  // one for whom in-product state has to be authoritative, so writing the row
  // only on the email path would drop it exactly where it matters most.
  const member = await findMemberByStripeCustomerId(client, payload.customerId);
  if (member) {
    await createNotification(client, {
      memberId: member.memberId,
      kind:
        payload.type === PAYMENT_FAILED_NOTIFICATION
          ? "payment_failed"
          : "grace_expiry_warning",
      params: {
        ...(payload.subscriptionId
          ? { subscriptionId: payload.subscriptionId }
          : {}),
        ...(payload.graceEndsAt ? { graceEndsAt: payload.graceEndsAt } : {}),
      },
      // A redelivered webhook carries the same attempt and is suppressed; a
      // genuinely later retry carries a new one and gets its own row.
      dedupeKey: [
        payload.type,
        payload.subscriptionId ?? payload.customerId,
        payload.attemptCount ?? payload.graceEndsAt ?? "",
      ].join(":"),
    });
  }

  const recipient = await resolveRecipient(client, payload.customerId);
  if (!recipient) return;

  if (payload.type === PAYMENT_FAILED_NOTIFICATION) {
    const { sendPaymentFailedEmail } =
      await import("@/modules/notifications/email");
    await sendPaymentFailedEmail({
      to: recipient.email,
      displayName: recipient.displayName,
      locale: recipient.locale,
    });
    return;
  }

  const { sendGraceExpiryWarningEmail } =
    await import("@/modules/notifications/email");
  await sendGraceExpiryWarningEmail({
    to: recipient.email,
    displayName: recipient.displayName,
    locale: recipient.locale,
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
