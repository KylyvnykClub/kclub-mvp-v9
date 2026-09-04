# 0031. Identity returns to phone only, and recovery goes through staff again

> **Status:** Accepted
> **Date:** 2026-09-04
> **Deciders:** Owner
> **Supersedes:** [0028](0028-email-identifier-and-account-recovery.md)
> **Amends:** [0018](0018-staff-assisted-password-reset.md), [0029](0029-google-sign-in.md)

## Context

[ADR 0028](0028-email-identifier-and-account-recovery.md) added a verified email
address as a second identifier and made it the channel account recovery runs on;
[ADR 0029](0029-google-sign-in.md) added Google on top of it. Both shipped and
reached production on the same day.

Trying them there changed the owner's mind. The cost landed on the ordinary
case: every registration now asked for an address as well as a number, and a
member arriving through Google was returned to a form that still needed a phone
number — because one is mandatory — which read as the button having done
nothing. The benefit was thin in return: nine existing members hold no address,
so nobody could use the emailed reset yet, and the club's support is one person
who already knows every member by name and number.

## Decision

**A member is a phone number and a password again.**

- Registration asks for a number, not an address.
- Sign-in offers a number, not a choice of identifier.
- "Forgot password?" no longer emails a link. It **records a request** that
  appears in the staff console, and a staff owner performs the reset the way
  [ADR 0018](0018-staff-assisted-password-reset.md) already describes — after an
  identity check made outside the system.
- **Google is hidden, not removed.** The `google_signin_enabled` feature flag is
  off, which is also what a missing flag row reads as, so the button is absent
  and both OAuth routes answer 404. The credentials stay where they are and the
  code stays where it is.
- **The database keeps its shape.** `members.email`, `members.email_verified_at`,
  `verification_tokens` and `member_identities` stay, empty and unread. Nothing
  is dropped, because there is nothing to drop — production holds no address and
  no token — and keeping them makes the reversal of this reversal a single
  change with no migration.

## Rationale

**The email identifier was answering a question the club does not have yet.**
§9 asked what proof support accepts when the phone number is gone, and an
address is a good answer _at scale_. At nine members it is a second thing to
collect, store and protect for a case a phone call already handles.

**A request queue is the missing half of ADR 0018, not a new mechanism.** That
record's weakness was never the reset — it was that a locked-out member had no
way to reach anyone that the product itself provided. The queue closes that
without inventing an identity check: the row is a request for attention, it
grants nothing, and the reset above it keeps its owner-only gate and its audit
entry.

**Hiding Google costs nothing and deleting it costs the work twice.** The flag
already existed as a mechanism, `isEnabled` treats a missing row as off, and the
routes now check it as well as the credentials — a hidden button is not a closed
door if the URL still works.

**Keeping the columns is not indecision.** They are empty, they are read by
nothing, and they carry no personal data in that state. Dropping them would mean
a destructive migration against production to remove something that costs
nothing to keep, and a second one to bring it back.

## Consequences

- **FR-001, FR-005 and FR-006 are rewritten** to describe the phone-only
  product, with FR-006 now satisfied by the request queue plus the staff reset
  rather than by an emailed link. §9's question, which ADR 0028 recorded as
  answered, is **reopened**: this is a stopgap that works at this size, and the
  answer will be needed again before the club is much larger.
- **`AC-01` stays honest**: FR-006 has an implementation and a test naming it,
  and the implementation is staff-performed. If the launch criteria intend
  self-service, this does not satisfy them.
- The member-facing email surfaces are gone: no address on the settings screen,
  no confirmation page, no emailed reset. `src/lib/email.ts` and the token
  machinery stay, unused, as the seam to bring them back.
- **New personal data**: the request queue stores a phone number the caller
  typed, which the member already gave us, plus who dealt with it and when. It
  is deleted with the member, and it holds nothing else.
- The password-reset request form is another anonymous endpoint that takes a
  phone number, so it answers identically whatever it finds and is rate limited
  by number and by address. Registration's first step remains the one place that
  discloses whether a number is known ([ADR 0030](0030-registration-says-a-number-is-taken.md)).
