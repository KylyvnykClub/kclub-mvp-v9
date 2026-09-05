# 0032. A member is a phone number and an email address, and recovery goes to the address

> **Status:** Accepted
> **Date:** 2026-09-05
> **Deciders:** Owner
> **Supersedes:** [0031](0031-identity-returns-to-phone-only.md)
> **Amends:** [0018](0018-staff-assisted-password-reset.md), [0030](0030-registration-says-a-number-is-taken.md)

## Context

This is the third decision about the same question in two days, and the record
should say so plainly rather than present itself as the first.
[ADR 0028](0028-email-identifier-and-account-recovery.md) added a verified email
address as an _optional_ second identifier;
[ADR 0031](0031-identity-returns-to-phone-only.md) withdrew it the same day,
because the cost fell on every registration while the benefit fell on nobody —
all nine existing members hold no address, so the emailed reset it paid for
could not be used by a single person.

That reasoning was sound and it is exactly what changes here. ADR 0031's
recovery answer is a request queue: a locked-out member types their number, a
row appears on the staff console, and an owner resets the password after
identifying the caller by some means the product does not provide. It works
because support is one person who knows every member by name. It does not
survive that person being asleep, on holiday, or dealing with a hundredth
member, and ADR 0031 said as much when it reopened
[requirements.md §9](../requirements.md#9-open-questions).

The way out of that is not to offer an address and hope people supply one — that
was ADR 0028, and the nine members who did not supply one are why it failed. It
is to make the address mandatory, so that from the first registration after this
change every new member holds a recovery channel that costs staff nothing.

The decision is the owner's, not the client's. The client's original position
was phone-only identity ([requirements.md §6](../requirements.md#6-constraints)),
and §7 already recorded the escape hatch — "if volume exceeds ~5 cases/week the
client must accept a recovery email as an optional second channel". This does
not wait for that volume, and it makes the channel mandatory rather than
optional. The client's earlier position is noted here rather than quietly
overwritten.

## Decision

**A member is a phone number and an email address. Both are required to
register, and the address is where account recovery goes.**

- Registration asks for both, **on one screen**. The three-step form — number,
  SMS code, then everything else — becomes a single form: phone number, display
  name, email address, password, repeat password, country. The code screen
  survives behind `AUTH_PHONE_VERIFICATION_ENABLED`, shown after the form
  rather than in the middle of it, so switching Twilio back on does not split
  the form again.
- Neither identifier is optional, and a registration missing either is refused
  at the schema boundary — `src/lib/registration-schema.ts`, which exists as a
  plain module rather than a const inside the Server Action so that a test can
  reach it.
- **The address is not proved before the account works.** Registration
  completes, a verification link is sent, and the member is signed in
  immediately. An address nobody has opened a link for is a _claim_, and a claim
  is enough to hold an account but not enough to act as one.
- Sign-in accepts **either** identifier: a phone number always, a **verified**
  address as well. An unverified address signs nobody in, which is
  [ADR 0028](0028-email-identifier-and-account-recovery.md)'s rule kept
  unchanged and is what stops someone claiming an address they do not own and
  gaining a way into it.
- "Forgot password?" **emails a single-use link** to the verified address on the
  account, as [ADR 0028](0028-email-identifier-and-account-recovery.md)
  described, and revokes every session when the password changes.
- **The staff request queue stays, as the fallback branch of the same call.**
  Where an account holds no address, or holds one nobody has verified, the
  request records a row on the staff console instead of sending mail, and an
  owner performs the reset the way
  [ADR 0018](0018-staff-assisted-password-reset.md) describes. The form's answer
  is one sentence covering both branches, so which branch ran is not disclosed.
- **Existing members are not touched.** `members.email` stays nullable. The
  nine accounts that hold no address keep working, sign in by number, and
  recover through the queue. They are not locked out, not prompted, and not
  migrated.
- **No migration.** `members.email`, `members.email_verified_at`,
  `verification_tokens` and `member_identities` are already there, exactly as
  [ADR 0031](0031-identity-returns-to-phone-only.md) left them for this purpose.
- **Google stays hidden.** `google_signin_enabled` remains off. This record
  changes what registration asks for, not how it is reached.

## Rationale

**One form, because the split was buying nothing.** The first step existed to
ask for a number and request an SMS code; with the code postponed
([ADR 0012](0012-postpone-phone-verification-turnstile-gate.md)) it was one
field on a page of its own, and the middle step was skipped entirely. What the
split did buy was [ADR 0030](0030-registration-says-a-number-is-taken.md)'s
early "that number is taken" — and ADR 0030's actual complaint was that the
message arrived _after_ a name, an address, a password typed twice, a country
and four acknowledgements. On a single screen it arrives against the phone
field with all of those still on the screen and none of them cleared, which is
the outcome that record wanted. The check itself is unchanged and still rate
limited at 20 an hour per address.

**Optional was the defect, not email.** ADR 0031's complaint was that the
address bought nothing, and it bought nothing because it was optional and nobody
supplied one. Mandatory is what turns the same machinery from an unused column
into a recovery channel that works on the first member who uses it.

**Recovery that costs staff attention does not scale, and the club intends to
grow.** The queue is a good answer at nine members and an obviously bad one at
nine hundred. Making the change now means the address is collected from every
member from here on, so the channel is already populated when it is needed —
whereas making it later means a backfill campaign against a membership that has
no reason to answer it.

**Signing in immediately, rather than after proof, is where the ADR 0031 lesson
is applied.** Blocking on a verification link would put Resend on the critical
path of registration and hand every undelivered message a lost member. The cost
of not blocking is an account whose address is unproved, and that cost is
contained by the rule above: unproved means it cannot sign in and cannot reset.
The account still works entirely by phone number until the link is opened.

**Nullable stays nullable because the alternative locks out real people.**
Enforcing the requirement in the database would mean either a destructive
migration against nine live accounts or a fabricated address for each. The
requirement belongs at the boundary that creates members, and it is enforced by
`registerSchema` and proved by a test.

**The fallback is a branch, not a second feature.** `requestPasswordReset`
already exists in both shapes in this repository's history — emailed link
([ADR 0028](0028-email-identifier-and-account-recovery.md)) and queue row
([ADR 0031](0031-identity-returns-to-phone-only.md)). Making the queue the
`else` of the mail path means one entry point, one answer to the caller, and no
way for the two to disagree about who is recoverable.

## Alternatives considered

|Option|Why not|
|-|-|
|Keep ADR 0031 and ask existing members to add an address later|The same optional-address bet ADR 0028 lost. A prompt nobody is obliged to answer produces a recovery channel that is populated for some members and not others, which is the state that made the emailed reset useless the first time|
|Make the address mandatory and block sign-in until it is verified|Puts Resend on the critical path of registration: an undelivered message is then a lost member rather than an unproved address. It also makes a typo unrecoverable without staff, which is the problem this record is trying to remove|
|Make the address mandatory and drop the staff queue|Leaves the nine existing members with no recovery path at all, and leaves anyone who loses access to their mailbox with none either. The queue costs one table and one console screen that already exist|
|Recovery by SMS code instead|[ADR 0012](0012-postpone-phone-verification-turnstile-gate.md) postponed phone verification and Twilio is switched off; turning it back on to answer this would cost money per attempt and put the recovery channel on the same identifier that was lost|
|`NOT NULL` on `members.email`|A destructive migration against live accounts, to enforce at the storage layer a rule that belongs at the boundary which creates members|
|Keep the three-step form and add the address to its last step|Keeps a split that exists for an SMS code nobody is sending, and leaves the address refusal at the end of a form whose earlier answers are on a screen the applicant can no longer see|
|Ask the server whether the address is free as it is typed, the way ADR 0030 does for the number|That is the membership oracle ADR 0030 deliberately did not open for addresses. A field that answers "taken" as you type is an unlimited lookup against every address someone cares to try|

## Consequences

**This makes easy:** account recovery without staff attention, for every member
who registers from now on; a second way to sign in for anyone who remembers
their address and not their number; and a working transactional channel for the
notifications that already exist (payment failures, grace expiry, moderation
outcomes), which previously reached only members who had somehow supplied an
address.

**This makes hard:** registration is one field longer, and the field cannot be
skipped. A member who typos their address is signed in and cannot recover by
mail until they correct it on the profile screen — which is why that screen gets
the address panel and the resend control back in the same change.

**We accept:**

- **FR-001, FR-005, FR-006 and FR-008 are rewritten.** FR-008's "collect only
  display name, preferred language and country at registration" is no longer
  true. §2's scope row and §6's constraint row are corrected, and §9's question
  is closed again — by the owner, on the reasoning above, and it should be
  reopened if that reasoning stops holding.
- **A mandatory new class of personal data.** An address was optional under
  ADR 0028 and unused under ADR 0031; it is now held for every member.
  Retention is unchanged and already written down — anonymised on the 30-day
  member-deletion path, verification tokens hard-deleted at 90 days
  ([data-storage.md §4](../data-storage.md#4-retention-and-deletion)) — but
  `member.email` now joins `member.phone_e164` in the masking view that
  time-boxed incident access reads through. The published Privacy Policy needs
  no amendment — it already lists an email address among the personal data
  collected, unconditionally, so making it mandatory narrows nothing that was
  promised.
- **A membership oracle we are choosing not to open.**
  [ADR 0030](0030-registration-says-a-number-is-taken.md) let registration's
  first step disclose that a number is taken, and stated that "the email path is
  unchanged and stays vague". That stays true: a taken address is refused with
  "that address cannot be used", on the last step of the form, saying nothing
  about who holds it. The applicant pays for that with a worse error at a worse
  moment, and this is the same trade ADR 0030 made in the opposite direction for
  the number. Mitigated only by showing it against the field rather than as a
  form-level failure, and by not clearing what they typed.
- **A member who has not opened the link and tries to sign in by address is told
  "wrong credentials".** It is the correct answer under
  [security.md §6](../security.md#6-application-security-controls) — any other
  wording says whether the address is known — and it will generate support
  contacts. The mitigation is that the verification mail goes out at
  registration and the profile screen can resend it, not a better message.
- **Resend becomes load-bearing for identity, not only for notices.**
  [integration.md §2.3](../integration.md#23-resend) said "email is not a
  verification channel in this product"; that sentence is now false and is
  rewritten. An outage no longer only delays a notification — it delays
  recovery, which is why the queue fallback and the phone identifier both stay.

## Revisit if

- Support handles more than ~5 recovery cases a week that the emailed link could
  not serve — the queue is then the bottleneck it was built to avoid, and the
  identity proof question in §9 needs the client's answer rather than the
  owner's.
- Deliverability to the club's members proves unreliable (bounce or spam-folder
  rate high enough that mail cannot be trusted as the recovery channel), in
  which case the mandatory field is collecting data it cannot use and either the
  vendor or the channel has to change.
- Registration abandonment rises measurably against the phone-only form, which
  would mean the extra field costs more members than the recovery channel saves.
