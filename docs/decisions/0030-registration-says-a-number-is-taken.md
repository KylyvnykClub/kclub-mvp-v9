# 0030. Registration tells the visitor a phone number is already taken

> **Status:** Accepted
> **Date:** 2026-09-04
> **Deciders:** Owner
> **Amends:** [security.md §6](../security.md#6-application-security-controls)

## Context

Registration is four screens' worth of work: a phone number, then a display
name, an email address, a password typed twice, a country, a language and four
acknowledgements. Until now a number that already belonged to a member was only
discovered at the very end, when the whole form was submitted — the applicant
filled everything in and was told it had all been for nothing.

The first step could not say so earlier because it never asked. With SMS
postponed ([ADR 0012](0012-postpone-phone-verification-turnstile-gate.md)) there
was no code to request, so the phone screen skipped the server entirely and
advanced on its own. The action behind it, when it did run, deliberately
withheld the answer: "don't leak whether the phone is registered".

That silence was not an accident either. [security.md §6](../security.md#6-application-security-controls)
requires sign-in and registration to answer the same way whether or not an
identifier is known, because the club's central promise is that no member is
disclosed to anyone ([ADR 0005](0005-no-member-directory.md)). A form that
answers "that number is registered" is a membership oracle: feed it numbers,
read the answers, and you have a list of who is in the club.

## Decision

The first step of registration now asks the server, always, and says plainly
when the number already belongs to a member — with a link to sign in instead.

The disclosure is bounded rather than free:

- **Rate limited by address**: 20 checks per hour. A person registering makes a
  handful of attempts; a script walking a numbering plan makes thousands, and
  this is the difference between the two.
- **Nothing else is disclosed.** Not who holds the number, not when they joined,
  not whether the account is active. Only that the number is unavailable.
- **The email path is unchanged** and stays vague ("that address cannot be
  used"), because nothing forced the same trade there: an address is typed once,
  on the last screen, and a member who hits it has already been told which
  number they are registering.

## Rationale

**The disclosure already existed; only its position was different.** The end of
the form said exactly this sentence. Anyone willing to fill in a fake name, a
password and four acknowledgements could already enumerate numbers — slowly. So
this decision does not create the oracle. It makes it cheap, and in exchange
makes the form honest with the people it is actually for.

**Cheap is the part that needed answering**, and the answer is the rate limit.
Twenty an hour is generous for a person and useless for enumeration: reading a
national mobile range at that rate takes centuries.

**The alternative was worse for members and barely better for privacy.** Keeping
the silence means every applicant who mistypes their number, or who forgot they
already joined, pays with the whole form. The people that protects are the ones
patient enough to fill it in.

## Consequences

- **security.md §6's enumeration rule now has a stated exception**, and the
  document says so rather than quietly disagreeing with the code. Sign-in, the
  card verification page and password reset are unchanged: all three still
  answer identically whichever identifier they are given.
- The check runs on every first step, including the many that are perfectly
  ordinary, so the rate limit must be Redis-backed in production or it counts
  per instance and protects less than it appears to.
- If enumeration is ever observed, the lever is the limit rather than the
  message: lowering it costs nothing to real applicants.
- A future "sign in instead" that pre-filled the number on the sign-in screen
  would be a further disclosure — it would confirm the number to whoever
  arrives at that screen — and is not part of this decision.
