# 0027. One phone number format, normalised on the server, validated as reachable by SMS

> **Status:** Accepted
> **Date:** 2026-09-02
> **Deciders:** Launch owner (via session)

## Context

A member is their phone number. `members.phone` is `varchar(20) NOT NULL
UNIQUE`, its column comment has said "FR-001: E.164 phone number" since the
schema baseline, and `findMemberByPhone` compares it with `=`.

Nothing enforced any of that. The application held three incompatible opinions
about what the string may look like, and they had drifted apart without anyone
choosing:

|Boundary|Schema|
|-|-|
|Sign-in, registration, code request ([`actions/auth.ts`](../../src/actions/auth.ts))|`z.string().min(8).max(20)`|
|Staff creation ([`actions/staff.ts`](../../src/actions/staff.ts))|`z.string().trim().min(8).max(20)`|
|Phone change ([`actions/profile.ts`](../../src/actions/profile.ts))|`/^\+[1-9]\d{6,14}$/`|

So `+380 67 123 45 67` and `+380671234567` were two different members. The
unique index did not object, because the two strings genuinely differ. A person
who registered with one spelling and signed in with the other was told "invalid
phone number or password", and a person who registered twice held two accounts,
two card serials and potentially two subscriptions. The phone-change screen,
alone in demanding E.164, had to explain itself with a hint string
(`auth.phoneE164Hint`, "International format, e.g. +380501234567") — a form
field apologising for the absence of this record.

The regex was not a fix either. `^\+[1-9]\d{6,14}$` accepts `+9999999999`,
which is not a number anywhere, and accepts a landline, which cannot receive
the code FR-002 sends.

## Decision

**One module owns the format** — [`src/lib/phone.ts`](../../src/lib/phone.ts) —
and every trust boundary uses it. Normalisation happens on the server and always
produces E.164. The client is never believed: the registration flow carries the
number through its steps in React state and posts it back raw, so the schema is
idempotent and runs again on the last step.

**Validation is `libphonenumber-js` with the `mobile` metadata set.** This is
the smallest set that can tell a mobile number from a landline, and that
distinction is the product's rather than a preference: FR-002 delivers the
verification code by SMS, so a number that cannot receive one is not an identity
this club can issue. Measured against the alternatives, on `+380442345678`
(a Kyiv landline):

|Metadata|Landline verdict|gzipped|
|-|-|-|
|`min`|**valid** — would be accepted, then never receive its code|19.6 kB|
|**`mobile`**|**invalid**|**24.4 kB**|
|`max`|valid, with `getType()` reporting `FIXED_LINE`|40.4 kB|

`max` can reach the same answer, but only by making every caller remember to
ask for the type; `mobile` puts the product's rule in the metadata. In the US
and Canada the carrier ranges are shared, so `FIXED_LINE_OR_MOBILE` is the most
any set can say there and both kinds are accepted. The default country for a
number typed without `+` is **US**.

**Claiming a number and looking one up are different boundaries.**

- `phoneSchema` — registration, phone change, staff creation. Rejects anything
  that could not receive its code. Yields E.164.
- `phoneLookupSchema` — sign-in, and requesting a code for a number that may
  already exist. Normalises and does not validate.

Sign-in deliberately does not validate. Validating there protects nothing — a
number that is not in the table is simply not found — while locking out every
row written before this record, the seeded staff owner among them
(`ADMIN_BOOTSTRAP_OWNER_PHONE` is `+380000000000`: well formed, not a real
number, and now impossible to register). Unparseable input passes through
unchanged so an exact legacy match stays reachable.

**The existing rows are rewritten before the code that assumes them ships**, by
[`pnpm db:normalize-phones`](../../tools/normalize-phones.ts). It reports by
default and writes only with `--apply`.

## Rationale

The ordering is the whole risk. `findMemberByPhone` compares with `=`, so the
moment sign-in starts normalising its input, every row still holding an
unnormalised number is unreachable and that member is locked out of an account
they are paying for. The backfill therefore runs first, against a report a human
has read.

It is a tool and not a SQL migration for the reason
`20260827160000_company_slug_backfill` already documented about `companySlug`:
the migration cannot call the code that knows the answer. A national number
cannot be read without knowing its country — `0671234567` names a different
person in every country — and `members.country` is the only hint the row
carries. Applying it needs `libphonenumber-js`, which SQL cannot reach.

A collision stops the run. Two rows can collapse onto one number, because that
is precisely what the defect allowed; deciding which of two accounts keeps the
number is a decision about subscriptions, card history and audit trail, not a
rewrite, so the tool prints the pairs and writes nothing.

## Alternatives considered

|Alternative|Why not|
|-|-|
|Keep the E.164 regex, apply it everywhere|Accepts `+9999999999` and every landline. It checks the shape of a number, which is not the property the product needs|
|`libphonenumber-js/min`|5 kB cheaper and calls a landline valid. The member passes registration and never receives a code, and we pay for the SMS that could not arrive|
|`react-phone-number-input`|Brings its own country list, English-only names and styling, where [`src/lib/countries.ts`](../../src/lib/countries.ts) already localises names into en/ru/uk and renders flags. Four transitive dependencies, `prop-types` among them, for a select this repo can already build|
|Store the number as typed, normalise on read|Every query would have to normalise both sides, and the unique index — the thing that makes a phone an identity — would stop meaning anything|
|Normalise in a SQL migration|Cannot read a national number. Would have to assume one country for the whole table|
|Validate on sign-in too, for symmetry|Locks out every pre-existing row and the seeded staff owner, and defends nothing: the lookup already fails for a number that is not there|

## Consequences

**This makes easy:** trusting `members.phone`. One spelling per person, the
unique index means what its comment always claimed, and Twilio receives the
E.164 its API documents. A country can be refused by dialling code in one place
when FR-003's fraud-destination rule is built.

**This makes hard:** registering a landline, a VoIP range the metadata does not
list as mobile, or a synthetic number. That is intended for members; it also
means fixtures need real-looking numbers. Of the phone literals in the seeds and
tests, 8 of 15 would now be refused — including the `+1555…` reservations and
`+380000000000`. None of them break: `tools/seed.ts` writes through the data
layer rather than the Server Actions, and no integration test calls an action,
so the strict schema never sees them.

**Not solved here:** FR-003's rejection of numbers from destinations disabled
for fraud reasons — the schema now knows the country, which is what that rule
needs, but the list itself is a separate change. The Zod failure message is
still English prose returned to the form, like every other message in these
actions; the three locales arrive with the phone input in the following commit.

**Revisit when:** the metadata's idea of a mobile range costs a real member
their registration — VoIP and newly allocated ranges lag the metadata — at
which point the choice is a `max`-plus-`getType()` allowance for
`FIXED_LINE_OR_MOBILE`, or a staff override.
