# 0009. Referrals capture consent and minimise, encrypt and expire the client's contact data

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Client, tech lead

## Context

The "refer a client" feature is the club's headline VIP benefit: a member who
owns a business passes a warm introduction to another member's business —
"here's my client, they need your services".

It is also the only feature in the product that transmits personal data about a
person who is not our user, has no account, has agreed to nothing with us, and
in most cases has never heard of KCLUB. Under GDPR that person is a data subject
and we are a controller of their data. Under CCPA they have rights we must be
able to honour. Neither regime cares that we received the data from someone
else.

The naive implementation — a form with the client's name, phone, email, address
and free-text notes, stored indefinitely and delivered immediately — is a
personal-data pipeline between two businesses with us in the middle and no
lawful basis on record. It is also indistinguishable, to a regulator, from a
lead-broking product.

This was identified in [brief.md](../brief.md#biggest-risk) as the project's
second-largest risk, and it is a design problem rather than a legal one: the
legal exposure follows from what the schema allows.

## Decision

The referral feature is built around four constraints, enforced in code rather
than in the Terms:

1. **Minimisation.** The form accepts a name, exactly **one** contact channel,
   the service needed, and an optional short note. There is no field for a
   second channel, an address, a company, a budget or an attachment. What the
   schema cannot hold cannot be over-collected.
2. **Recorded consent.** The sender must attest that the client agreed to the
   introduction. The attestation wording, its version, the timestamp and the
   sender's identity are stored with the referral, and a referral cannot exist
   without them.
3. **Late disclosure.** The contact details are encrypted at the column level
   and are not shown to the recipient until they accept. A recipient who
   declines never sees them.
4. **Expiry by default.** Contact details are deleted within 24 hours of the
   referral being declined, rejected in moderation, or expiring unacted after 14
   days. The referral shell — who referred whom, when, and the outcome — is kept
   for 24 months for abuse and dispute handling, and contains no third-party
   personal data.

## Rationale

The lawful basis for processing the client's data is the client's own consent,
and we cannot obtain it directly — we have no relationship with them. The
attestation is therefore the mechanism: the sender, who does have the
relationship, states on the record that consent was given. That is a
documented, timestamped, per-referral basis, and it is the difference between a
defensible feature and an indefensible one. It also creates the accountability
that makes the sender take it seriously, which is the actual protection for the
client.

Making the attestation prominent rather than a pre-ticked line in the flow is
deliberate, and it is the reason [ux.md §3.4](../ux.md#34-vip-member-refers-a-client)
insists it is shown at full size. A consent record obtained through a dark
pattern is worth nothing in front of a regulator and, more importantly, is
probably false.

Late disclosure is what makes the feature safe in ordinary operation rather than
only in theory. Most of the risk is not a breach — it is routine over-sharing: a
recipient who never responds still ends up holding a stranger's phone number.
Revealing only on acceptance means the data reaches exactly the business that
agreed to act on it.

Encryption at the column level, above the disk encryption the database already
provides, is a proportionality judgement: this is the one class of data in the
system belonging to people who never chose us, and a database dump or a
mis-scoped query should not expose it.

Quotas (10 per day per sender, 3 per day to any one recipient) serve the same
end from a different direction. They are anti-spam controls, and they are also
the thing that keeps the feature a series of personal introductions rather than
a lead-distribution channel — which is both the product intent and the legal
posture.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Collect full contact details and store them indefinitely | The naive design. No lawful basis on record, unbounded retention of third-party personal data, and a feature that reads as lead broking |
| No client data at all — introduce the two businesses only | Genuinely safer, and it removes the feature's value. "I have a client for you" without any way to reach them is a message, not a referral. Retained as the fallback if the compliance position ever becomes untenable |
| Send the client a confirmation and get consent directly | The correct answer in principle. Rejected because it means messaging a stranger who has not heard of us in order to ask permission to hold their data — which is itself a processing act, and a worse first impression than the introduction it protects |
| Verify consent rather than attest it | There is no mechanism to verify it without contacting the client, which is the option above |
| Deliver immediately without moderation | Faster and removes the human bottleneck. Rejected because moderation is what stops the feature becoming a spam channel in its first month, and because the moderation record is part of the accountability trail |
| Let the recipient see contact details on delivery rather than on acceptance | One less click. Means every referral, including unwanted ones, discloses a stranger's details to a business that may ignore it |

## Consequences

**This makes easy:** answering a regulator's "on what basis do you hold this
person's data" with a specific record; honouring a deletion request from a
referred client, because there is very little to delete and it expires anyway;
keeping the feature distinguishable from lead broking, which matters for the
"this is not MLM" positioning as much as for the law.

**This makes hard:** the sender's experience carries friction that a competitor
without these constraints would not have — an attestation, one contact channel,
a visible quota, and a wait for moderation. Rich context ("here's their budget,
here's the email thread") cannot be attached, and some senders will want to.

**We accept:** a slower, more constrained feature than the one that would
demonstrate best in a sales conversation, and a moderation step that costs staff
time and bounds throughput at roughly 50 items per day per moderator. We also
accept that a determined sender can fabricate consent — the attestation records
who claimed it, which is the accountability that a technical control could not
provide anyway.

## Revisit if

- Referral volume exceeds roughly 200 per day, at which point human moderation
  becomes the bottleneck and auto-approval for senders with a clean history is
  the intended escape hatch — with the consent and minimisation constraints
  unchanged
- Counsel advises that the attestation is insufficient in a target market, in
  which case the "introduce the businesses only" fallback is what ships there
- A referred client complains, which would be the strongest available signal
  that the attestation is not reflecting reality
- The volume of encrypted contact records grows past roughly 10,000 per month,
  which would justify per-record envelope encryption with a managed KMS instead
  of a single application-held key
