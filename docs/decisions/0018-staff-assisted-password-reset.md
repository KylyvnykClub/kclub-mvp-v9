# 0018. Recover accounts through a staff-performed reset, as a stopgap

> **Status:** Accepted
> **Date:** 2026-08-23
> **Deciders:** Delivery lead
> **Supersedes:** [0015](0015-password-reset-deferred-to-client.md)

## Context

[ADR 0015](0015-password-reset-deferred-to-client.md) left password reset
unbuilt until the client answered the open question in
[requirements.md §9](../requirements.md#9-open-questions) — "What identity proof
does support accept to restore an account when the phone number is gone?" That
question is still unanswered, and the consequence has stopped being theoretical:
nobody, member or staff, can change a password once it is set, so a member who
mistypes their password at registration has no way back into the account they
just paid for.

The three candidate paths have not changed:

- **SMS for reset only.** Implements [FR-006](../requirements.md#4-functional-requirements)
  as written and adds no personal data, but [ADR 0012](0012-postpone-phone-verification-turnstile-gate.md)
  postponed Twilio, and it cannot help a member whose number is gone — which is
  the case §9 actually asks about.
- **Email as a second identifier.** The only path that survives a lost phone,
  and Resend is already in the stack. It also adds a new class of personal data
  to a product designed around collecting as little as possible, which needs a
  retention period and a deletion path before a single row is written.
- **A staff-performed reset.** No new data, least code, and the identity check
  happens outside the system by whatever means the staff member judges
  sufficient.

## Decision

Account recovery is a reset performed by a staff owner, recorded in the audit
log with the reason the staff member gives for believing the request is genuine.
Every session of that member is revoked as part of the reset. There is no
member-facing self-service path, and the "forgot password" control on the login
form still does not initiate anything.

**This is explicitly temporary.** It is adopted because it unblocks recovery
without pre-empting §9, not because it is the right answer. When the client
answers, expect this record to be superseded in turn.

## Rationale

**It answers the question it can and declines the one it cannot.** The system
has no way to verify that a caller is who they claim to be — no email, no SMS,
no secondary factor of any kind. A self-service flow would therefore have to
invent an identity check, and any check invented here would be the "forbidden
shortcut" ADR 0015 warned against. Moving the judgement to a human does not
solve identity verification; it puts it where a human can be held to it, and
records what they accepted.

**Owner-only, because a reset is account takeover.** Whoever performs a reset
can then sign in as that member and see everything the member sees. That is a
larger capability than blocking, which only removes access, so it sits one rung
above `block member` in the role matrix rather than beside it.

**Revoking sessions is not optional.** FR-006 requires it, and the reason is the
threat this flow is most exposed to: if an attacker has talked staff into a
reset, leaving the real member's sessions alive is the lesser problem; if a
member is recovering from a compromise, the attacker's live session is the whole
problem. Both point the same way.

## Consequences

- Recovery does not scale and is not meant to. Every reset costs an owner's
  attention, which is a feature while the club is small and a defect the moment
  it is not.
- The audit entry records the staff member's stated reason, not proof. It is
  evidence of who decided, not evidence that the decision was right.
- FR-006 remains unsatisfied as written: it specifies a reset "proven by an SMS
  code", and this is not that. The requirement is met in substance — a password
  can be changed, other sessions die — and unmet in mechanism.
- §9 stays open, and stays a launch blocker. This record removes the outage, not
  the question.
