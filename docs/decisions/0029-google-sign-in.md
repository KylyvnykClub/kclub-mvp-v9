# 0029. Offer Google as an optional way in, without moving identity to Google

> **Status:** Accepted
> **Date:** 2026-09-04
> **Deciders:** Owner
> **Amends:** [0003](0003-self-hosted-phone-authentication.md)
> **Builds on:** [0028](0028-email-identifier-and-account-recovery.md)

## Context

[ADR 0028](0028-email-identifier-and-account-recovery.md) gave a member a second
identifier: an email address they have proved. That makes a third way in
possible — letting Google do the proving — and the owner has asked for it.

It has to be reconciled with
[ADR 0003](0003-self-hosted-phone-authentication.md), which rejected Firebase
Authentication in as many words: it _"would place member identity in Google's
control, which sits badly beside a privacy promise."_ That reasoning has not
stopped being true. It is narrower than it looks, though: what ADR 0003 refused
was **outsourcing identity** — credentials, sessions and the member record
living in a vendor's system. This is a different thing, and it carries a
different, smaller cost that is worth naming rather than glossing.

## Decision

A member may sign in with Google. The club still owns every credential and
every session; Google is an entry point, not the system of record.

- A `member_identities` row links a member to a provider account by Google's
  **subject id**, never by the address. One provider account belongs to one
  member; one member holds at most one account per provider. Both are unique
  indexes.
- Sign-in matches on that link. Failing that, it matches an existing member
  **only when Google says the address is verified and that member has proved
  the same address here.**
- Where nobody holds the address, the proved identity is sealed into a
  short-lived signed cookie and the member is sent to registration: **Google
  cannot supply a phone number, and the phone number is still mandatory**
  (ADR 0028). Registration then marks the address verified without sending a
  link, and links the account, in the transaction that creates the member.
- **Staff cannot sign in through Google.** They hold a mandatory second factor
  (FR-080) and this route cannot ask for it.
- With no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` the button is not rendered
  and both routes answer 404.

The exchange runs through `arctic` — a small, provider-only OAuth 2.0 client by
the author of the `@oslojs/*` packages already in this codebase.

## Rationale

**Matching on the subject id, not the address.** An address can change hands at
a provider; the subject id is what Google promises is stable. Matching on the
address would mean that whoever holds it at Google today holds the account here.

**Both sides must have proved the address.** Google's verification alone is not
enough to attach to an existing member, and the reason is a concrete takeover:
someone registers here with a stranger's address and never confirms it; the
stranger later signs in with Google; matching on address alone would hand them
the squatter's account — or, seen from the other side, hand the squatter
everything the stranger later does. So a member whose address is unproved is
refused, and told to confirm it the ordinary way first.

**A signed cookie, not a query parameter.** The pending identity must survive
one redirect and must not be editable by the browser holding it — if it were,
anyone could register with any address and have it marked verified, which is
precisely the proof the password reset will trust. A query parameter would also
end up in browser history and in referrer headers.

**Hand-rolling the exchange was the alternative and was rejected.** PKCE, the
token request and the error shapes are where an OAuth mistake is silent rather
than loud, and this project has no second engineer to catch it.

**The `id_token` signature is not verified, deliberately.** The token is fetched
by us, directly from Google, over TLS, in exchange for a code and a PKCE
verifier — OpenID Connect Core §3.1.3.7 says a client may skip signature
validation in exactly that case. A token arriving by any other path must never
reach that reader, which is why the function that reads claims is only called
with what the token endpoint returned.

## Consequences

- **Google learns which people are in this club** — every member who uses the
  button tells it so. That is a real cost against
  [ADR 0005](0005-no-member-directory.md)'s promise, paid knowingly for
  convenience, and it is the reason the button is optional rather than the
  primary path. Members who do not want it are not asked to use it.
- ADR 0003 stands otherwise: credentials, sessions, devices and staff TOTP stay
  in our own PostgreSQL. Nothing about the member record moves to a vendor.
- A new vendor row belongs in [integration.md](../integration.md), and two new
  environment variables in
  [production-env-readiness.md](../delivery/production-env-readiness.md). The
  redirect URI is matched exactly by Google, so a deployment whose public origin
  differs from the registered one needs `GOOGLE_REDIRECT_URI`.
- A member who links Google and later loses access to that Google account is not
  locked out: the password and the phone number still work, and the emailed
  reset still works.
- No refresh token is stored. This is a sign-in, not an ongoing authorisation to
  act on the member's Google account, so nothing is kept after the exchange.
