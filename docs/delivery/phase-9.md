# Phase 9 — Partner funnel

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** a
business reaches the application from the landing page, files it on one page
without joining the club, is charged nothing until a moderator approves it, and
a refused registration can be corrected and resubmitted.

**Exit criterion, verbatim:** _A business reaches the application from the
landing page, files it on one page without joining the club, is charged nothing
until a moderator approves it, and a refused registration can be corrected and
resubmitted._

The decision is
[ADR 0036](../decisions/0036-payment-after-moderation.md), which supersedes
[ADR 0019](../decisions/0019-payment-before-moderation.md). The phase exists
because three complaints from the club owner turned out to share one cause: a
business partner was modelled as a member who happens to own a company, and
everything else followed from that.

What already exists and is reused rather than rebuilt:

- The whole billing lifecycle. Nothing here adds a plan, a price or a webhook —
  it changes **when** the one existing listing checkout may be opened.
- `membershipAccess`, the pure two-state gate from phase 8. A fourth
  `dues_kind` is a branch in it, not a second gate.
- The company form's eighteen fields, its Zod schemas and its draft table. The
  form is recomposed, not rewritten; the fields become one shared component used
  by both the public and the dashboard form.
- Registration itself, lifted out of the Server Action into
  `modules/identity/registration-form.ts` so the partner application can create
  an account without a second copy of the consent, Turnstile and rate-limit
  rules.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-9.1|The record: ADR 0036, FR-109…FR-112, the amended FR-040 and FR-103, the reordered gates in architecture.md §3.3, the flow and the partner standing screen in ux.md, the `partner` value in data-storage.md, glossary rows in three languages|—|—|0.5d|done 2026-09-24|
|T-9.2|A refused attempt presents a fresh challenge: `nextChallengeNonce`, the reset inside `TurnstileWidget`, wired into registration and password reset. A single-use Turnstile token was replayed by every retry after the first refusal|FR-112|—|0.5d|done 2026-09-24 — 4 unit tests over the nonce rule; the widget reset itself is a browser effect and is not proved in CI|
|T-9.6|The second half of "registration works every other time", found by walking the form in a browser: React resets an uncontrolled field once a form action resolves, so a refusal emptied the name and the address while leaving the password — which is controlled — in place. Both are `required`, so every further submit was blocked by native validation and the button did nothing. Both fields are now controlled, on registration and on the partner application|—|T-9.2|0.5d|done 2026-09-24 — walked in a browser: attempt 1 refused with every answer still in the form, attempt 2 with a corrected number reaches `/membership`. Not in CI|
|T-9.3|One page, category first: `CompanyFields` shared by both forms, the four-step wizard and its review panel removed, whole-form draft autosave replacing per-step saves, and the `step` column dropped|FR-109|—|1d|done 2026-09-24 — the dashboard form and the public application render the same component; `company_drafts.step` dropped in `20260924100000_partner_dues_kind`|
|T-9.4|The partner account: `dues_kind = 'partner'`, `membershipAccess` reading the listing instead of the dues, the public `/{locale}/partner` page and `registerPartnerAction` creating the account and the application in one submit, and the partner standing screen on `/{locale}/membership`|FR-110|T-9.3|1.5d|done 2026-09-24 — 11 unit tests over the partner branch of `membershipAccess`, 10 integration tests over `submitCompany`; `registerMemberFromForm` returns the new member id rather than reading back a cookie it has just written|
|T-9.5|Payment after moderation: `createCheckoutSessionAction` requires an approved company, the form no longer opens checkout, the approval notice carries the payment link, and the landing and pricing "Business" cards point at the application instead of at member sign-up|FR-111|T-9.4|1d|done 2026-09-24 — the eligibility rule is `src/domain/listing-checkout.ts` with 5 unit tests; the same rule drives the Subscribe button in Profile → Companies and the partner standing screen, so there is one answer and not three|

## 2. Rollout

1. **The migration applies itself** during the production build
   (`tools/vercel-build.ts`). It adds `partner` to `member_dues_kind` and drops
   `company_drafts.step`. The enum value is only added, never used in the same
   transaction, which is what lets `ALTER TYPE … ADD VALUE` run inside one.
2. **Deploy.** No environment variable changes: the listing price is the one
   phase 3 already configured.
3. **Walk the funnel on production** in one locale: the landing page's Business
   card → `/partner` → submit → the application appears in the moderation queue
   unpaid → approve it → the inbox row and the email both carry the payment link
   → pay → the listing publishes.
4. **Confirm nothing was charged before step 3's approval.** The Stripe
   dashboard should show no payment intent against the partner's customer until
   the approval.

## 3. Still owed

- **The account half of the application is not tested.** Ten integration tests
  cover `submitCompany` — ownership, `pending`, the three refusals, the cleared
  draft, no subscription attached — but `registerPartnerAction` itself needs
  Next's request scope for cookies and headers and is reachable from neither the
  unit nor the integration suite. What is untested is precisely the new part:
  that one guest submit creates exactly one member with `dues_kind = 'partner'`
  and one company, and that a company-half failure leaves an account the
  signed-in branch can finish from. That needs the browser suite.
- **The browser walk is not a test.** It was run by hand against a production
  build and the dev database, and it found the bug T-9.6 fixes — which is the
  argument for turning it into a Playwright test rather than leaving it as a
  session's shell history. What was walked: the Business card to `/partner`, a
  guest submit that creates the account and the application, the standing
  screen while pending, the same screen with the pay button once approved, and
  a refused registration corrected and resubmitted. Chromium needed `libnspr4`,
  `libnss3` and `libasound2`, unpacked from .deb into a local prefix because
  this host has no passwordless sudo.
- **The moderator's own click was not exercised.** This dev database has no
  staff password configured, so the approval was applied with SQL and only the
  partner-facing half of it was walked.
- **The Turnstile reset is proved only at the level of the decision.** Whether
  the widget then issues a new token cannot be observed with Cloudflare's
  always-pass test key, which returns the same dummy token every time, and this
  repository has no component-test harness. The other half of the same
  complaint (T-9.6) is now proved in a browser.
- **A partner cannot edit their application while it is in review.** They are
  held on the standing screen, which is honest but means a typo waits for the
  moderator to reject it.
- **No measurement of the funnel cost.** ADR 0036 says to revisit if more than
  about a quarter of approved applications are never paid for, and nothing
  currently counts that.

## 4. What this phase must not do

- **No entitlement from a redirect.** The return from listing checkout renders a
  page and grants nothing, exactly as before
  ([ADR 0004](../decisions/0004-stripe-billing-as-system-of-record.md)).
- **No free club membership.** A partner whose listing is not paid for is held
  outside the club, not let in on the strength of an application nobody has read.
  Exempting them from the gate entirely would hand out the membership card, which
  is the product.
- **No second registration path.** The partner application creates an account
  through the same code the member form uses, with the same consent record, the
  same bot gate and the same rate limit. A second copy would be the one that
  forgets one of them.
- **No member directory.** Nothing here returns a collection of members to
  anyone ([ADR 0005](../decisions/0005-no-member-directory.md)).
