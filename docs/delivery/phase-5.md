# Phase 5 — Staff console

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** Staff run the club without database access.

**Deliverable:** A secure, authenticated staff console (`admin.kclub.com` or `/admin`) with TOTP requirement. It includes dashboards for members and finance, member and card administration, moderation queues for companies and referrals, management of reference data (categories, countries, cities), role-based access control, an immutable audit log, and member data export. Includes deferred legal document translation from Phase 4.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-5.1|Move from Phase 4: English versions of all nine legal documents as `{id}.en.mdx`, authoritative flag on EN per FR-093|—|—|1.5d|open|
|T-5.2|Staff authentication with TOTP enforcement (second factor mandatory for `staff_*` roles)|FR-080|—|2d|DONE|
|T-5.3|Support Dashboard: total members, active members, new members (7d), companies/referrals awaiting moderation|FR-081|T-5.2|1d|done 2026-08-13 — `/dashboard/admin/support` renders real support metrics, gates access through `read moderation`, excludes staff accounts from member counts, and has integration coverage for member/moderation counters|
|T-5.4|Admin Dashboard: 30d revenue, active subscriptions by type, renewals due (7d), 50 recent payments, revenue by country (map)|FR-082|T-5.2|2d|done 2026-08-13 — finance dashboard is `staff_admin+`, keeps Stripe-sourced 30d revenue/recent payments/country revenue, renders a world-map visualization plus Recharts country bars, and has integration coverage for subscription split and 7d renewal metrics|
|T-5.5|Member Directory & Admin: find members (phone/serial/name), view history, block/unblock with reason|FR-083, FR-084|T-5.2|2d|done 2026-08-13 — member directory now supports merged name/phone/card-serial search, excludes staff accounts, lets `staff_support` view member cards/subscriptions/activity history, keeps block/unblock/card mutations `staff_admin+`, requires reasons for status changes, and writes before/after audit metadata|
|T-5.6|Reference Data Management: manage business categories, countries, and cities (with deletion constraints)|FR-085|T-5.2|1d|open|
|T-5.7|Staff Management: `staff_owner` can create/disable staff accounts and manage roles|FR-086|T-5.2|1.5d|open|
|T-5.8|Immutable Audit Log: record mutating actions, searchable by actor/target/date, uneditable|FR-087, FR-088|T-5.2|2d|open|
|T-5.9|Security & Privacy: exclude console from marketing domain/indexing, implement GDPR data export for members|FR-089, FR-094|T-5.2|1.5d|open|

**Total: ~14.5 focused days.**

## 2. Tasks that need explaining

**T-5.1** was originally T-4.2 but was deferred to Phase 5 because it was blocked awaiting English source texts from client counsel.

**T-5.2** adds TOTP support to `better-auth` for staff roles. Regular members do not use TOTP (they use phone/SMS).

**T-5.4** requires a visualization library (e.g., Recharts and a topojson world map) for the finance map (FR-082).

**T-5.8** introduces the `audit_logs` table. This must capture before/after states for all mutating actions made by staff.

## 3. Exit checks

The §6.1 criterion, decomposed:

- [ ] Staff can sign in with TOTP; without TOTP, sign-in is rejected
- [ ] Dashboards render accurate statistics and finance data (with map)
- [ ] Staff can search for members, view their cards/subscriptions, and block/unblock them
- [ ] Moderators can manage categories, countries, and cities safely
- [ ] Owners can create and manage other staff accounts
- [ ] All mutating actions are recorded in the audit log, which is searchable and immutable
- [ ] Data export works
- [ ] T-5.1 (Legal translations) is completed
- [ ] `python tools/check-plan.py --strict` and `python tools/check-docs.py --strict` pass
- [ ] `pnpm verify` passes

## 4. Demo script

Run against staging, in this order:

1. Attempt to sign in as a staff member without TOTP; show it fails. Set up TOTP and sign in.
2. View the Support and Admin dashboards.
3. Search for a member, view their details, and block them with a reason.
4. Add a new business category.
5. Create a new staff account as `staff_owner`.
6. Go to the Audit Log and show the records for the blocking action, category creation, and staff creation.
7. Run `pnpm verify` and `python tools/check-plan.py --strict`. Show green.
