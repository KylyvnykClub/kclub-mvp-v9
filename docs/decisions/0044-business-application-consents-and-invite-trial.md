# 0044. A business applies with explicit consents; an invited business gets one free month from publication, then pays

> **Status:** Accepted
> **Date:** 2026-10-07
> **Deciders:** Client, Owner
> **Supersedes:** [ADR 0042](0042-member-invite-programme.md) §5 for new applications (a member's partner link waived the listing permanently), and the "a trial is rejected" part of [ADR 0037](0037-card-held-at-application.md)'s rationale, for the invite route only
> **Amends:** [ADR 0037](0037-card-held-at-application.md) (the public route keeps its hold and gains a consent gate)
> **Source:** the client's specification "KYLYVNYK CLUB — финальное краткое ТЗ v1.7" (2026-10-06)

## Context

The business application took the card with no explicit agreement. Submitting
the form counted as accepting the Terms and Privacy Policy. Nothing said who the
seller is, that the price renews monthly or how to cancel. Nothing recorded a
consent to future charges, and the Partner Rules and Refund Policy were never
shown. The client's specification makes these binding requirements, and
payment-authority law in the target markets (15 USC §8403 among them) expects
clear disclosure before billing information is taken and express consent to a
recurring charge.

Separately, a member's partner invite link waived the listing **forever**
(ADR 0042 §5). The client now wants one free calendar month counted from
publication, then $19.99 a month until cancelled. The card is saved at
application, without a charge.

## Decision

**1. Two routes, decided by the server at submit.**

|Route|How it is reached|Money|
|-|-|-|
|`public_hold`|Anyone, no invitation|ADR 0037 unchanged: $19.99 held at application, captured on approval, then monthly from the end of the paid month|
|`invite_trial`|Owner registered through a member's **partner** invite link whose invitation is unspent|Card saved with Checkout `mode=setup`; at approval a subscription starts with `trial_end` = publication + one calendar month (UTC, clamped to the month's last day); $19.99 monthly after|

The club's own partner link (ADR 0040) and the staff waiver (ADR 0041) are owner
decisions to list a business free. They are unchanged. So is every listing
already waived by an invite link: the client chose to keep those free.

The invitation is spent on the first application filed, as before. The
inviter's identity is not sent to Stripe (ADR 0009, data minimisation). It stays
in `invitations`.

**2. Consents are explicit, separate and recorded in full.** Before the Stripe
button, the form shows the seller (Kylyvnyk Consulting LLC) and its contact, the
price in USD with taxes included, auto-renewal, when payment starts, and how to
cancel. It then shows empty checkboxes:

1. Terms of Use and Partner Rules accepted, Refund Policy and Privacy Policy
   read (required).
2. Payment authority, worded per route (required).
3. Right to represent the business and permission to publish it (required).
4. Use in club advertising (optional).
5. For a resident of the EU/EEA, a request that the service begin before the
   14-day withdrawal period ends (optional; see 5).

Each ticked box writes a `consent_records` row with the full text shown in the
reader's language, a text version, the route, the company, the invitation link,
the UTC time, the country of residence, IP address and user agent. **The server
creates no Checkout session of either kind unless a payment-authority record
exists for that company and route.** Ticking a box in the browser is not enough,
and entering a card or accepting the Terms does not stand in for it.

**2a. Members too.** The same rule applies to membership: registration asks for
two empty boxes (the Terms with the arbitration clause and the Privacy Policy;
being 18 or older), and the server refuses an account without them. The dues
screen and the VIP button in Billing show the seller, renewal and cancellation
and ask for a payment authority. Its wording names the charge: both plans on
the dues screen, a new VIP subscription, or a switch from dues to VIP. No
membership or VIP Checkout, and no switch, happens without it, and it is
recorded in `consent_records` with no company.

**3. Access is still projected from Stripe (ADR 0004).** A `trialing` listing
subscription publishes the listing and opens the club to its partner exactly as
`active` does. That is the one place `trialing` grants anything. It is never a
paid listing for the invite matrix: a business in its free month does not give
free memberships (ADR 0042 §3). The setup session is projected from
`checkout.session.completed` and `setup_intent.succeeded` by re-reading the
session and SetupIntent from Stripe. The browser's return grants nothing.

**4. Cancelling.**

- Before approval, the owner can withdraw the application. A hold is released;
  nothing is charged.
- "Cancel auto-renewal" sets `cancel_at_period_end`. In the free month that
  ends the subscription at `trial_end` with no invoice and keeps the listing
  until then. That remaining free access is Stripe's own state, so nothing is
  kept locally. After payment it ends at the paid period's end.
- Hiding a listing (owner or staff) sets `cancel_at_period_end` too, so a hidden
  profile never bills forever.
- Cancelling a listing never touches a VIP subscription.

**5. EU/EEA consumers.** For a residence country in the EU or EEA, the form
explains the 14-day right of withdrawal and offers the early-start request
(box 5).

- **Without the request,** nothing is published, captured or started until 14
  days after the consent. The public route then saves the card (`mode=setup`)
  instead of holding it, because a hold would lapse first. The subscription
  starts at publication and the first month is charged then.
- **Within 14 days,** the owner sees "Withdraw from the contract". It cancels
  the subscription immediately, releases or refunds in full whatever was
  charged, withdraws the listing and confirms by email and on screen.
- Cancelling renewal is not the statutory withdrawal, and the screen says so.

**6. Events and emails.** New webhook events:

- `checkout.session.completed` and `setup_intent.succeeded` (card saved);
- `customer.subscription.trial_will_end` (our reminder email);
- `invoice.paid` (first real payment recorded; a $0 invoice is not one);
- `invoice.payment_action_required` (an email with Stripe's link);
- `invoice.finalization_failed` (logged).

Emails go out when the application is received (terms and route summary), at
publication (exact dates, amount, cancel link) and before the first charge.
Payment emails never depend on the advertising checkbox.

**7. Counters, staff-only:** invited businesses registered, approved, free month
activated, first real payment, active now.

## Rationale

`cancel_at_period_end` during a trial is the Stripe-native form of "cancel
without a final invoice, keep the rest of the free month". Using it keeps ADR
0004 intact: nothing about access lives outside the projection.

The legacy `trial_end` parameter is used rather than a Trial Offer. Trial
Offers need an API version newer than the one this integration runs, and the
specification allows `trial_end` for an existing integration. One mechanism is
used, never both.

A setup session rather than a $0 hold: the specification asks for no commercial
charge until the free month ends, and a SetupIntent is how Stripe saves a card
for later off-session use with the customer's authority recorded.

The 3-D Secure risk ADR 0036 and ADR 0019 named is accepted for this route. A
renewal that needs the cardholder sends `invoice.payment_action_required`, and
the member gets Stripe's hosted page by email. If it is not completed, the
subscription goes through the ordinary dunning path (FR-056).

## Consequences

**This makes easy:** every agreement the club relies on is a row with the words
the person saw, so support, a chargeback or a regulator gets the exact text.

**This makes hard:** consent texts are versioned content. Changing a word means
a new version, and the old rows keep the old words.

**We accept:** restoring a hidden listing does not resume its renewal. Hiding
set `cancel_at_period_end`, and the partner may have cancelled for their own
reasons before that. Turning billing back on without asking would charge
somebody who may have said no, so the restored listing runs to its period end.
The partner renews from the Stripe customer portal, which offers "Renew" for a
subscription scheduled to cancel.

We also accept that the tax line says "taxes included" because the client decided the
price is final. If the club registers for VAT/GST anywhere, the Stripe Price's
tax behaviour and this copy change together. The 6-year retention of consent
records is the longest limitation period among the target markets for contract
claims. It is set until a lawyer says otherwise.

## Revisit if

The club moves to Stripe Trial Offers (API upgrade with regression testing), or
the invite trial becomes longer than one month, or the club stops treating
listings as consumer purchases for EU residents.
