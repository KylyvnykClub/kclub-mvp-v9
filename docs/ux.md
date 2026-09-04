# User Experience

> **Status:** In review
> **Owner:** KCLUB Delivery Lead
> **Last updated:** 2026-08-02
> **Write when:** before the first screen is built.

What the user actually sees and does. [requirements.md](requirements.md) says
what the system must do; this document says how it presents itself while doing
it. The frontend technology is in
[technology.md](technology.md#3-frontend) — not here.

---

## 1. Principles

Four statements, each of which can be disagreed with, and each of which settles
a real argument.

1. **Privacy is visible, not merely present.** Where the product declines to
   show something, it says so — "we never publish our member list", "your name
   is hidden on verification". A privacy guarantee the user cannot perceive is
   indistinguishable from a missing feature. This is the reason the card
   verification page shows a deliberate, explained minimum rather than a terse
   "valid".
2. **The card is the product.** A member who has done nothing else must still
   have something worth opening the site for. The card is the first screen after
   registration, the default landing page, and the only screen we optimise for
   being looked at rather than used.
3. **Premium means restraint, not decoration.** Generous space, one accent, real
   typographic hierarchy, few animations. We are not competing with a directory
   on density; we are signalling that entry was selective. If a screen needs a
   gradient to feel expensive, the layout is wrong.
4. **Never block on something we can do afterwards.** Moderation, payment
   confirmation and notification delivery all happen behind an honest status.
   The user is told where their thing is and what happens next — never left on a
   spinner waiting for a queue.

Deliberately not optimised for: engagement, session length, or return frequency.
A member who visits twice a year and gets a discount both times is a success.

---

## 2. Screen inventory

Thirty-eight screens. The count is the point — half of them are states nobody
plans for, and finding them now is cheaper than discovering them in week ten.

**Public (`kclub.com`)**

|Screen|User goal|Access|Notes|
|-|-|-|-|
|Home|Decide whether this club is real and worth joining|public|Hero, how it works, curated showcase, testimonials, FAQ, join|
|How it works|Understand membership vs. partnership|public|Explicit "this is not MLM" statement|
|For partners|Decide whether to apply|public|Pricing, what a listing gets, the application steps|
|Partner showcase|See that the catalogue is not empty|public|Curated subset only — never the full catalogue|
|FAQ|Answer the objection before it is raised|public|Includes "why phone only" and "what do you show about me"|
|Legal ×5|Read Terms, Privacy, Club Rules, Partner Rules, Refunds|public|Versioned; the version accepted is recorded|
|Contact / Business tier enquiry|Reach a human|public|The "contact us" path for the deferred Business plan|
|Card verification (`card.kclub.com/v/<token>`)|Confirm a card in front of them is real|public|Minimal disclosure by design (FR-023)|

**Authentication**

|Screen|User goal|Access|Notes|
|-|-|-|-|
|Register — phone + password|Start membership|public|Consent wording for SMS shown verbatim, and stored|
|Register — enter code|Prove the number|public|Resend with visible countdown; attempts remaining|
|Register — profile|Finish in one screen|authenticated, unverified profile|Name, language, country. Three fields, no more|
|Sign in|Return|public|Phone number and password. The Google alternative below the button appears only when the `google_signin_enabled` flag is on, and it is off ([ADR 0031](decisions/0031-identity-returns-to-phone-only.md))|
|Sign in — device challenge|Prove an unrecognised device|public|Appears only when the device is unknown|
|Forgot password|Recover|public|Phone number, behind a Turnstile gate. The request lands in the staff console; the reply is the same in every case, so the form cannot be used to find out who is in the club. Staff confirm who the caller is outside the system, then reset the password ([ADR 0018](decisions/0018-staff-assisted-password-reset.md), [ADR 0031](decisions/0031-identity-returns-to-phone-only.md))|
|Blocked / suspended|Understand and appeal|authenticated|Says what happened and how to contact support|

Every screen that takes a phone number — the two above, the staff creation form
and Settings — security — uses the same field ([ADR 0027](decisions/0027-e164-phone-normalisation.md)):
a searchable country picker and a box that formats the number as it is typed.
The box holds the national number only, because the picker beside it already
shows the dialling code; a number typed in international form moves the picker
to its country and is left in the box as the national part, so the code is
never shown twice.
The picker is filtered by typing, and matches a country's name, its two-letter
code or its dialling code, so both "Україна" and "380" find Ukraine; each row
carries the flag, the name in the member's own language and the code. The
placeholder is a real example number for the selected country, so it is right
outside Ukraine too; the country defaults to the United States and follows the
number when one is pasted in international form. The member sees their own
national spelling, and E.164 is what reaches the server.

Flags are the `public/flags` images the language switcher already uses, not
emoji: Windows ships no flag font, so a regional-indicator pair renders there as
two bare letters.

The same picker chooses a plain country — on registration and on the company
application — so a country is named identically wherever it is offered, in the
member's own language. Registration used to offer ten hardcoded countries from
a translation table of its own; it now offers all of them, searchable.

**Member area (`kclub.com/app`)**

|Screen|User goal|Access|Notes|
|-|-|-|-|
|My card|Show membership|member|Default landing. Large QR, tier, serial, name-visibility toggle|
|Catalogue|Find a trusted business|member|Search, category/country/city filters, results|
|Partner detail|Decide to contact them, and see the discount|member|Discount terms are the most prominent element|
|VIP upgrade|Understand and buy VIP|member|Honest about what VIP does and does not add|
|My subscription|Manage or cancel|member|Renewal date, price, link to the Stripe portal|
|My companies|See status of businesses I submitted|member|One card per company with its state and next action|
|Submit a company — 4 steps|Apply to the catalogue|member|Draft saved per step; progress always visible|
|Company under review|Know where it is|partner_owner|Shows submission time and expected decision window|
|Company rejected|Understand why and fix it|partner_owner|Reason shown in full; resubmit from the same data|
|Company — pay for listing|Publish|partner_owner|Only appears after approval|
|Edit company|Keep it accurate|partner_owner|Warns which edits return it to review|
|Referrals — sent|Track introductions I made|member_vip|Status per referral|
|Referrals — received|Act on incoming introductions|partner_owner|Accept/decline; contact revealed only on accept|
|Send a referral|Introduce a client|member_vip|Consent attestation, quota shown before submitting|
|Inbox|See what the system did to me and when|member|A tab under Profile, not a fifth navigation item. Unread count in the header; each row rendered in the member's current language ([decisions/0020](decisions/0020-member-inbox.md))|
|Settings — profile|Change name, language, country|member||
|Settings — security|Sessions, password, phone number|member|Active sessions with device and last-used|
|Settings — delete account|Leave|member|Explains what is deleted, what is kept and why|

**Staff console (`/dashboard/admin`, shared shell: sidebar + breadcrumb topbar)**

Nine routes; detail work happens in sheets over the lists, not on separate
screens. Access column names the `can()` gate the page enforces.

|Screen|User goal|Access|Notes|
|-|-|-|-|
|Sign in + TOTP|Get in securely|staff|Two steps, always|
|Overview|See the money and the club at a glance|staff_admin+|Finance + community stat tiles, revenue-over-time, registrations, revenue by country, review queue, recent payments|
|Support|Start the day; reach the queues|staff_support+|Member stats and links into the two pre-filtered moderation queues|
|Members|Find and act on a member|staff_support+|Search by name, phone or serial; status/plan filter chips with counts. Detail, block (reason mandatory), password reset, card revoke/reissue live in the row sheet; card actions gate at staff_admin+|
|Companies|Moderate and manage the catalogue|staff_support+ read; decisions staff_moderator+|One screen for queue and catalogue: pending badge, Review opens the sheet where approve/reject sit beside the profile; hide, staff edit, showcase rank in the same sheet|
|Client introductions|Clear the review queue|staff_moderator+|In-review badge; client contact visible only inside the sheet during review (FR-071), redacted after closure (FR-077)|
|Reference data|Keep categories and places tidy|staff_moderator+|Create forms with labels; Activate/Deactivate one-click; Delete behind a confirm dialog and blocked while referenced|
|Feature flags|Turn a capability on or off|staff_owner|Each switch names its flag and says what it gates; effect is immediate|
|Staff|Manage the team|staff_owner|Create, change role, disable behind a confirm dialog (signs out everywhere); 2FA status per account|
|Audit log|Investigate|staff_owner|Filter by text, actor, target and date range; renders the failure as an inline error, not a blank page|

Not yet built, listed in the shell as disabled: content & access, roles &
permissions. Pricing management is not a console screen yet (prices change
via Stripe + env, ADR 0004).

**System states, which are screens too**

|Screen|User goal|Access|Notes|
|-|-|-|-|
|Maintenance|Know it is us, not them|public|Localised; served by middleware during a restore|
|404 / 403|Get back somewhere useful|any|403 never reveals that the object exists|
|Payment processing|Wait honestly after checkout|member|"Activating — this usually takes a few seconds" and it polls|
|Offline|Understand nothing is lost|member|PWA shell only; the card is cached and readable offline|

---

## 3. Key user flows

These match the critical paths in
[reliability.md §2](reliability.md#2-critical-paths).

### 3.1 New visitor becomes a card-carrying member

1. Lands on Home from a founder's link or a partner's recommendation.
2. Reads how it works; sees that membership is free and that the member list is
   never published.
3. **Join** → enters phone number and password. The SMS consent wording is on
   the screen, not behind a link.
4. Receives a 6-digit code, enters it. Resend is available after 60 seconds with
   a visible countdown; attempts remaining are shown after a wrong code.
5. Enters name, language and country — three fields.
6. Lands on **My card**, which is issued and animated in once. A one-time
   coach-mark points at the QR and at the catalogue.

**Entry point:** Home, or a partner's link.
**Success:** the card is on screen within 90 seconds of the first tap, and the
member has been asked for nothing they did not need to give.
**Failure:** SMS undelivered — after 60 seconds the screen offers resend and,
after two failures, a "having trouble?" link to support with the attempt id
already filled in. Wrong code five times — the code is destroyed and a fresh one
must be requested, explained plainly rather than as an error.
**Exit / abandonment:** leaving after step 3 leaves a pending record that is
deleted in 24 hours; returning with the same number simply starts again. Leaving
after step 4 but before step 5 means the account exists and the card is issued —
the profile screen is presented on next sign-in, never as a blocking modal.

**The step that will lose people is 4.** It is measured separately from the rest
of the funnel and it is the number that would justify reopening the phone-only
constraint with the client.

### 3.2 Member finds a partner and uses the discount

1. **Catalogue** from the bottom navigation. Results are visible immediately —
   no empty search box waiting for input.
2. Filters by category, then country and city. Filters live in the URL, so the
   result is shareable and survives a refresh and a back-navigation.
3. Opens a partner. The discount and its conditions are the largest thing on the
   page, above the description.
4. Taps to call, message or open directions. The club is not in the middle of
   this conversation; the last screen we own is this one.
5. At the partner, shows the QR from **My card**; the partner scans and sees a
   valid card.

**Success:** a partner scan resolves in under a second on a bad connection at a
counter.
**Failure:** no results for a filter combination — the empty state names the
constraint that excluded everything and offers to remove it, rather than saying
"no results". No partners at all in a country — the empty state invites the
member to nominate a business, which is also how the catalogue grows.

### 3.3 Partner applies, is approved, pays and is published

1. **Submit a company**, four steps: business details, contacts and the
   discount offered → location and category → logo and photos → review and
   confirm. Progress is shown as "Step 2 of 4", and each step is saved on
   completion. Location is country → city picked from a list for that country
   ([ADR 0025](decisions/0025-city-lookup-from-countrystatecity.md)); service
   countries are added one at a time from a type-ahead, with "worldwide" and
   "same as the country of registration" as shortcuts. Photos uploaded on
   step 3 are staged with the draft and become the company's on submission
   ([ADR 0024](decisions/0024-onboarding-media-staging.md)).
2. Submits. The screen states plainly: reviewed within 1–3 business days, and
   nothing is charged yet.
3. Notification of the outcome, in their language. If rejected, the reason is
   shown in full and the form reopens with their data intact — a rejection is
   never a dead end.
4. If approved, a single call to action: pay for the listing. Stripe Checkout,
   then back to a status screen.
5. Published within seconds of the webhook landing. The company card in **My
   companies** shows "Live" with a link to the public entry.

**Success:** the applicant always knows which of the four states they are in —
draft, in review, approved and unpaid, live.
**Failure:** payment abandoned at Stripe — the company stays in "approved,
awaiting payment" with a reminder after 24 hours and again after 3 days, and
nothing is lost. Listing lapses later — the company is unpublished, the owner is
told before it happens and told again after, and republication is one payment
away with no re-moderation.

### 3.4 VIP member refers a client

1. From **Referrals** or from a partner's page, choose the recipient company.
2. Enter the client's name, one contact channel, and what they need.
3. Tick the consent attestation. The wording is explicit: the sender confirms
   the client agreed to be introduced. This is not a dark pattern to be
   minimised — it is the legal basis for the whole feature, and it is shown at
   full size.
4. See the remaining quota ("7 of 10 left today") before submitting.
5. Submitted → "in review". On approval the recipient is notified; the sender
   sees the status change.

**Success:** the recipient accepts and the contact details are revealed to them.
**Failure:** quota exhausted — the button is disabled with the reason and the
time it resets, never a silent failure on submit. Rejected by moderation — the
sender is told, with the reason, and the client's details are deleted.

---

## 4. Navigation and information architecture

**Structure:** three separate hubs, deliberately not merged. The public site is
a linear marketing narrative; the member area is a four-item hub; the staff
console is a sidebar application. A member never sees console navigation and a
visitor never sees member navigation — there is no shared shell that has to
decide.

**Member area, the only four items:** Card · Catalogue · Referrals · Profile.
Companies live under Profile, because a member who owns a business is the
exception; making it a fifth top-level item would tell every member they are
missing something.

**Persistent elements:** on mobile, a bottom navigation bar with the four items,
with the card's icon slightly emphasised; on desktop, a top bar with the same
four plus the language and theme controls. The staff console uses a collapsible
left sidebar grouped as Overview · Moderation · Catalogue · Members · Finance ·
Settings, with queue counts as badges — the badge is the console's whole
information architecture, because it is what tells staff where to go.

**URL scheme:** `/{locale}/…` for everything user-facing.
`/app/card`, `/app/catalogue?category=legal&country=US&city=nyc`,
`/app/companies/{id}`, `/admin/moderation/companies`,
`card.kclub.com/v/{token}`. All catalogue state is in the query string, so any
view is shareable and bookmarkable and survives a refresh. Identifiers in URLs
are UUIDv7 and never sequential.

**Back-button behaviour:** the browser back button always does the obvious
thing. Modals push a history entry and close on back. The four-step submission
uses real routed steps (`/app/companies/new/2`), so back means "previous step"
and a refresh does not lose the draft. Filters replace rather than push history,
so back leaves the catalogue rather than undoing seven filter changes one at a
time.

---

## 5. Interface states

Every screen that loads data defines all six. This table is the standard; a
screen deviating from it needs a reason in review.

|State|Standard treatment|
|-|-|
|**Loading**|Content-shaped skeletons that match the final layout, so nothing shifts when data arrives. Nothing appears for the first 200 ms — a flash of skeleton on a fast connection reads as slower than no skeleton at all. Beyond 5 seconds the skeleton is replaced by "this is taking longer than usual" with a retry|
|**Empty**|Always explains and always offers the next action. "No partners in Lisbon yet — try a nearby city, or tell us about a business you trust" and a button. The word "None" alone never appears; an empty state is the cheapest place to grow the catalogue|
|**Error**|A plain sentence saying what failed and what to do, one retry control, and a reference code (the correlation id) that support can look up. Never a stack trace, never a raw status code, never an internal identifier the user cannot use|
|**Partial / degraded**|The page renders what it has and marks the rest. Catalogue without facet counts still lists partners; a card whose tier cannot be confirmed shows the card with "tier updating". See [reliability.md §5](reliability.md#5-graceful-degradation)|
|**No permission**|Hidden entirely where its existence is itself information (a member's company, a referral, any staff route). Visible-but-disabled with a reason only where the user could plausibly gain the right — "Referrals are a VIP feature" with an upgrade link. The distinction is the rule: never confirm the existence of something the viewer may not see|
|**Offline**|The card works. It is cached by the service worker and readable with no connection, because that is exactly when it is needed — at a counter, in a basement restaurant. Everything else shows an offline banner and retries when connectivity returns|

**Error message rules.** Say what happened, why, and what to do next, in that
order, in the user's language. Never blame the user. Never expose a stack trace,
a database error, a vendor's error string, or an internal id. Always give the
correlation id as a short "reference" so a support conversation starts with a
fact. Validation errors appear next to the field they concern, on blur, and are
re-announced to screen readers on submit.

---

## 6. Design system

|Aspect|Choice|
|-|-|
|Component library|Adopt shadcn/ui (Radix primitives), copied into the repository and owned. Accessible keyboard and ARIA behaviour comes from Radix; the visual identity is entirely ours|
|Design tool and file|Figma — _(link to be added when the file exists)_|
|Token source of truth|The codebase: `src/styles/tokens.css` as CSS custom properties. Figma variables mirror it. When they disagree, the code wins and Figma is corrected — one direction, decided now|
|Icon set|Lucide, 1.5 px stroke, 20/24 px sizes only|
|Illustration / imagery|Photography for partner covers, supplied by partners and re-encoded on upload. No stock illustration, no 3D renders — real businesses photograph better than any illustration style at this price point|

### Tokens

|Token group|Definition|
|-|-|
|Colour|Semantic names only: `surface`, `surface-raised`, `surface-sunken`, `border`, `text`, `text-muted`, `accent`, `accent-contrast`, `success`, `warning`, `danger`, `info`. Never `gold-500` in a component. The brand accent is a warm metallic gold used sparingly — the card, primary actions, and nothing else. Two full palettes, light and dark, both AA against their surfaces|
|Typography|Two families: a high-contrast serif for headings (club, editorial) and a neutral sans for interface text. Scale 12/14/16/18/24/32/48, 1.5 line height for body, 1.15 for headings. Weights 400/500/700 only. Self-hosted, subsetted per locale — Cyrillic and Ukrainian glyph coverage is a requirement, not an afterthought|
|Spacing|4 px base; scale 4/8/12/16/24/32/48/64. Nothing between steps|
|Radius / elevation|Radius 8 px default, 16 px for cards, 999 px for pills. Three elevation levels, from shadow tokens; no ad-hoc shadows|
|Motion|150 ms for state changes, 250 ms for entrances, `cubic-bezier(0.2, 0, 0, 1)`. The card issue animation is the only motion over 300 ms in the product. Everything is disabled under `prefers-reduced-motion: reduce` — not shortened, disabled|

**Dark mode:** supported and first-class — a gold-on-dark club card is the
product's strongest visual moment. The theme follows the operating system by
default, with a manual toggle persisted in a cookie so the server renders the
right theme on the first paint and there is no flash. Both themes are audited
for contrast independently; a token that passes in light and fails in dark is a
failing token.

---

## 7. Responsive and platform support

|Breakpoint|Width|Layout|
|-|-|-|
|`sm` (default)|< 640 px|Single column, bottom navigation, full-width cards. The design target is 390 px|
|`md`|640–1023 px|Two-column catalogue grid, bottom navigation retained|
|`lg`|1024–1439 px|Top navigation, three-column catalogue, card centred at a fixed maximum width|
|`xl`|≥ 1440 px|Content capped at 1280 px. The staff console is the only screen that uses the extra width, for tables|

**Primary target:** mobile. The card is shown from a phone, the catalogue is
searched from a phone, and the QR is scanned from a phone. Desktop is the same
information, widened.

**Supported browsers:** last two major versions of Chrome, Safari, Edge and
Firefox; iOS Safari 16+; Android Chrome on Android 10+.

**Touch vs. pointer:** minimum hit target 44 × 44 px, minimum 8 px between
adjacent targets. Nothing depends on hover — every hover affordance has a
focus and a touch equivalent. The staff console's dense tables are the one place
we assume a pointer, and they are usable but not pleasant on a phone; that is
stated rather than pretended otherwise.

**Wide tables on narrow screens:** the console's tables become stacked cards
below `md`, with the two most important columns as the card's title and
subtitle. Horizontal scrolling inside a table is not used — it hides data.

---

## 8. Accessibility

Target: **WCAG 2.1 Level AA**, treated as a launch requirement per
[requirements.md §5.4](requirements.md#54-usability-and-accessibility).

|Requirement|Approach|Verified by|
|-|-|-|
|Keyboard navigation|Every flow in §3 completable with the keyboard alone, including the four-step submission, the moderation queue and the QR screen. Radix primitives supply correct roving focus and escape handling|Playwright keyboard-only run of the four flows in §3, on every pull request|
|Focus visibility and order|A 2 px accent outline with a 2 px offset on every interactive element, visible in both themes. DOM order matches visual order; focus is trapped in modals and restored to the trigger on close|Manual audit per release; axe rules in CI|
|Colour contrast|4.5:1 for body text, 3:1 for large text and interface borders, in **both** themes. The gold accent fails on light surfaces at small sizes and is therefore never used for small text — a constraint recorded in the tokens themselves|Automated contrast check over the token matrix in CI; the check is on tokens, not screenshots|
|Screen reader support|Semantic HTML first, ARIA only where semantics run out. Live regions announce moderation outcomes, quota changes and payment status. The QR image carries a text alternative giving the card serial, so a blind member can read their serial aloud|Manual pass with VoiceOver (iOS/macOS) and NVDA (Windows) before each release|
|Form labels and errors|Every input has a visible persistent label — never a placeholder as a label. Errors are tied with `aria-describedby`, announced on submit, and listed in a summary at the top of long forms|axe in CI; manual pass|
|Motion sensitivity|`prefers-reduced-motion: reduce` disables all non-essential animation, including the card issue animation|Manual pass|
|Language|`lang` is set correctly per locale, including on mixed-language content such as a partner's own name in a page rendered in another language|axe in CI|
|Text scaling|Layout survives 200% zoom and a 200% browser font size without loss of content or function|Manual pass at 200%|

Testing cadence: [testing.md §7](testing.md#7-manual-and-specialist-testing)

---

## 9. Content and tone

**Tone:** confident, plain and short. We are a private club, not a startup — no
exclamation marks, no "Oops!", no emoji in interface text, no manufactured
urgency and no countdown timers. We do not flatter the member ("Welcome back,
superstar") and we do not apologise theatrically. When something fails we say
what failed.

Two things we always say explicitly, because they are the product: we never
publish the member list, and this is not multi-level marketing. The second
appears in the FAQ in the customer's own words, not buried in the Terms.

**Terminology:** user-facing names for domain concepts are in
[glossary.md](glossary.md) — the interface must use the same words as the
documentation. In particular: "member" not "user", "partner" not "vendor",
"membership card" not "pass", "referral" not "lead".

**Localisation:** English (source), Russian and Ukrainian, via `next-intl` with
ICU message format. Rules that follow from having three languages:

- Every string lives in `messages/*.json`. A hard-coded user-facing string fails
  lint.
- Plurals and gendered forms use ICU categories — Russian and Ukrainian have
  three plural forms, and English-shaped `count === 1 ? … : …` breaks both.
- Dates, numbers and relative times use `Intl`, never manual formatting. Prices
  are always shown as `$19.99 USD` — the explicit code prevents a Ukrainian
  reader assuming hryvnia.
- Layouts are built for text 40% longer than English; German-length is not a
  concern here but Ukrainian regularly is.
- Names are rendered as a single `display_name` field. No first/last split,
  because that assumption is wrong across our member base.
- No right-to-left support at launch, and the layout does not pretend otherwise.

**Missing translations** fail CI rather than falling back silently. A screen half
in English is worse than a screen in one language, and a silent fallback means
nobody ever notices.

**Microcopy owner:** the client for marketing and legal copy in English; the
tech lead for interface, error and validation strings. Russian and Ukrainian are
translated by a native speaker per language and reviewed by the client — machine
translation of interface text is acceptable as a first draft and is never
shipped unreviewed.

---

## 10. Performance as experienced

|Metric|Target|
|-|-|
|Largest Contentful Paint (marketing, mobile p75)|< 2.0 s|
|Largest Contentful Paint (member area, p75)|< 2.5 s|
|Interaction to Next Paint (p75)|< 200 ms|
|Cumulative Layout Shift|< 0.1|
|Time to Interactive on the card screen|< 2.0 s|
|Card verification page, full render on 3G|< 1.5 s|
|Initial JavaScript bundle (marketing route)|< 90 KB gzipped|
|Initial JavaScript bundle (member route)|< 160 KB gzipped|
|Total page weight, catalogue first view|< 500 KB including images|

**The three things on the critical path**, in the order they will cause a
problem: partner images in the catalogue (fixed by `next/image`, AVIF/WebP,
explicit dimensions, lazy loading below the fold, and a hard cap on uploaded
dimensions); fonts (self-hosted, subsetted per locale, `font-display: swap`,
preloaded for the two used above the fold); and client JavaScript (kept down by
Server Components — `'use client'` requires a reason in review, and the bundle
budget is a CI gate that fails the build rather than a warning).

**Perceived responsiveness:** every action acknowledges within 100 ms, even when
the work takes longer — the button enters a pending state, the optimistic result
appears where it is safe to do so, and the outcome replaces it. The two places
we deliberately do not use optimistic updates are payment status and moderation
outcome, because showing a member "approved" and then withdrawing it is worse
than a two-second wait.

**Measured by:** Vercel Speed Insights for real users, Lighthouse CI on every
pull request with the budgets above as the gate, and the synthetic check on the
card verification page — see
[observability.md §2](observability.md#2-tooling).
