# Phase 4 — Private beta

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** 30
seeded partners, 50 invited members, English only.

**Deliverable, from [brief.md](../brief.md#first-milestone):** phone sign-up with
SMS verification, digital membership card with a working QR verification page,
browsable catalogue seeded with 30 hand-onboarded partners, and Stripe VIP
checkout. English only. No referrals, no staff console beyond a moderation queue.

This is a milestone phase — it delivers no new FR but requires the product
assembled from phases 1–3 to be usable end-to-end. The referrals and staff
console surfaces built out-of-sequence (commits `68bc284` and `64916f4`) are
feature-flagged off (`referrals_enabled=false`) and excluded from the beta
scope.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-4.1|Close T-3.2: VIP checkout reads single price from env, success/cancel pages grant nothing, locale-aware URLs, no-grant test|—|T-3.2|0.5d|open|
|T-4.2|English versions of all nine legal documents as `{id}.en.mdx`, authoritative flag on EN per FR-093|—|T-1.4|1.5d|open|
|T-4.3|Beta seed script: 30 companies with profiles and categories (published), 50 members with cards, idempotent|—|T-1.1, T-2.1|1d|open|
|T-4.4|Hardcoded English strings audit: find and i18n any remaining raw-English labels in components (billing-section, card-showcase, admin pages)|—|—|0.5d|open|
|T-4.5|Staging deployment verification: seed runs, sign-up with SMS works, card QR verifies, catalogue browsable, VIP checkout completes via Stripe test mode|—|T-4.1, T-4.2, T-4.3|0.5d|open|

**Total: ~4 focused days.** T-4.2 (legal translation) is the largest item; T-4.5
is a manual verification session.

## 2. Tasks that need explaining

**T-4.1 closes T-3.2 rather than duplicating it.** The checkout action and
billing UI already exist (`billing-section.tsx` calls
`createCheckoutSessionAction`). What remains: remove the `"price_dummy"` fallback
(fail closed if env unset), add success/cancel pages that display a "processing"
message without granting any entitlement, fix the hardcoded `/en/` in
`stripe.ts:84–85,114` to use the member's locale, and write a test proving
direct navigation to the success URL does not change the card tier.

**T-4.2 is a translation task.** The nine legal documents were published in
`content/legal/*.mdx` with Russian bodies (the only text supplied by the
client's counsel). FR-093 requires "the English version marked authoritative".
The MDX pipeline already supports per-locale files: `{id}.en.mdx` is served when
`locale=en`, falling back to the authoritative `{id}.mdx`. The EN files carry
`authoritative: true` in frontmatter; the RU base files are updated to
`authoritative: false`. Machine translation of ~4 000 lines of legal text; the
risk is translation quality for legally significant terms — flagged for later
review by counsel.

**T-4.3 extends the existing `tools/seed.ts`.** The seed script already creates
Stripe products/prices and feature flags. The beta seed adds companies (with
profiles, categories, and `status: "published"`), members (with cards and legal
acceptances), and is gated by a `--beta` flag. Uses `ON CONFLICT DO NOTHING` per
the existing convention. Partner data is placeholder (30 fictional businesses
across the seeded categories).

**T-4.4 catches strings outside i18n.** `billing-section.tsx` has raw English
("Membership & Billing", "Upgrade to VIP ($19.99/mo)"); other admin pages may
have similar. The `i18n:check` tool covers message keys but not JSX literals.

**T-4.5 is a manual verification, not automation.** It runs on staging with
Stripe test mode. Automation for the billing lifecycle is already scoped in
phase 3 (T-3.8, T-3.10) and runs against test clocks — phase 4 does not
duplicate that work.

## 3. Exit checks

The §6.1 criterion, decomposed:

- [ ] A new user can register with a phone number, receive an SMS code, complete
      registration, and see a digital card with a QR code on their dashboard
- [ ] The QR code on the card resolves to `/card/[token]` and shows the member's
      name and tier
- [ ] The catalogue at `/partners` lists at least 30 published partners,
      each clickable to a detail page
- [ ] A free-tier member can click "Upgrade to VIP" on their profile, complete
      Stripe checkout in test mode, and see tier updated after webhook delivery
- [ ] Directly visiting the checkout success URL does not change the member's tier
- [ ] All nine legal documents render in English at `/en/legal/*` with the
      authoritative badge
- [ ] `python tools/check-plan.py --strict` and
      `python tools/check-docs.py --strict` pass
- [ ] `pnpm verify` passes

## 4. Demo script

Run against staging with Stripe test mode, in this order:

1. Visit `/en/register`, complete phone verification, create an account. Show the
   dashboard with the free-tier card and QR code.
2. Scan the QR code (or visit `/card/[token]`). Show the verification page with
   the member's name.
3. Browse `/en/partners`. Show at least 30 partners. Click one; show the detail
   page.
4. On the dashboard, click "Upgrade to VIP". Complete checkout. Show the webhook
   arrive in the Stripe dashboard. Show the card tier update to VIP.
5. Open `/en/legal/terms-of-use`. Show the English text with the authoritative
   badge.
6. Run `pnpm verify` and `python tools/check-plan.py --strict`. Show green.

## 5. What is explicitly excluded

- Referrals (feature-flagged off; phase 6).
- Staff console beyond the moderation queue that already exists.
- RU/UK locale as default — the beta is English-only; other locales remain
  accessible but are not verified.
- Billing lifecycle automation (lapse, grace, reconciliation) — phase 3 scope.
- Wallet passes (FR-026, FR-027) — phase 1 scope, not needed for beta.
- Account deletion and phone number change — phase 1 scope (T-1.7 partial).
