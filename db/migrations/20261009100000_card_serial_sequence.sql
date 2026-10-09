-- FR-020: the card serial becomes the phone's country and a club-wide number
-- starting at 10001 (`UA-10001`). The number comes from this sequence so two
-- registrations at once cannot draw the same one.
--
-- Cards issued before this are renumbered, oldest first, by the data
-- migration that runs right after this one in the production build
-- (tools/data-migrations.ts), or by `pnpm db:renumber-cards --apply` on other
-- databases. Not SQL because the country is read from the phone number by
-- libphonenumber-js, which SQL cannot reach.

CREATE SEQUENCE IF NOT EXISTS "card_serial_seq" START WITH 10001 MINVALUE 10001;
