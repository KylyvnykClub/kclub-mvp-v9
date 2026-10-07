# 0043. VIP includes membership: one subscription at $19.99, not two

> **Status:** Accepted
> **Date:** 2026-10-07
> **Deciders:** Client, Owner
> **Amends:** [0033](0033-standard-membership-is-paid.md) (the VIP bullet of its decision)

## Context

ADR 0033 made standard membership a $4.99 subscription and left VIP as it was:
"still a separate subscription, now reachable only by a member who is paid up on
the standard one". A VIP member therefore paid two subscriptions, $24.98 a month.

The landing page and the pricing page sell "VIP — $19.99 / month". A visitor who
picked it registered, landed on the screen that asks for $4.99, and read the
result as the site switching them to the cheaper plan. The client tried it on a
phone and reported exactly that. The screen did explain that VIP came second,
but in a paragraph below the price, and a price that changes between two screens
is not fixed by a paragraph.

The client's answer is that the advertised price is the price: VIP costs $19.99
and includes everything standard membership gives.

## Decision

**VIP is membership with more in it. A `paying` member's dues are paid by an
access-granting subscription on either plan, `membership` or `vip`, and a member
holds one of the two, never both.**

- `membershipAccess` counts a VIP subscription as paid dues, through the same
  status set as everything else (FR-056's dunning window included). For
  sponsored, legacy and partner members nothing changes.
- The dues screen offers both plans side by side. A visitor who chose VIP
  arrives with `?plan=vip`, which puts the VIP button first and changes the
  subtitle. The parameter orders two buttons and grants nothing.
- A member already paying dues who chooses VIP is **not** sent to a second
  Checkout. Their subscription's price is switched to the VIP price, the
  prorated difference is invoiced at once, and `pending_if_incomplete` means
  Stripe applies the new price only once that invoice is paid. A card that needs
  the member (3-D Secure, a decline) is sent to Stripe's hosted invoice page.
- Nothing is granted by the action in either case. The projection resolves the
  plan from the subscription's price, as it already did, so the switched
  subscription becomes `vip` and the card tier follows when
  `customer.subscription.updated` is projected (ADR 0004).

## Rationale

The access rule had one line to change, and every gate already reads it
(`loadMembershipAccess`), so the price the visitor was shown and the price that
opens the club now agree without a second mechanism.

Switching the price on the existing subscription, rather than opening a VIP
subscription and cancelling dues, keeps "one member, one membership
subscription" true throughout: there is no moment with two charges and no window
in which a webhook-ordering problem cancels the wrong one. Stripe's proration
does the arithmetic and its pending update does the "only if paid".

## Alternatives considered

|Option|Why not|
|-|-|
|Keep $4.99 + $19.99 and explain it better|The client decided the advertised price is the price. Explaining a price that changes between two screens is a patch over the change|
|VIP checkout, then cancel dues from the webhook|An outbound Stripe call from the projection, two live charges for a moment, and a cancellation that must be idempotent and ordered against the VIP activation|
|One Checkout with both prices as line items|Still charges both, which is the thing being removed|

## Consequences

**This makes easy:** a VIP sign-up is one payment of the advertised amount, and
an upgrade is one click with no second subscription to manage.

**This makes hard:** a VIP member who cancels VIP is no longer a member either.
They land on the dues screen and can take standard membership there. Switching
VIP down to standard without that gap is left to the Stripe customer portal's
plan switching, if it is configured to offer it.

**We accept:** any member who already holds both subscriptions keeps paying both
until someone acts. Such members can only have arisen between ADR 0033 and this
record. They are found by listing members with access-granting `membership` and
`vip` rows at once; the console shows them as VIP. Their dues subscription
should be cancelled by hand from the Stripe dashboard.

## Revisit if

The club wants a VIP price that is not "membership and more" (VIP as an add-on
for sponsored members only, or a different price for upgraders). That is a
pricing decision about two products, and this record treats them as one.
