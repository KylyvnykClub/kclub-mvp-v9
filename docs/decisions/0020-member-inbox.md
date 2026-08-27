# 0020. Give every member an in-product inbox, and demote email to a delivery channel

> **Status:** Accepted
> **Date:** 2026-08-27
> **Deciders:** Launch owner

## Context

Today the product tells a member nothing inside the product. Every notification
KCLUB sends is a plaintext Resend email produced by
[`src/modules/notifications/email.ts`](../../src/modules/notifications/email.ts),
which is the entire notifications module: four message types, three locales, one
`sendEmail`. The string `unread` appears nowhere in `src`.

Three facts make that a problem rather than a simplification.

**The email path fails silently and slowly.** `RESEND_API_KEY` is optional in
[`env.schema.ts`](../../src/env.schema.ts), and the worker discards `sendEmail`'s
`false` return — so with no key configured, the row is marked processed and the
notification is gone. Even configured, the outbox drains on a daily cron
(`vercel.json`, `"50 0 * * *"`), so a moderation outcome can sit for 24 hours.

**A partner introduced a client is told by nothing at all.**
[FR-074](../requirements.md) says a referral must pass moderation "before the
recipient is notified", and [FR-095](../requirements.md) names "referral
received" as a transactional notification. `moderateReferralAction` writes the
status and an audit entry and stops: no email, no outbox row, no event. The
recipient finds out by visiting a tab that is not the default tab, carries no
badge, and is linked from no navigation.

**The documents already say in-product state is the authoritative one.**
[reliability.md](../reliability.md) on Resend being unreachable: notifications
queue, and in-product state is authoritative regardless — "the referral or
moderation outcome is visible in the product without the email".
[legal-alignment.md](../legal-alignment.md) L-14 goes further and records that
Terms §26 "justifies in-product notification as the authoritative channel, with
email and SMS as delivery". Both describe a surface that was never built.

## Decision

Every member gets an inbox: a `notifications` table, a tab on the profile page,
and an unread count in the header. It is written **in the same transaction as
the domain change** wherever a user action causes it, and email becomes the
delivery channel rather than the record.

## Rationale

This is not the `notification_log` that
[ADR 0014](0014-no-notification-log-table.md) rejected, and the distinction is
the whole reason this record exists. That was a **delivery** log — recipient,
template, outcome — answering "did we send this", a question Resend's own
dashboard answers better than a table we maintain. This is **product state the
member reads**. One is our debugging; the other is the thing the member is owed.
ADR 0014 stands unamended; nothing in it argued against telling a member what
happened to them.

Writing the row inline rather than in the outbox worker follows directly from
reliability.md: if in-product state is authoritative, it cannot be the half that
waits on a once-daily cron. The outbox keeps the email, where at-least-once and
a day of latency are acceptable because the product already shows the truth.

**Content is stored as a `kind` and a `params` object, never as a rendered
sentence.** [FR-090](../requirements.md) requires every user-facing string in all
three languages, and a member can change `language` _after_ a notification is
written — stored prose would freeze whichever language happened to be current
when the event occurred. The kind selects an i18n message; `params` carries ids,
names and integer amounts that fill its placeholders at read time.

One exception is deliberate: a rejection carries the moderator's free-text
reason verbatim, because no translation reaches text a human wrote minutes ago.
It is rendered as a quoted note, visually separate from the localised shell, so
the mixed language is legible as a quotation rather than as a bug.

**Nothing in an inbox row discloses another member.** The referral notification
names the recipient's _own_ company and says an introduction arrived; who sent
it stays where it already is, on the referrals screen. An inbox row is not the
place to widen what one member learns about another
([ADR 0005](0005-no-member-directory.md)).

## Alternatives considered

|Option|Why not|
|-|-|
|Fix the email path instead — make `RESEND_API_KEY` required, honour the `false` return, raise the cron frequency|All three are worth doing and none of them makes the product tell a member anything. Email is a channel we do not control, to an address we often do not have: phone is the identity here, and `members` has no email column at all|
|Add SMS, per FR-095's "by SMS where it is not [known]"|The honest reading of FR-095, and still open. It is another vendor, another cost per message, and A2P registration ([ADR 0010](0010-no-own-a2p-registration-with-twilio-verify.md)); and it still leaves the product itself silent. The inbox is the cheaper half and the one the other channels can point at|
|Reuse the referrals screen and add badges to it|Covers one of the six notification kinds. A moderation outcome, a failed payment and a welcome have nowhere to live on a referrals page|
|Store the rendered message text at write time|Simpler to read back, and wrong the moment a member switches language — which this product expects them to do, being trilingual by requirement|
|Make the inbox a fifth top-level navigation item|[ux.md §4](../ux.md) caps the member menu at four items and puts Companies under Profile for exactly this reason. A tab costs no navigation weight and no new route|

## Consequences

**This makes easy:** telling a member what happened to them, in their current
language, whether or not Resend is configured, whether or not the cron has run,
and whether or not we hold an email address. It also gives FR-074 somewhere to
land after being unimplemented since the referrals module was written.

**This makes hard:** nothing structurally, but it adds a table that holds
personal data, which brings a retention period and a deletion path with it — see
below.

**We accept:**

- **Retention is 180 days**, read or unread alike, swept by the existing
  retention cron. An inbox is a record of recent events; a notification nobody
  opened in six months is not one still being waited for.
- **Erasure deletes notifications explicitly.** `eraseMemberTx` anonymises the
  member row rather than deleting it, so `ON DELETE CASCADE` on `member_id`
  never fires during an erasure — the rows would otherwise outlive the person
  they describe. This is easy to get wrong and is covered by a test.
- Notifications are written in the domain transaction, so a failure to write one
  rolls back the domain change with it. That is the right trade for the four
  user-triggered kinds; the two Stripe-driven ones are written in the worker,
  where a `dedupe_key` with a unique index makes a redelivered event a no-op.
- The email copy for the billing kinds still says "VIP access" to listing
  subscribers. The inbox does not fix that — it is a separate known defect.

## Revisit if

- SMS is built. At that point the inbox, email and SMS need one place that
  decides which channels a given kind uses, rather than three call sites.
- The inbox grows past what one un-paginated list can show, or members start
  wanting to keep things longer than 180 days. Either turns "recent events" into
  "an archive", which is a different product with different retention.
- A notification kind ever needs to name another member. That is the signal to
  re-read [ADR 0005](0005-no-member-directory.md) rather than to add the field.
