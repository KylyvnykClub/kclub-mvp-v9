# 0007. Keep staff identities entirely separate from member identities

> **Status:** Accepted
> **Date:** 2026-08-02
> **Deciders:** Tech lead, client

## Context

The club has two populations: members, who sign in with a phone number and a
password, and staff, who moderate, administer and can see other people's data.
Some staff will also be members — the owner certainly will be.

The natural shortcut is one `user` table with a `role` column. It is less code,
one sign-in flow, one session model, and every framework's tutorial does it that
way.

It also means that the sign-in form which anyone on the internet can reach is
the same one that leads to the ability to block members, revoke cards and change
prices — separated only by a column value.

## Decision

Staff are stored in a separate `staff_user` table with their own credentials,
their own session table, their own sign-in flow, their own hostname
(`admin.kclub.com`) and their own cookie. There is no foreign key between
`staff_user` and `member`, and no code path that converts one into the other. A
staff member who is also a club member holds two accounts.

## Rationale

Separation removes a whole class of failure rather than defending against it.

**Privilege escalation needs a path, and there is none.** With one table, every
account-mutating code path — password reset, phone change, profile update,
account merge, an admin "impersonate" feature — is a potential route to setting
a role. With two tables, a compromised member account cannot become staff
because there is nothing to escalate into; it would require creating a row in a
table the member-facing code never writes to.

**Different populations deserve different security policies, and one table
forces a compromise.** Members get 30-day sliding sessions and optional TOTP,
because friction costs sign-ups. Staff get 8-hour sessions, mandatory TOTP and
re-authentication before destructive actions. Members authenticate with a phone
number; staff with an email address, because staff are employees with company
mail and no SMS cost, and because the club's own phone-only constraint exists
for member privacy, not for the payroll.

**The blast radius of an authentication bug is halved.** A flaw in the member
sign-in flow — enumeration, a timing leak, a reset-token weakness — does not
touch the console, because the console does not share that code.

**The audit trail stays meaningful.** `audit_log.actor_type` is `member`,
`staff` or `system`, and there is no ambiguity about which hat someone was
wearing. When the owner blocks a member, the log says a staff user did it — not
that a member with elevated privileges did.

Three-hostname separation compounds the benefit at no extra cost: cookies are
host-only, so a member session cookie is never sent to `admin.kclub.com` and
cannot be replayed there; CSP, indexing rules and rate limits differ by purpose;
and the console can be network-restricted later without touching the member
area.

## Alternatives considered

|Option|Why not|
|-|-|
|One `user` table with a `role` column|The shortcut. Every account-mutation path becomes a potential escalation path, and one session policy must serve two populations with opposite needs|
|One table with a separate `staff_profile` extension|Better, but the shared credential and session rows are exactly the parts whose separation provides the benefit|
|Separate tables with a foreign key linking a staff user to their member account|Convenient — "see my own card from the console" — and it reintroduces the traversal that the separation exists to prevent. The convenience is worth less than the property|
|One table plus row-level security|Puts the boundary in a place that is hard to test and easy to bypass with the role the application already holds|
|Delegating staff auth to an external identity provider (Google Workspace SSO)|Genuinely attractive for staff specifically, and a plausible future step. Deferred because it adds a vendor and an OAuth flow for four people, and mandatory TOTP already gets most of the benefit|

## Consequences

**This makes easy:** applying strict session and MFA policy to staff without
punishing members; reasoning about escalation, because there is no path;
unambiguous audit attribution; restricting or relocating the console later
without touching member authentication.

**This makes hard:** two sign-in flows, two session mechanisms and two password
policies to build and maintain — perhaps a week of extra work. A staff member
who is also a member manages two accounts and two passwords, and will find that
mildly annoying forever. Any future "view the product as this member" support
feature has to be built deliberately as an impersonation mechanism with its own
audit trail, rather than falling out of a shared table.

**We accept:** the duplication, and the small ongoing friction for the handful of
people who hold both accounts. Four to twelve staff is a small enough population
that the inconvenience is bounded, and the property bought is not.

## Revisit if

- Staff headcount grows past roughly 20, at which point provisioning two
  accounts by hand becomes a real process problem and SSO for staff becomes the
  better answer — which this separation makes easier, not harder
- The club acquires a genuine need for staff to act as a member in the product
  itself, which should be built as audited impersonation rather than by merging
  the tables
