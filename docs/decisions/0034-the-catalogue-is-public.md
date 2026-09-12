# 0034. The partner catalogue is public; contact details are not

> **Status:** Accepted
> **Date:** 2026-09-12
> **Deciders:** Client, Owner
> **Amends:** [0005](0005-no-member-directory.md), [0022](0022-company-photo-gallery.md), [0023](0023-company-logo-upload.md)

## Context

FR-030 has said since the first draft that the catalogue is for authenticated
members and that a signed-out request gets the sign-in page. The marketing site
was given a curated showcase (FR-035) precisely so that a guest could see that
partners exist without seeing which ones.

In practice the hero's second button, "Our partners", points at `/directory`,
and a signed-out visitor who presses it lands on sign-in. The client's reading,
watching people do it on a phone, is that this is the wrong trade: the partner
list and the discounts attached to it are the argument for joining, and hiding
them behind a form asks a stranger to pay the cost before seeing the reason.

The machinery for the other answer already exists. `public_catalogue` has been a
feature flag since phase 2; the catalogue page, the partner page, the list
action and the sitemap all consult it, and the partner page already splits what
a guest sees from what a member sees. The flag was simply never on outside a
freshly seeded database — it was added after the migration that inserts the
first five flags, and a missing row reads as off.

## Decision

**The partner catalogue is public. A signed-out visitor sees the partner list,
the filters, the search, the partner detail pages and the discount each partner
offers. What a guest does not see is how to reach a partner: contact details,
the referral action and the gallery photos stay behind sign-in.**

- `public_catalogue` is **on**, set by migration rather than left to the seed, so
  a database that has been migrated but never seeded is open. The staff console
  can still close it; that is what the flag is for, and closing it restores the
  old behaviour exactly.
- **The discount value is public.** It is shown on the catalogue card and, as of
  this record, on the partner page too, where it used to be replaced with `••••`
  for a guest. Half-hiding it was theatre once the card next to it showed the
  number.
- **Contact details stay member-only.** Phone, email, website and the referral
  dialog on a partner page are still gated on a signed-in member, and
  `/api/company-image/:imageId` still answers 401 to a guest, so gallery photos
  stay inside the club as [ADR 0022](0022-company-photo-gallery.md) intended.
  Only the logo, already public by [ADR 0023](0023-company-logo-upload.md), is
  served to a guest.
- **Nothing about members changes.** The catalogue lists companies, never the
  people who own them; [ADR 0005](0005-no-member-directory.md) is untouched and
  a guest gains no view of any member that a member does not already lack.
- The domain rule `can(guest, "read", "catalogue")` stays **false**, because that
  subject also guards the gallery-photo route. The flag, read in the page and in
  the list action, is the gate for the public listing; the policy rule describes
  the closed baseline.

## Rationale

The thing being opened is a list of businesses that are paying to be advertised.
Every row in it is a company that submitted itself for publication, was
moderated, and holds a live listing subscription — the population most helped by
being found. The confidentiality this product actually promises is about
**members**, and a member is not disclosed by their company being listed any
more than by their shop having a sign.

Making it public by migration rather than by seed is the difference between a
decision and a default. The seed already had `public_catalogue: true` in its
defaults and production was still closed, which is exactly the failure this
record exists to prevent happening again silently in the other direction.

Keeping contacts closed is what keeps the trade honest. The open catalogue
answers "is there a lawyer in Odesa and what do they give me"; joining answers
"how do I reach them". That is a reason to register, stated on the page, rather
than a wall in front of one.

## Alternatives considered

|Option|Why not|
|-|-|
|Leave the catalogue closed and improve the showcase (FR-035)|The showcase is at most six partners chosen by staff. It answers "do partners exist", never "is there one near me in my category", which is the question the button is pressed to ask|
|Open the list but hide every discount from guests|The discount is the content. A public list of company names with the value removed is a worse showcase, and it leaves the "sign in to see" pattern on the one screen that exists to persuade|
|Open contact details too|Turns the catalogue into a free lead list, removes the reason to register, and publishes partner phone numbers we were given for a members' club|
|Turn the flag on by hand in the staff console|Fixes production for as long as nobody rebuilds the database, and leaves the repository saying the opposite of what is deployed|

## Consequences

**This makes easy:** the marketing site's second call to action does what it
says. The catalogue becomes indexable — the sitemap already emits partner URLs
when the flag is on — so a partner gets search traffic from their listing, which
is the thing the listing subscription sells.

**This makes hard:** every future field added to a partner page now needs a
decision about whether a guest sees it, where before the whole page had one
answer. The partner page's guest and member branches are the place that gets it
wrong, and they need a test each rather than a shared assumption.

**We accept:** that competitors can read the partner list and the discounts.
This is advertising; it was always going to be readable by anyone who paid
$4.99. And that partner content is now crawled, cached and quoted outside our
control, which is the deal a published listing makes.

## Revisit if

A partner asks for their discount terms not to be public, or the catalogue
starts carrying anything a partner did not submit for publication — staff notes,
moderation history, anything derived from member behaviour. Either of those means
the page has stopped being an advertisement, and the gate belongs back on.
