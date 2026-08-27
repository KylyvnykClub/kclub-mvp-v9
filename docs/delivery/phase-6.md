# Phase 6 — Referrals

## 2. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-6.1|Referral lifecycle stabilization: VIP/company sender gate, consent/minimal payload, 24h limits, staff moderation before recipient visibility, accept/decline redaction, sender status view, 14d expiry, sender bar/unbar, and locale-safe UI strings|FR-070, FR-071, FR-072, FR-073, FR-074, FR-075, FR-076, FR-077, FR-078, FR-095|—|—|done 2026-08-13 — existing referral flow was stabilized so recipients only see delivered/accepted/declined/expired referrals, decline/expiry redact client contact details, `staff_moderator+` can bar/unbar senders from the moderation queue with audit metadata, response actions are audited, and integration coverage now proves recipient gating, redaction, expiry and sender bar/unbar|
|T-6.2|Member inbox: a `notifications` table written in the domain transaction, a tab under Profile, an unread count in the header, 180-day retention in the existing sweep and explicit deletion on erasure. Closes FR-074's unimplemented notify half - moderating a referral to `delivered` previously told the recipient through no channel at all|FR-099|T-6.1|2d|in progress 2026-08-27 — ADR 0020, table + migration 28, `src/data/notifications.ts`, `own_notification` authorization subject, write paths for all six kinds, 9 integration tests. UI tab and badge outstanding|

## 3. Exit checks

- [x] VIP/company gate exists before a referral can be sent
- [x] Referral payload stays limited to client name, one contact channel, service needed, optional note, and consent attestation
- [x] Sender rate limits enforce 10 total and 3 per recipient company per rolling 24h
- [x] Staff moderation is required before recipient visibility
- [x] Accept/decline and expiry preserve or redact contact details according to status
- [x] Staff can reject referrals and bar/unbar a sender
- [x] `pnpm verify`, `pnpm test:integration`, docs checks, and build pass
