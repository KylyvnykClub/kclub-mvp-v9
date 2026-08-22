# 0016. Staff TOTP seeds are encrypted at rest, bound to their member, and the existing ones are discarded

> **Status:** Accepted
> **Date:** 2026-08-22
> **Deciders:** Launch owner

## Context

[security.md §3](../security.md#3-data-protection) classifies TOTP seeds as
Secret and states that such values are "hashed (argon2id) or encrypted" and that
"the database never holds a usable credential". While provisioning production
environment variables it emerged that `TOTP_ENCRYPTION_KEY` — declared in
`src/env.schema.ts` and listed as required in
[production-env-readiness.md](../delivery/production-env-readiness.md) — was
read by no code at all.

What actually happened: `generateTotpSecret()` produced a 20-byte key,
base32-encoded it, and the result went straight into `members.totp_secret`, a
plain `text` column. Anyone able to read that table — a backup, a Neon branch, a
database dump, an SQL injection, an operator — could generate valid codes for
any staff account including `staff_owner`. [security.md §1](../security.md)
rates staff account compromise as an impact of "Total", and the second factor
exists precisely to survive a credential leak. It did not.

A seed cannot be hashed the way a password can: verification needs the original
bytes back. So the promise the document makes can only be kept by encryption.

Found before launch. No production data existed, but development and staging
seeds did, and they had already been written to every backup taken so far.

## Decision

We will encrypt staff TOTP seeds with AES-256-GCM under a key derived from
`TOTP_ENCRYPTION_KEY`, bind each ciphertext to its member id as additional
authenticated data, refuse to enrol or verify a second factor when the key is
absent, and discard every seed that was stored before this change rather than
migrating it.

## Rationale

We optimised for _no path that accepts a plaintext seed_, because the failure
being fixed is precisely that such a path existed and nobody noticed for months.
Every alternative that keeps one alive keeps the bug alive in a quieter form.

- **AES-256-GCM** because the value must be recoverable, and because an
  authenticated mode makes a tampered or truncated value fail loudly instead of
  decrypting to garbage that then fails TOTP verification for reasons nobody can
  diagnose.
- **Bound to the member id via AAD** because the threat model already includes
  an attacker with database access. Without binding, copying one row's seed onto
  another staff member's row grants that account to an authenticator the
  attacker holds. With it, the copy simply fails to decrypt. The binding costs
  one line and closes a whole move.
- **Discarding rather than migrating** because every existing seed has been at
  rest in the clear and is in backups that are not going to be rewritten. A
  re-encrypted exposed secret is still an exposed secret, presented as safe.
  Re-enrolment costs each staff member about a minute.
- **Failing closed on a missing key** because the alternative — a nullable key
  and a caller that decides — is a description of the original bug.
- **A version prefix (`totp_v1`)** so that a future key rotation or algorithm
  change can recognise, and refuse, values it did not write.

## Alternatives considered

|Option|Why not|
|-|-|
|Lazy migration: accept a plaintext seed, verify it, then re-encrypt on the next successful sign-in|Keeps a plaintext-accepting branch in the verification path for an unbounded time, and that branch _is_ the vulnerability. It also silently blesses seeds that must be treated as compromised|
|One-shot script that encrypts existing seeds in place|Preserves secrets that have already leaked into every backup, and adds a step that must be run exactly once per environment, with sign-in broken until it is|
|Hash the seed like a password|Impossible. TOTP verification recomputes codes from the original key material|
|Store seeds in an external secret manager|Real improvement at a scale we do not have. One more vendor on the sign-in path, for a table that holds at most a few dozen rows. Recorded in "revisit if"|
|Rely on the database's at-rest disk encryption|Protects against a stolen disk, not against a dump, a branch, a backup or a query — which are the ways this data would actually escape|

## Consequences

**This makes easy:** honouring what security.md already promised; proving it
with a test that drives the real TOTP algorithm through encrypt and decrypt, so
a regression to plaintext storage fails five tests rather than shipping.

**This makes hard:** losing `TOTP_ENCRYPTION_KEY` now means every staff member
re-enrols, because no seed can be read without it. The key belongs in the same
custody as `BETTER_AUTH_SECRET`, with the same rotation owner.

**We accept:** that every staff member with an authenticator today must enrol a
new one, and that a production deploy without the key fails at boot rather than
at the first staff sign-in. Both are deliberate — the second in particular,
because an environment that cannot encrypt a seed is one where no staff member
should be signing in.

## Revisit if

- Staff count passes roughly 50, or seeds need to be readable by more than one
  service, at which point a managed KMS with envelope encryption earns the
  vendor it costs.
- The key must be rotated without re-enrolment, which needs a second key slot
  and a re-wrap pass — the `totp_v1` prefix exists so that day is possible.
- Members gain TOTP as an optional second factor
  ([security.md §2](../security.md#2-authentication-and-authorization)), which changes the row
  count by three orders of magnitude and makes the per-record cost matter.
