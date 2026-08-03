# Project Brief

> **Status:** In review
> **Owner:** _(fill in)_
> **Last updated:** 2026-08-02
> **Write when:** before the first line of code. This is the only document
> required to start.

One page. If it cannot be filled in, the project is not ready for code — and
that is the most useful thing this document will ever tell you.

Everything else in `docs/` expands on a section of this page. Keep it short
enough that it is actually re-read; move detail out rather than growing it.

---

## The problem

When you need a lawyer, a realtor, a doctor or a contractor in a country you
did not grow up in, you search the open internet and get strangers, paid
placements and a real chance of being cheated. The people who could vouch for
someone good are exactly the people you do not know yet. Existing directories
solve discovery, not trust — anyone can list, anyone can review, and nothing is
verified.

## Who it is for

Internationally mobile professionals and small-business owners, primarily in
the United States, who already operate through personal referral networks and
want that network to be larger and still trustworthy. They are willing to be
verified themselves in exchange for being among verified people.

## What success looks like

**By 2027-03-31: 400 paying subscriptions in force** — measured as the sum of
active VIP member subscriptions and active partner listing subscriptions on the
last day of the month, at $19.99 each (~$8,000 MRR).

Leading indicators, tracked weekly from launch:

- 60% of verified members open the catalogue at least once in their first week
- Partner applications approved within 3 business days, 90th percentile
- Under 5% involuntary churn (failed payments not recovered within 14 days)

## What we are deliberately not building

- **A member directory.** Members cannot search for, browse, or be listed to
  other members. This is the product's core promise, not a missing feature.
- **A marketplace.** We do not take payment for partner services, hold funds,
  escrow, or arbitrate disputes between a member and a partner. We charge for
  membership and for listing, nothing else.
- **A rating or review system.** Reviews on the marketing site are curated
  testimonials, not user-generated content. Ratings invite exactly the gaming
  and retaliation dynamics the club exists to avoid.
- **Any referral-for-reward mechanic.** No affiliate links, no commission on a
  referred client, no multi-level structure, no invite quotas. The product must
  be structurally incapable of being read as MLM — see
  [requirements.md §2](requirements.md#2-scope).
- **A native mobile application.** A responsive web application, installable as
  a PWA, covers the phone use case at a fraction of the cost.
- **Public partner profile pages.** Catalogue entries are visible only to
  authenticated members; the marketing site shows a curated showcase only.
- **Email/password or social sign-in.** Phone plus SMS one-time code only, at
  the customer's explicit direction.

## Approach

A single Next.js application (marketing site, member area and staff console in
one deployment) on Vercel, with PostgreSQL on Neon as the only source of truth.
Identity is self-hosted — phone number plus password plus SMS one-time code via
Twilio Verify — because outsourcing the member table contradicts the privacy
promise. Subscriptions run on Stripe Billing; entitlements inside the product
are derived from Stripe webhooks, never from a client-side redirect. Detail in
[technology.md](technology.md) and [architecture.md](architecture.md).

## Biggest risk

**Risk:** The cold-start problem. Members join for a catalogue of good
partners; partners pay to reach a body of members. On day one neither exists,
and a thin catalogue makes the $19.99 VIP subscription indefensible — the club
looks empty rather than exclusive.

**What we will do about it:** Treat the first 100 partners as a manual,
founder-led sales effort, not a product problem, and launch the catalogue only
once ~50 partners across the top five categories are published. The product
supports this by making partner onboarding a four-step form that a founder can
complete on a partner's behalf in under five minutes, and by making basic
membership free so member supply is never gated on partner supply. Commercially:
partner listing revenue is not counted on before month three.

A second risk is regulatory rather than commercial: the "refer a client"
feature transmits a third party's contact details between two businesses. That
is personal data about someone who is not our user. It is designed around in
[security.md §8](security.md#8-compliance) and
[decisions/0009-referral-data-minimisation.md](decisions/0009-referral-data-minimisation.md) —
but the club's published Business Introduction Rules do not currently authorise
it, which is the blocking issue in
[legal-alignment.md](legal-alignment.md#c-02-business-introductions-and-client-referrals-are-two-different-features-and-only-one-is-designed).

## First milestone

**Deliverable:** Private beta — phone sign-up with SMS verification, digital
membership card with a working QR verification page, browsable catalogue seeded
with 30 hand-onboarded partners, and Stripe VIP checkout. English only. No
referrals, no staff console beyond a moderation queue.

**By:** 2026-10-09 _(week 10 of the plan in
[requirements.md §6](requirements.md#6-constraints); confirm at kick-off)_

---

## Open questions

Three questions here were answered by the legal pack the client supplied in
[policy/](policy/) — the operating entity, the refund policy and the prohibited
categories. The pack also opened a larger set of its own, which are tracked in
[legal-alignment.md](legal-alignment.md); two of those (closed chats, and
whether the club accepts EU members at all) are bigger than anything below.

|Question|Owner|Needed by|
|-|-|-|
|Is the club's operator prepared to be the data controller for EU members' personal data? The legal pack addresses CCPA/CPRA only and has no GDPR section at all — see [legal-alignment.md](legal-alignment.md#c-06-gdpr-is-absent-from-the-legal-pack)|Client + counsel|Before the first EU sign-up|
|Account recovery when a member loses their phone number: what identity proof does support accept? Phone-only sign-in has no other recovery path.|Client + tech lead|Before public launch|
|Who owns day-two operations — the client's team or a retained engineer? Determines the on-call model in [reliability.md §7](reliability.md#7-incident-process).|Client|Before public launch|
|Does becoming a partner require a VIP subscription in addition to the listing fee? The Club Rules imply it; the brief does not. It doubles the cost of being a partner — see [legal-alignment.md](legal-alignment.md#c-05-vip-appears-to-be-a-prerequisite-for-submitting-a-business-profile)|Client|Before partner onboarding opens|

---

When this page is stable, continue with [requirements.md](requirements.md) and
record the decisions behind "Approach" in [decisions/](decisions/).
