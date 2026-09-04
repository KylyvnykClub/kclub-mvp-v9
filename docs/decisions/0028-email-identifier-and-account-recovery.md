# 0028. Add a verified email address as a second identifier, and recover accounts through it

> **Status:** Superseded by [0031](0031-identity-returns-to-phone-only.md)
> **Date:** 2026-09-04
> **Deciders:** Owner
> **Supersedes:** [0018](0018-staff-assisted-password-reset.md)
> **Amends:** [0003](0003-self-hosted-phone-authentication.md), [0012](0012-postpone-phone-verification-turnstile-gate.md)

## Context

[ADR 0018](0018-staff-assisted-password-reset.md) adopted a staff-performed
password reset and said in as many words that it was temporary: it unblocked
recovery without pre-empting the open question in
[requirements.md §9](../requirements.md#9-open-questions) — "What identity proof
does support accept to restore an account when the phone number is gone?"

The owner has now answered that question: **a verified email address.** The same
answer settles two others that were waiting behind it. `AC-01` in
[production-launch-evidence.md](../delivery/production-launch-evidence.md) is
blocked on [FR-006](../requirements.md#4-functional-requirements) alone, and
[ADR 0012](0012-postpone-phone-verification-turnstile-gate.md) rejected email
verification on the explicit grounds that "the product has no email identifier"
— a fact this record changes.

What is being overturned is not an internal preference. Three places in
`requirements.md` record phone-only identity as the client's own decision:
FR-001 ("must not accept an email address as an identifier"), the §2 scope table
("Email or social sign-in — Rejected by the client. Phone only") and the §6
constraint table. ADR 0018 warned that reversing it "is not a decision to make
unilaterally". This record is that decision, made by the owner, with the
client's earlier position noted rather than quietly overwritten.

## Decision

A member may hold **one email address**, unique across members, and prove it by
opening a single-use link sent to it. The phone number stays mandatory and stays
the primary identifier; the address is a second way in and the channel that
proves identity when the number is gone.

Concretely:

- `members.email` and `members.email_verified_at`, both nullable. Nullable is
  the point: members who registered before this change hold neither and are
  asked to add one, never locked out until they do.
- Proof is a `verification_tokens` row holding the **SHA-256 of the token**, the
  address it was issued for, an expiry and a consumed-at stamp. The token itself
  exists in the member's mailbox and nowhere else.
- Claiming an address never carries a verification over. An unverified address
  signs nobody in and resets nothing; it is a claim.
- The staff-performed reset from ADR 0018 **stays**, for members who hold no
  address.

## Rationale

**Email is the only channel that survives the case §9 asks about.** SMS proves a
number to someone who still has it; the question is what to do when they do not.
Twilio also remains postponed by ADR 0012, so the SMS path is not available even
for the cases it would cover.

**One address, unique, or the recovery is not a recovery.** If two members could
hold the same address, a link sent to it would prove nothing about which of them
asked.

**The token is stored as a hash, like every other bearer credential here.** Same
shape as `sessions.token_hash`, with its own domain prefix so a token issued for
verification cannot be presented as a password reset. A database dump yields no
working link.

**Redemption is a POST behind a button, not a GET.** Mail clients, corporate
filters and link previewers follow URLs in messages. A one-time token spent by a
scanner is a member who cannot verify their own address and has no idea why.

**"That address cannot be used" is one answer, not two.** An authenticated
member asking whether an address is already registered is still asking who is in
the club ([ADR 0005](0005-no-member-directory.md)). The claim path therefore
relies on the unique index refusing the write, and reports the refusal without
saying what caused it.

## Consequences

- **A new class of personal data.** An email address is stored, so it needs a
  retention period and a deletion path before the first row exists: it is
  anonymised on the existing 30-day member-deletion path, and verification
  tokens are hard-deleted at 90 days, alongside the `phone_verification` rows in
  [data-storage.md §4](../data-storage.md#4-retention-and-deletion).
- **FR-001 is rewritten**, and the §2 scope and §6 constraint tables corrected.
  §9's question is closed by this record. FR-005 (signing in with an address)
  and FR-006 (the reset itself) are rewritten as those flows are built — the
  identifier has to exist before either can name it.
- **ADR 0012's rejection of email verification lapses** — it rested on the
  product having no email identifier, which is no longer true. SMS stays
  postponed on its own terms.
- **ADR 0003 is amended, not overturned.** Credentials, sessions and devices
  stay self-hosted in our own PostgreSQL; nothing moves to a vendor. Adding
  Google as an optional _entry point_ is a separate decision with its own record
  — it carries a privacy cost this one does not, because it tells Google which
  people are in the club.
- **Recovery still ends every session**, as FR-006 requires. That half of the
  requirement is unchanged and is the half most easily forgotten.
- The staff-assisted path keeps its audit entry and its owner-only gate. It is
  now the fallback rather than the only route.
