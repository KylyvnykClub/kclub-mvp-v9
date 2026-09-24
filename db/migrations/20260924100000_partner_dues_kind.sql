-- ADR 0036: a business partner pays for a listing, not for membership dues.
--
-- A fourth kind of member. `partner` is an account created through the partner
-- application (FR-108): it never sees the $4.99 dues screen, and what opens the
-- club for it is an active listing subscription instead. The rule that reads
-- this column is `membershipAccess` in src/domain/membership.ts.
--
-- Only the value is added here. Postgres permits ALTER TYPE ... ADD VALUE
-- inside a transaction from 12 onwards as long as the new value is not also
-- used in it, and nothing below uses it: no existing member becomes a partner,
-- because every existing member registered through the member form.
ALTER TYPE "member_dues_kind" ADD VALUE IF NOT EXISTS 'partner';
--> statement-breakpoint

-- The application is one page now (FR-109), so there is no step to resume at.
-- What the draft remembers is the answers; where the applicant had got to was
-- only ever a property of the wizard that no longer exists.
ALTER TABLE "company_drafts" DROP COLUMN IF EXISTS "step";
