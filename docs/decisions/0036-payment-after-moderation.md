# 0036. A business partner registers on one page, and pays after moderation

> **Status:** Accepted
> **Date:** 2026-09-24
> **Deciders:** Launch owner
> **Supersedes:** [ADR 0019](0019-payment-before-moderation.md)

## Context

Three complaints arrived together, from the person running the club rather than
from an engineer, and they turn out to be one problem seen from three sides.

**"Clicking Business throws you at the member sign-up."** It did. The Business
card on the landing page and the listing plan on `/pricing` both pointed at
`/register`, which is member registration. A business that clicked it was asked
for a display name and a country, landed on the $4.99 dues screen, and only from
there — past a gate that refuses every other member surface (FR-103) — could
reach a four-step company form it had never been told about. The card for a
signed-in member pointed at `/dashboard/company`, which is not a route; it
returned a 404.

**"Make it one page, and ask for the category before the description."** The
form was four steps with a review panel restating answers that had been on
screen a moment earlier, and it asked what the business _says about itself_
before asking what it _is_. An applicant who writes the description first picks
whichever category is nearest afterwards, and the catalogue is only as good as
that choice.

**"Money must not be taken until a human has checked the business."** That is
exactly the order [ADR 0019](0019-payment-before-moderation.md) reversed a month
ago. Submission handed straight off to Stripe Checkout; a `pending` company was
eligible to pay, and a rejection had to cancel the subscription and refund the
last invoice. The funnel argument for it was real — intent peaks at the last
field of the form — and it was made without the owner's view of what a refund
costs in trust.

The three are one problem because they share a cause: **a business partner was
modelled as a member who happens to own a company.** Everything followed from
that. If a partner is a member, they must pay dues before seeing anything; if
they must pay dues, the application lives behind the dues gate; if the
application lives behind the gate, it cannot be the thing the landing page links
to; and if payment is what opens the door, it has to happen before the door is
reached.

## Decision

**A business partner is its own kind of account.** `members.dues_kind` gains a
fourth value, `partner`, written by the partner application and by nothing else.

1. **One page, public.** `/{locale}/partner` asks what the business is, what it
   says about itself, what it offers, where it operates, and finally for the
   account details. One submit creates the account and files the application.
2. **Category before description**, on that page and on the dashboard form,
   which is now also one page and shares its fields.
3. **A partner owes no membership dues.** What opens the club for them is an
   active listing subscription, read from the same projected Stripe rows as
   every other entitlement. Before it is paid they reach one screen, and that
   screen shows where their application stands.
4. **Nothing is charged before approval.** `createCheckoutSessionAction`
   requires `moderation_status = 'approved'`. The approval notice — inbox and
   email — carries the link that pays.
5. **A refused registration re-challenges.** A Turnstile token is single-use, so
   the widget is reset after every refusal (FR-112). This is not part of the
   partner funnel; it is the bug that made registration "work every other time",
   and it is recorded here because it was found while fixing the funnel.

## Rationale

**The dues gate was never about partners.** [ADR 0033](0033-standard-membership-is-paid.md)
made standard membership paid so that the club's members pay to be in the club.
A business paying $19.99 a month to be listed is already in a paid relationship;
charging it $4.99 on top to reach the form that sells the $19.99 is a toll
booth in front of a shop. The owner's instruction — "the business pays no $4.99,
only the $19.99, and then everything is open" — is both simpler and what the
pricing page has said all along, where the three plans are presented as
alternatives rather than as a stack.

**An unpaid partner is held outside, not let in free.** The tempting shortcut is
to exempt partners from the gate entirely, which would hand a free membership
card to anyone who files an application. Instead the same two-state rule applies
with a different subscription behind it: `listing` for a partner, `membership`
for a member. Money and access still agree in both directions
([ADR 0004](0004-stripe-billing-as-system-of-record.md)), and the screen a
partner is held at is useful rather than a wall — it is where their application's
outcome and its payment button live.

**Reversing ADR 0019 costs the funnel argument and buys the refund back.** ADR
0019 was right that intent peaks at the last field, and that a payment asked for
days later is a payment often never made. What it traded away was the absence of
refunds, and it said so plainly: _"that is not a detail to leave to operational
discipline."_ The owner has now priced that trade from the other side. A refund
on a rejected application is not a bookkeeping entry; it is a business that paid
us, was refused, and is waiting 5–10 business days for its money — and it is the
version of this product that generates complaints and chargebacks. The funnel
loss is mitigated rather than ignored: moderation is 1–3 business days, the
approval arrives in the inbox and by email with the payment link in it, and the
application itself is now materially cheaper to complete than the four-step form
it replaces.

**ADR 0019's own revisit conditions are met.** It named three, and one of them is
"if moderation latency drops to minutes rather than days the old order costs
nothing". The opposite also holds and is what happened: the owner judged the
refund obligation material before any volume was processed, which is the cheapest
moment to judge it.

**Charging after approval is not the same as the alternative ADR 0019 rejected.**
That alternative was capturing card details up front with a `setup_intent` and
charging on approval — more machinery, a deferred charge that can fail long after
the card was taken, and a new failure mode where an approved company is
un-chargeable. It was offered again here and declined: the owner asked for the
card not to be requested at all until the outcome is known.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep partners as ordinary members and exempt `/dashboard/company/new` from the dues gate|The narrowest possible change, and it leaves the model wrong: a partner still has a membership they did not ask for, still sees a dues screen everywhere else, and the exemption is a hole in FR-103 that the next surface added under `(dashboard)` will have to remember|
|Exempt a partner from the gate entirely|A free membership card for anyone who files an application. The card is the product; giving it away for an unreviewed form submission is the leak, and moderation closing it days later is not a control|
|Let the listing subscription also count as membership dues for an ordinary member|Blurs the two plans in the projection and makes "what am I paying for" unanswerable in the portal. A partner is a partner; a member who also owns a company is still a member and still pays dues|
|Capture the card at submission, charge on approval (ADR 0019's alternative 2)|Materially more machinery for a benefit the owner did not ask for. Explicitly declined: "the card is not requested at all until it is approved"|
|Two forms — keep the four-step dashboard form and add a one-page public one|Eighteen fields duplicated, and the copy that drifts is always the one with the validation in it. The fields are one component used by both|

## Consequences

**This makes easy:** telling a business the truth on one screen — what it costs,
when it is charged, and that nothing has been. Rejection becomes a pure database
write again in the ordinary case. The landing page's Business card leads to the
thing it advertises.

**This makes hard:** the moment of intent. A business that files an application
and does not come back when the approval arrives is a business we lost, and the
only instruments we have are the inbox row, the email and the moderation
turnaround. Worth measuring: the share of approved applications that are never
paid for.

**We accept:**

- A partner whose application is refused, or who never files one, holds an
  account that reaches exactly one screen. That is the honest state — they are
  not in the club — but it is an account, and it is subject to the same
  retention and erasure rules as any other.
- The refund path stays. It is no longer the ordinary case, but a company that
  paid under ADR 0019, and an approved-and-paid listing that is rejected later,
  both still need it. `nothing_to_refund` is now the usual answer.
- A partner cannot add photos between submission and payment. They are attached
  during the application; afterwards the owner's screens are behind the listing.
- The paid/unpaid indicator in the moderation queue changes meaning: every row
  awaiting judgement is unpaid by design, so it now marks approved listings that
  have gone live rather than distinguishing serious applicants from abandoned
  checkouts.

## Revisit if

- The share of approved applications that are never paid for exceeds roughly a
  quarter. At that point the funnel cost of this decision is real money and
  ADR 0019's alternative 2 — card captured up front, charged on approval — starts
  paying for its own complexity.
- Moderation turnaround slips past 3 business days at p90 (FR-048). The whole
  mitigation here is that the gap between intent and the ask stays short.
- A partner asks to be a club member as well. Nothing in this record forbids it,
  but the projection would then have to grant membership from two subscriptions,
  which is a different rule from the one written here.
