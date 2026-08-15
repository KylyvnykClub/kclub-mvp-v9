# 0012. Postpone SMS phone verification and gate registration with Cloudflare Turnstile instead

> **Status:** Accepted
> **Date:** 2026-08-15
> **Deciders:** Client, tech lead

## Context

Registration was a three-step flow: enter a phone number, enter the 6-digit code
Twilio Verify sent to it, then fill in the profile. The code step satisfied
[FR-002](../requirements.md#4-functional-requirements) and was also, in practice,
the anti-abuse gate on account creation — a bot needed a working phone number per
account.

[ADR 0003](0003-self-hosted-phone-authentication.md) chose Twilio Verify for that
delivery, and [ADR 0010](0010-no-own-a2p-registration-with-twilio-verify.md)
removed the A2P 10DLC registration that was thought to block it.

The client has asked to postpone Twilio and to keep a Cloudflare check instead.
Cloudflare Turnstile was already named in the environment schema and the
readiness checklist as the intended bot defense; it had never been implemented,
so at the moment of this decision the registration flow has **no** bot defense
other than the SMS code that is being removed.

## Decision

Phone verification is switched off behind `AUTH_PHONE_VERIFICATION_ENABLED`,
which defaults to `false`. While it is off, registration does not request, send
or check an SMS code, and the code step disappears from the form.

Cloudflare Turnstile is implemented and verified server-side on registration. In
a production deployment with phone verification off, `TURNSTILE_SECRET_KEY` is
mandatory: the application refuses to boot without it.

The Twilio integration, its credentials and its documentation stay in the
repository. This is a postponement, not a removal.

## Rationale

**A flag, not a deletion.** The work to re-enable SMS is one environment
variable, and the schema makes that safe: turning the flag on without the three
Twilio keys fails at boot rather than at the first registration. Deleting the
integration would have made the return a re-implementation, and nothing about
the request suggests the decision is permanent.

**Turnstile before, not after.** Removing the SMS code without adding a
replacement would leave account creation with no cost at all — a script could
mint members for as long as it liked, and every one of them would hold a
membership card serial. The two halves of this decision are not separable, which
is why they land together.

**Fail closed.** `verifyTurnstileToken` rejects the registration when Cloudflare
is unreachable, rather than allowing it through. That trades availability for
abuse resistance on exactly one endpoint, and the endpoint is the one that
creates accounts. A registration that fails during a Cloudflare outage is a
retry; a registration that succeeds during one is an open door for as long as
the outage lasts.

**Production refuses to run unprotected.** The env schema requires the Turnstile
secret when phone verification is off and `VERCEL_ENV=production`. Outside
production the check is skipped when no secret is configured, so local and
preview work without Cloudflare credentials.

## Consequences

Requirements that are now unsatisfied while the flag is off, and must be
recorded as such rather than quietly assumed:

- **FR-002** (6-digit code, 10 minutes, 5 attempts) — not performed
- **FR-004** (no member record visible before the number is verified) — a member
  row is now created from an unverified number. The blast radius is limited by
  [ADR 0005](0005-no-member-directory.md): no member is disclosed to another
  member, so an unverified number is visible to staff only
- **FR-005** (fresh SMS code from an unrecognised device) — not performed
- **FR-006** (password reset proven by an SMS code) — **there is no second
  factor left for recovery.** Whatever reset path exists must be re-examined
  before launch; this decision does not authorise an email-less, code-less reset
- **FR-011** (phone change with dual verification) — the verification half does
  not run
- **AC-12** (production SMS delivered end to end) — no longer a launch blocker;
  it becomes a Turnstile check instead

**Phone numbers are now unverified data.** They are still unique and still the
login identifier, but the system no longer has evidence that the person
registering controls the number. Anything that later depends on that evidence —
account recovery, staff contacting a member, an SMS notification — has to
account for it.

**FR-020 still holds:** the membership card is issued during registration, which
previously coincided with verification. It now coincides with an unverified
registration, so a bot that defeats Turnstile obtains a card serial.

## Alternatives considered

**Keep the code step and stub the sender.** Rejected: a verification step that
verifies nothing is worse than no step, because the code path stays live and
looks like a control in every subsequent review.

**Email verification instead.** Rejected for now: the product has no email
identifier ([ADR 0003](0003-self-hosted-phone-authentication.md)), and adding one
is a larger change than the postponement warrants.

**Rate limiting alone.** Already in place ([FR-003](../requirements.md#4-functional-requirements)),
and not sufficient on its own — it slows a distributed bot down without stopping
it.
