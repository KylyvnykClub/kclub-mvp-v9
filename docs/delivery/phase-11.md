# Phase 11 — Invite programme

**Goal, from [requirements.md §6.1](../requirements.md#61-delivery-plan):** the
owner's decision of 2026-10-05 — every member has personal invite links in the
cabinet, the club records who brought whom, and the newcomer is waived or
charged according to the invite matrix.

**Exit criterion, verbatim:** _Every member has invite links in the cabinet, a
newcomer brought through one is recorded against the member who brought them
and is waived exactly as the invite matrix says, the member sees counts and
staff see who._

The decision is [ADR 0042](../decisions/0042-member-invite-programme.md). It
supersedes the "no attribution" parts of
[ADR 0033](../decisions/0033-standard-membership-is-paid.md) and
[ADR 0040](../decisions/0040-partner-join-link.md), and rewrites constraint 3 in
CLAUDE.md to the new boundary.

## 1. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-11.0|Staff waive a listing from the console ([ADR 0041](../decisions/0041-staff-listing-waiver.md)), carried into this phase because it shipped between phases|FR-121|—|0.5d|done 2026-10-03|
|T-11.1|The record: ADR 0042, FR-122…FR-126, constraint 3 in CLAUDE.md, glossary rows in three languages, retention rows in data-storage.md, the cabinet screen in ux.md|—|—|0.5d|done 2026-10-05|
|T-11.2|Schema and domain: `invite_links`, `invitations`, `companies.listing_waiver_invite_link_id` and their migration; the pure invite matrix with a test per cell|FR-123|T-11.1|0.5d|done 2026-10-05 — `tests/invite-programme.integration.test.ts` written but not run (no Docker on this host); not walked in a browser|
|T-11.3|The cabinet: an "Invite programme" tab under Profile with both links, copy and rotate, what each costs the newcomer, and the counts|FR-122, FR-125|T-11.2|1d|done 2026-10-05 — `tests/invite-programme.integration.test.ts` written but not run (no Docker on this host); not walked in a browser|
|T-11.4|The door: `/{locale}/r/{code}`, the signed `pending_invite` cookie, the invitation written in the registration transaction, sponsored dues and the one listing waiver|FR-124|T-11.2|1d|done 2026-10-05 — `tests/invite-programme.integration.test.ts` written but not run (no Docker on this host); not walked in a browser|
|T-11.5|The console: who brought the member and how many they have brought, on the member sheet|FR-126|T-11.4|0.5d|done 2026-10-05 — `tests/invite-programme.integration.test.ts` written but not run (no Docker on this host); not walked in a browser|

## 2. What this phase must not do

- **No reward to the inviter.** No commission, no discount, no credit, no rank.
  The schema has no column that could carry one.
- **No second level.** Nothing reads an invitation's invitee as an inviter to go
  further down, and nothing shows a member who they brought.
- **No access without money or a waiver.** A waived member is `sponsored` and a
  waived listing is `listing_waived_at` — the same columns every gate already
  reads ([ADR 0004](../decisions/0004-stripe-billing-as-system-of-record.md)).
