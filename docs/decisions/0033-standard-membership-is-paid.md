# 0033. Standard membership costs $4.99 a month, and a join link waives it

> **Status:** Accepted
> **Date:** 2026-09-09
> **Deciders:** Client, Owner
> **Amends:** [0004](0004-stripe-billing-as-system-of-record.md), [0009](0009-referral-data-minimisation.md)

## Context

Membership has been free since the first line of this product was written.
`member` is described in [requirements.md §3](../requirements.md#3-users-and-roles) as the
"free tier", and the only thing sold to a member is the VIP subscription
(FR-050). Everything downstream assumes it: a registration ends on the profile
screen, a card is issued on the spot, and the catalogue opens to anyone who got
through the form.

The client has decided that standard membership is worth $4.99 a month and
should be charged for, and that the club will still let particular people in
free — guests of the owner, early partners, people it would be absurd to invoice
— through a private link handed out by hand and changed from time to time.

Two things constrain the answer, and both have been violated before by someone
building something reasonable:

- [ADR 0004](0004-stripe-billing-as-system-of-record.md): access is projected
  from Stripe webhooks as a fold over events. A member who has just returned
  from Checkout has not been granted anything by that return.
- [ADR 0009](0009-referral-data-minimisation.md) and
  [CLAUDE.md](../../CLAUDE.md): this product has no invitation mechanic, no
  referral code, no reward for bringing anyone in. A private link that lets a
  person in free is one small step from a link that credits whoever shared it,
  and that step is the one that turns the product into something it is
  deliberately not.

## Decision

**Standard membership is a monthly subscription at the price configured for the
`member_monthly` plan — $4.99 at launch — and a member who has not paid it
reaches nothing inside the member area but the screen that asks for it.
Registration through the club's current join link creates a member who is never
asked.**

- A member's row records **which of three kinds of membership they hold**:
  `paying`, `sponsored` (came in through the join link) or `legacy_free` (was
  already here). The column says who owes money. It never says whether they are
  paid up.
- **Whether a `paying` member has access is Stripe's answer, not ours.** It is
  read from the projected subscription rows, through the same status set that
  already decides the card tier, so a member in the 14-day grace window keeps
  access exactly as their card keeps its tier (FR-056).
- **Every member who existed before this change keeps free access permanently.**
  The migration marks them `legacy_free`; nothing later moves a row out of it
  except an owner acting deliberately from the console.
- **The join link is a door, not an invitation.** One secret at a time, held in
  `join_links`, rotated and revoked by the owner in the console. It carries no
  identity: it does not know who shared it, it credits nobody, it has no quota
  and no expiry, and using it earns the sharer nothing. A person who registers
  through it becomes `sponsored` and is charged nothing until an owner says
  otherwise.
- The secret from the URL is **never trusted at submit time**. Opening the link
  sets a short-lived signed cookie — the mechanism ADR 0029 already uses to
  carry a proved Google identity across the registration form — and the Server
  Action reads the cookie, server-side, when it creates the member.
- VIP is unchanged: still $19.99 a month, still a separate subscription, now
  reachable only by a member who is paid up on the standard one.

## Rationale

The alternative shapes were all worse in the same way: they put the answer to
"has this member paid" somewhere other than the Stripe projection.

Charging during registration — Checkout before the account exists — reads well
and fails badly: it either creates the account from the redirect, which ADR 0004
forbids outright, or it holds the applicant's password in a session until a
webhook arrives. Letting the account exist and holding it on one screen keeps
the money question entirely inside the billing module, and it means an
interrupted payment costs the applicant a page refresh rather than the whole
form.

Storing the join secret in clear is a real trade and is taken knowingly. It is a
shared password for a door, printed in a newsletter and read out on a call — not
a credential belonging to a person. The owner has to be able to read the current
one back in the console to hand it out, and a hash cannot be read back. The
protection that matters is that the secret is not an identity: knowing it makes
somebody a sponsored member and nothing else, and revoking it costs one click.

The word "invite" is refused deliberately. The mechanic here is a waiver of
dues, so the names are **membership dues**, **sponsored membership** and **join
link**. Anything that begins to credit the sharer — a code per member, a count,
a discount for bringing someone — is a different decision and needs its own
record, which is precisely the point of naming it this way now.

## Alternatives considered

|Option|Why not|
|-|-|
|Charge before the account exists|Either the redirect creates the member (forbidden by ADR 0004) or a half-registration lives in a session waiting for a webhook|
|Per-person invitation codes|An invite mechanic by any other name, and one attribute away from a referral programme this product refuses to be ([ADR 0009](0009-referral-data-minimisation.md))|
|A Stripe 100%-off coupon for sponsored members|Puts a free member inside the paid subscription machinery: dunning, grace windows, portal cancellation. A sponsored member has no subscription to cancel|
|A boolean `is_free` on the member|Cannot tell a member who was here before the rule from a member let in by the owner. The two are answered differently by support and reported differently to the client|
|Keep the secret hashed|The owner cannot read back the link they are meant to hand out, and the console screen becomes "rotate and hope you copied it"|

## Consequences

**This makes easy:** one place decides access (`membershipAccess`, a pure
function over the member row and their subscriptions), so the gate is one
redirect in the dashboard layout and one unit test file covering every
combination. Waiving dues for a person is a console action with an audit entry,
not a database edit.

**This makes hard:** registration no longer ends on the profile. Every screen
that assumed a member who is signed in is a member who is in — the card, the
catalogue, the company submission — now sits behind the gate, and the e2e and
accessibility harness has to seed a paid-up member rather than any member.

**We accept:** that a `paying` member sees a payment screen if Stripe is down at
the moment they register — the account exists, nothing is lost, and they pay
when it recovers. And that the join secret, being readable in the console and in
the database, will eventually be shared further than intended; the answer to
that is rotation, which is why rotation is one click and why nothing but
membership hangs on the secret.

## Revisit if

Sponsored membership stops being a handful of people and becomes a channel —
if the club starts wanting to know who brought whom, this record is the thing
standing in the way, and replacing it is a decision about becoming a referral
business, not a feature request.
