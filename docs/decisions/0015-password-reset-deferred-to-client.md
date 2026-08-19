# 0015. Password reset stays unbuilt until the client answers the account-recovery question

> **Status:** Accepted
> **Date:** 2026-08-18
> **Deciders:** Delivery lead

## Context

[ADR 0012](0012-postpone-phone-verification-turnstile-gate.md) postponed SMS
phone verification and, as a named consequence, flagged that FR-006
(password reset proven by an SMS code) has "no second factor left for
recovery" and that "whatever reset path exists must be re-examined before
launch" — but did not decide what replaces it.

No reset flow exists in the code at all: no route, no Server Action, and the
"forgot password" control on `login-form.tsx` is a disabled, non-clickable
span. `docs/ux.md` and `docs/security.md` previously described a working
SMS-based reset ("code to the number, then a new password"; listed
alongside registration in the enumeration/bot-mitigation controls table),
which overclaimed a flow that has never been built.

[requirements.md §9](../requirements.md#9-open-questions) already carries the
open question this depends on: "What identity proof does support accept to
restore an account when the phone number is gone?", owned by the client,
needed before public launch. Building any workaround — re-enabling SMS
specifically for reset, adding email as a second identifier, or a manual
staff procedure — presupposes an answer to that question that does not exist
yet. Adding an email identifier in particular is not a decision to make
unilaterally: it adds a new class of personal data to a product designed
around collecting as little as possible.

## Decision

Password reset is not built. The "forgot password" control stays disabled.
This is deferred, not implemented as a stopgap, until the client answers the
open question in `requirements.md §9`.

## Rationale

**The forbidden shortcut is worse than no shortcut.** ADR 0012 was explicit:
this decision does not authorise an email-less, code-less reset. A reset flow
built without a real second factor would either re-open the account-takeover
surface phone verification existed to close, or quietly add an email
identifier the product was not designed to hold — both bigger decisions than
a single task should make on its own.

**The client's answer changes the shape of the fix, not just whether to
build it.** If the answer is "a support-mediated identity check," the fix is
a staff runbook, not code. If it's "add email as a recovery channel," it's a
schema change with its own retention and consent implications. Building
before the answer risks building the wrong thing.

**Documentation overclaiming a flow that does not exist is its own
liability.** `docs/ux.md` and `docs/security.md` are corrected alongside this
decision so the gap is visible rather than papered over — the account-recovery
question is a genuine, still-open production blocker, not a solved one.

## Alternatives considered

|Option|Why not|
|-|-|
|Re-enable Twilio SMS for reset only, leave registration on Turnstile|Contradicts the given postponement, and a member without SMS access again has no recovery path — doesn't answer the actual open question|
|Add email + Resend-based reset|The obvious pattern, but adds an email identifier to every member without a client decision that this product should collect one at all|
|A staff-mediated manual recovery procedure|Plausible, and might be the client's answer — but writing the runbook now, before the identity-proof question is answered, means guessing what "proof" the club will accept|

## Consequences

**This makes easy:** no code shipped that has to be unwound once the client's
answer changes the design.

**This makes hard:** a member who loses access to their phone number has no
self-service or staff-assisted way back into their account today.

**We accept:** this is a genuine, unresolved production blocker
(`requirements.md §9`, owner: client, needed by: before public launch) — not
a closed gap. It stays open until that question is answered.

## Revisit if

The client answers `requirements.md §9`'s identity-proof question — at which
point this ADR is superseded by whichever flow the answer implies.
