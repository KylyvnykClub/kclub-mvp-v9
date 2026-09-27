/**
 * What to do with a partner's held card payment, given where their application
 * stands (ADR 0037, FR-113…FR-116).
 *
 * Pure, and its own module, because every way this goes wrong costs somebody
 * money: a hold captured for a rejected business, two holds captured for one
 * listing, a listing published before Stripe has confirmed the money arrived.
 * The rule is small enough to state in one place and to test exhaustively, and
 * the code that talks to Stripe only carries out what this decides.
 *
 * Time arrives as an argument. An authorisation expires on the card network's
 * clock, and a test that cannot choose "now" cannot say what happens a minute
 * after it does.
 */

/** Everything the rules need to know about one hold. Mirrors `listing_holds`. */
export interface ListingHoldState {
  stripePaymentIntentId: string;
  /** The PaymentIntent's own status, verbatim. */
  status: string;
  captureBefore: Date | null;
  captureRequestedAt: Date | null;
  capturedAt: Date | null;
  coversUntil: Date | null;
  refundedAt: Date | null;
  stripeSubscriptionId: string | null;
  createdAt: Date;
}

/**
 * The statuses in which a PaymentIntent still holds money, or could still be
 * made to: cancelling any of them releases the card. `processing` is absent -
 * Stripe refuses to cancel a payment that is mid-flight - and so are the two
 * terminal states.
 */
const OPEN_STATUSES: readonly string[] = [
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
];

/** Whether the hold still reserves money, or could still be made to. */
export function holdIsOpen(hold: ListingHoldState): boolean {
  return OPEN_STATUSES.includes(hold.status);
}

/** Whether the hold is authorised and the authorisation has not lapsed. */
export function holdIsCapturable(hold: ListingHoldState, now: Date): boolean {
  if (hold.status !== "requires_capture") return false;
  return hold.captureBefore === null || hold.captureBefore > now;
}

/**
 * Whether this hold, captured, is what currently pays for the listing.
 *
 * Only a capture Stripe has confirmed counts: `captured_at` and `covers_until`
 * are written by the webhook projection, never by the approve button. A refund
 * takes it back.
 */
export function holdPaysForListing(hold: ListingHoldState, now: Date): boolean {
  return (
    hold.status === "succeeded" &&
    hold.refundedAt === null &&
    hold.capturedAt !== null &&
    hold.coversUntil !== null &&
    hold.coversUntil > now
  );
}

/**
 * The same instant one calendar month later, in UTC, with the day clamped to
 * the end of a shorter month - 31 January becomes 28 or 29 February, which is
 * how Stripe itself advances a monthly billing period.
 */
export function addOneMonth(date: Date): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

export type ListingHoldAction =
  /** Ask Stripe to take the authorised amount. Confirmation comes by webhook. */
  | { kind: "capture"; paymentIntentId: string }
  /** Release the authorisation; nothing is charged. */
  | { kind: "cancel"; paymentIntentId: string }
  /** Start the monthly subscription from the card this hold saved. */
  | { kind: "start_subscription"; paymentIntentId: string };

export interface ListingHoldSettlementInput {
  /** `null` when the company no longer exists. */
  moderationStatus: string | null;
  holds: readonly ListingHoldState[];
  /** An access-granting listing subscription already exists for the company. */
  listingSubscriptionActive: boolean;
  now: Date;
}

/**
 * The actions that bring a company's holds in line with its moderation status.
 *
 * Idempotent by construction: it describes the end state rather than a
 * transition, so running it twice - from the approve button and again from the
 * webhook that follows it, or from a retry after Stripe was unreachable - asks
 * for nothing the first run has not already asked for. The Stripe calls it
 * leads to carry idempotency keys derived from the PaymentIntent, so even a
 * repeated request is answered once.
 *
 * - **Rejected, or gone:** every open hold is released. Nothing is captured.
 * - **Pending:** at most one authorisation is kept on the card - the newest
 *   capturable one. A second checkout completed in another tab would otherwise
 *   hold the price twice for a week.
 * - **Approved:** if the listing is already paid for, open holds are
 *   duplicates and are released, and a confirmed capture with no subscription
 *   yet starts one. Otherwise exactly one capturable hold is captured - the one
 *   already asked for, if any, so a retry never captures a second - and every
 *   other authorisation is released.
 *
 * A hold only waiting for a card (`requires_payment_method` and the like) is
 * left alone while the application is live: Stripe Checkout retries a declined
 * card on the same PaymentIntent, and cancelling it would break the applicant's
 * second attempt. A rejection releases those too.
 */
export function planListingHoldSettlement(
  input: ListingHoldSettlementInput,
): ListingHoldAction[] {
  const { moderationStatus, holds, now } = input;
  const open = holds.filter((hold) => OPEN_STATUSES.includes(hold.status));
  const cancel = (hold: ListingHoldState): ListingHoldAction => ({
    kind: "cancel",
    paymentIntentId: hold.stripePaymentIntentId,
  });

  if (moderationStatus === null || moderationStatus === "rejected") {
    return open.map(cancel);
  }

  const authorised = open.filter((hold) => hold.status === "requires_capture");

  if (moderationStatus !== "approved") {
    // Pending, or any status added later: a decision not yet made. Nothing is
    // captured before a human has approved (FR-114).
    const keep = newestCapturable(authorised, now);
    return authorised
      .filter(
        (hold) => hold.stripePaymentIntentId !== keep?.stripePaymentIntentId,
      )
      .map(cancel);
  }

  const paying = holds.filter((hold) => holdPaysForListing(hold, now));

  if (input.listingSubscriptionActive || paying.length > 0) {
    const actions: ListingHoldAction[] = authorised.map(cancel);

    if (!input.listingSubscriptionActive) {
      // One subscription per listing. If two captures ever both succeeded,
      // the newest one is the one to bill from; the other is for a human.
      const latest = [...paying].sort(byNewest)[0];
      if (latest && latest.stripeSubscriptionId === null) {
        actions.push({
          kind: "start_subscription",
          paymentIntentId: latest.stripePaymentIntentId,
        });
      }
    }

    return actions;
  }

  // A capture already asked for and not yet confirmed is still the one to
  // capture: asking again is answered from Stripe's idempotency cache, whereas
  // choosing a different hold would charge the card twice.
  const inFlight = authorised.find(
    (hold) => hold.captureRequestedAt !== null && holdIsCapturable(hold, now),
  );
  const chosen = inFlight ?? newestCapturable(authorised, now);

  const actions: ListingHoldAction[] = [];
  if (chosen) {
    actions.push({
      kind: "capture",
      paymentIntentId: chosen.stripePaymentIntentId,
    });
  }
  for (const hold of authorised) {
    if (hold.stripePaymentIntentId !== chosen?.stripePaymentIntentId) {
      actions.push(cancel(hold));
    }
  }

  return actions;
}

function byNewest(a: ListingHoldState, b: ListingHoldState): number {
  return b.createdAt.getTime() - a.createdAt.getTime();
}

function newestCapturable(
  holds: readonly ListingHoldState[],
  now: Date,
): ListingHoldState | undefined {
  return holds.filter((hold) => holdIsCapturable(hold, now)).sort(byNewest)[0];
}

/**
 * Where a partner's payment stands, for the one screen they can see before
 * their listing is live (FR-110, FR-113).
 */
export type PartnerPaymentStanding =
  /** Application in review and nothing authorised yet: ask for the card. */
  | "authorise"
  /** In review, the price is held on the card and not charged. */
  | "held"
  /** Approved and capture asked for; waiting for Stripe to confirm it. */
  | "confirming"
  /** Approved but nothing capturable: ask for the card again (it is charged at once). */
  | "pay"
  /** Confirmed and paying for the listing. */
  | "paid"
  /** Refused. Nothing is charged; any hold is released. */
  | "rejected";

export function partnerPaymentStanding(input: {
  moderationStatus: string;
  holds: readonly ListingHoldState[];
  listingSubscriptionActive: boolean;
  now: Date;
}): PartnerPaymentStanding {
  const { moderationStatus, holds, now } = input;

  if (moderationStatus === "rejected") return "rejected";

  if (
    input.listingSubscriptionActive ||
    holds.some((hold) => holdPaysForListing(hold, now))
  ) {
    return "paid";
  }

  const capturable = holds.some((hold) => holdIsCapturable(hold, now));
  // Stripe is mid-capture. A captured hold whose paid month is over is not
  // settling - it is history, and the listing needs paying for again.
  const settling = holds.some((hold) => hold.status === "processing");

  if (moderationStatus === "approved") {
    return capturable || settling ? "confirming" : "pay";
  }

  return capturable || settling ? "held" : "authorise";
}
