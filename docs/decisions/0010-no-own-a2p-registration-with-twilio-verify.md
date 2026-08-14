# 0010. Send verification codes through Twilio Verify's registered sender pool, without our own A2P 10DLC registration

> **Status:** Accepted
> **Date:** 2026-08-13
> **Deciders:** Client, tech lead

## Context

[0003](0003-self-hosted-phone-authentication.md) buys SMS code delivery from
Twilio Verify. Alongside it, the planning documents carried a second, separate
obligation: register a brand and campaign under the US carriers' A2P 10DLC
scheme before any production SMS. That obligation was written into
[requirements.md §5.5](../requirements.md#55-compliance-and-legal), the launch
acceptance criteria in [§8](../requirements.md#8-acceptance-criteria) as `AC-12`,
the assumption register in [§7](../requirements.md#7-assumptions), the
[production environment readiness](../delivery/production-env-readiness.md)
checklist, and the critical-path note in
[the delivery plan](../delivery/README.md#1-the-team-stated-honestly).

It was treated as the longest external clock in the project: one to three weeks,
rejectable, and blocking sign-up entirely — which is why
[phase-0.md](../delivery/phase-0.md) deferred it to a pre-launch checklist and
listed its rejection as a standing risk.

The obligation was written for the general case of sending application-to-person
SMS from numbers we own. It does not describe how this product actually sends.
Verify is not a messaging channel we operate; it is a hosted verification
service that owns its own senders.

## Decision

We will send all verification codes through Twilio Verify's own registered
sender pool and will not register a KCLUB A2P 10DLC brand or campaign; `AC-12`
becomes proof that production SMS is delivered and verified end to end, not
proof of a carrier registration.

## Rationale

A2P 10DLC registration binds a sender — a brand and a campaign attached to
long-code numbers the sender controls. With Verify, the sender is Twilio: it
selects the route and the originating number from its own pre-registered pool
per destination, and the KCLUB account never owns a US long code for this
traffic. There is no sender of ours to register, so the registration is not
deferred or waived; it does not apply.

Removing it removes the project's longest lead-time item and its only remaining
launch blocker that could reject us on someone else's schedule. That is the
whole benefit, and it is a large one for a solo build: the critical path in
[the delivery plan](../delivery/README.md#1-the-team-stated-honestly) was explicitly
sequenced around non-code items, and this was the first of them.

**What this does not remove.** The messaging obligations in
[requirements.md §5.5](../requirements.md#55-compliance-and-legal) and
[security.md §8](../security.md#8-compliance) stand unchanged: express consent
captured at sign-up with the exact wording shown, STOP/HELP honoured, and no
marketing SMS without separate consent. Those are TCPA and CTIA obligations on
us as the party causing the message to be sent; they were never satisfied by the
registration and are not affected by dropping it. Nor does this remove the
operational checks that sit beside it — Fraud Guard, geographic permissions and
the daily spend cap are what stand between us and SMS-pumping fraud
([sms-pumping.md](../runbooks/sms-pumping.md)), and they matter more now that no
registration gate sits in front of production traffic.

## Alternatives considered

|Option|Why not|
|-|-|
|Register a brand and campaign anyway, as belt and braces|Costs one to three weeks of external clock, carries a rejection risk that blocks sign-up, and registers a sender we do not use. A gate that cannot fail open is still a gate that can fail closed|
|Keep `AC-12` as written and mark it not applicable at launch|Leaves a launch criterion in the ledger that nobody can close, which is how a ledger stops being read. A criterion that does not apply should be replaced by the one that does|
|Buy Verify but send through our own messaging service and numbers|Reintroduces the registration, the sender management and the routing decisions that [0003](0003-self-hosted-phone-authentication.md) deliberately bought out of|

## Consequences

**This makes easy:** launching without waiting on a carrier registration;
closing `AC-12` with a production smoke test we can run ourselves on the day.

**This makes hard:** nothing in the product. Operationally, we lose the
side-effect visibility that a registered campaign gives into throughput limits
and carrier filtering — if delivery degrades in the US, we diagnose it through
Twilio's Verify logs and support rather than through a campaign dashboard we
control.

**We accept:** a deeper dependency on Verify as the delivery path. Moving off
Verify later means acquiring numbers and completing the registration then, at
whatever the lead time is at that point — this decision does not make that
migration harder, but it does mean it is not already done.

## Revisit if

- We send any SMS that is not a verification code — a renewal reminder, a
  moderation outcome, anything marketing. That traffic does not go through
  Verify, needs numbers we own, and brings the registration back with it
- Twilio changes the Verify sender model, or requires customer-side registration
  for Verify traffic
- US delivery rates or latency degrade in a way Twilio attributes to sender
  reputation rather than to a destination carrier
