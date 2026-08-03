# 0005. There is no member directory, and the data layer makes one impossible

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Client, tech lead

## Context

Every product in this shape drifts toward a member directory. A closed club with
verified members is one small feature away from "browse members", "find people
near you" or "message another member", and each of those is individually
reasonable, individually requested, and individually the end of the thing being
sold.

The client's brief was unusually explicit: the member list is never published,
there is no open search for people, and the card verification page discloses the
minimum. This is not a privacy setting. It is the product's differentiator
against the open internet the club exists to replace.

The pressure will be real and it will come from good intentions. A support
screen that lists members "to help find one". A referral flow that shows
"members near you" to pick a recipient. An admin export "just for the founder".
Each is a small step, and a policy written in a document does not survive any of
them.

## Decision

No feature will disclose the existence, identity or attributes of one member to
another member. This is enforced structurally rather than by policy: **no
repository function exists that returns a collection of members to a
member-scoped actor**, and an exhaustive automated test walks every route and
Server Action asserting that no response contains another member's identifiers.

## Rationale

A rule that depends on everyone remembering does not survive its first deadline.
Three mechanisms make this one survive:

1. **The data layer has no such function.** Member reads go through
   `getMemberForSelf(actor)` and `getMemberForStaff(actor, id)`. There is no
   `listMembers` reachable from member scope. A developer who wants to build a
   directory must first write the query — and a lint rule confines all SQL to
   `src/data`, where such a change is visible in review rather than buried in a
   page component.
2. **A generated test asserts the absence.** It enumerates the whole route table
   and replays each entry as an unauthenticated visitor, as a member, and as a
   second member, failing if any response body contains a foreign member id,
   phone number or display name. A directory added anywhere breaks the build.
3. **The card verification page is designed as the one deliberate disclosure.**
   It returns validity, tier, serial, issue date and either a display name or
   "Private member" — nothing else, and identically shaped for valid, revoked
   and unknown tokens so it cannot be used as an oracle. The QR token is 128 bits
   of opaque randomness, unrelated to any identifier, rate-limited and
   `noindex`ed.

Two design consequences follow that are worth stating, because they look like
oversights otherwise. Referrals are addressed to **companies**, never to people —
the sender picks a published business from the catalogue, and never sees who
owns it. And staff member search requires an exact identifier (phone number,
card serial or full display name); it does not browse, because a support tool
that lists everyone is a directory with a login.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Opt-in member directory | The failure mode is social, not technical: once a directory exists, not being in it becomes a signal, and the club's promise is quietly inverted. Also, an opt-in list is still a list to be leaked |
| Directory visible only to VIP members | Makes the club's core promise a paid-tier exception. If the answer to "do you publish members" becomes "it depends", the answer is yes |
| Member-to-member messaging without a directory | Requires a way to address a member, which is a directory with extra steps. Referral-to-company covers the legitimate use case |
| Enforce by code review and policy only | This is the option that fails. It works until the sprint where it does not, and nobody notices which sprint that was |
| Row-level security in the database | A real enforcement layer, but it lives behind a service role that server-side code holds anyway, and it is much harder to test and review than a function that does not exist |

## Consequences

**This makes easy:** answering the privacy question honestly in marketing, in
the Privacy Policy and to a regulator; keeping the attack surface small — there
is no enumeration endpoint to defend because there is no endpoint; deciding
future feature requests quickly, because the answer is already written down.

**This makes hard:** several features that users will ask for — member
networking, "who else is here", introductions between people rather than
businesses, community. Also the support workflow: staff must have an exact
identifier before they can help, which is slower.

**We accept:** losing the network-effect features that would probably increase
engagement, and a slower support path. Both are the cost of the thing being
sold. We also accept that the enforcement test is only as complete as the route
table it walks, so it is regenerated in CI rather than maintained by hand.

## Revisit if

Realistically, never — reversing this is reversing the product. The narrow cases
that could be reconsidered without breaking the promise:

- A member choosing to reveal themselves **to one specific partner**, at the
  moment of using a discount, as an explicit per-interaction act
- A staff-only export under `staff_owner` with a mandatory reason and an audit
  entry, for a legal obligation such as a lawful request
- Anything else: write a new decision record explaining what changed about the
  product, not about the technology
