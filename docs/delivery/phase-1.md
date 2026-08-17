# Phase 1: Identity and card

## 2. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-1.1|`src/data/schema` for members, sessions, legal_acceptances, cards and run migrations|—|—|0.5d|done — schema files in src/data/schema, 11 migrations in db/migrations|
|T-1.2|`crypto.ts` and `twilio.ts` integration for SMS codes|—|T-1.1|0.5d|done — src/modules/identity/crypto.ts + twilio.ts|
|T-1.3|`src/modules/identity/service.ts`: Registration and session logic|FR-001, FR-002, FR-003|T-1.1, T-1.2|1d|done — register, login, authenticate, logout|
|T-1.4|MDX compilation pipeline and legal doc skeletons|FR-093|—|1d|done 2026-08-06 — nine executed documents published as locale-aware MDX with authoritative flag; RU text only, EN/UK translation gap recorded|
|T-1.5|Registration flow UI (`/register`) with terms acceptance|FR-097|T-1.3, T-1.4|1.5d|done 2026-08-06 — four separate acknowledgements (terms, privacy, arbitration §29–30, age 18+), versions validated against published documents|
|T-1.6|Login flow UI (`/login`) and session management logic|FR-005, FR-006, FR-007, FR-010|T-1.3|1d|done — /login page, loginAction, logoutAction, session middleware|
|T-1.7|Profile management (name, language, country, deletion, phone change)|FR-008, FR-009, FR-011|T-1.3|1d|done 2026-08-14 — updatePersonalInfoAction (name/language/country), phone change with dual Twilio verification (old+new), RBAC on all profile actions, Settings tab, i18n in 3 locales, 7 integration tests; account deletion was done in T-3.11|
|T-1.8|Dashboard virtual card UI and wallet pass logic|FR-020, FR-021, FR-026, FR-027|T-1.3|1d|partial — card-qr.tsx renders QR on dashboard; the billing projection reflects a tier change onto the card with no cache in the way (FR-026, tests/cards.integration.test.ts) - the 60-second bound itself is not asserted by a test, only carried by the outbox-drain cron's one-minute cadence; wallet pass generation (FR-027) not implemented|
|T-1.9|Public card verification page (`/card/[token]`)|FR-022, FR-023, FR-024|T-1.1|0.5d|done — page exists at /card/[token]|
|T-1.10|Staff revocation of cards|FR-025|T-1.1|0.5d|done — revokeCardAction + reissueCardAction in admin-members.ts|
|T-1.11|Security and constraints tests (Authz replay, Member leak walker)|FR-004|T-1.5, T-1.6|1d|done — four constraint suites built in phase 0 (T-0.13): member-leak-walker, object-level-authz, staff-role-matrix, audit-completeness|
