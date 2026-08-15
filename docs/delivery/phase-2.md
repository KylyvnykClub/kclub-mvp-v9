# Phase 2 — Catalogue and onboarding

## 2. Tasks

|Task|Delivers|FR|Depends on|Est|Status|
|-|-|-|-|-|-|
|T-2.1|Implement reqs|FR-030, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, FR-046, FR-047, FR-048|—|—|partial 2026-08-14 — Phase A fixes: RBAC on registerCompanyAction, prohibited category check (FR-041), city-country validation (FR-041), audit on moderateCompanyAction (FR-047), moderation queue age (FR-048), category filter on directory (FR-031), fixed reject reason list (FR-043 partial), showcase rank schema+query+split top/featured (FR-034), staff hide/unhide/edit actions (FR-046), owner edit with pendingChanges versioning (FR-045), buildActor companyIds wired. **2026-08-15** — FR-040 closed: four-step form (business details, location and category, the discount offered, review and confirm) with a server-side draft in `company_drafts` ([ADR 0011](../decisions/0011-company-drafts-in-their-own-table.md)), one schema per step shared by client and server, 90-day retention sweep at `/api/cron/retention`. FR-043 was already closed by the moderation outbox: `moderateCompanyAction` enqueues and the drain sends the approved/rejected email — the earlier note was stale. Code-complete; the FRs still need tests naming them (AC-01)|
