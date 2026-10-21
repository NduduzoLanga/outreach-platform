# Outreach Platform

Role-based lead, payout, and support workspaces built with Express, MongoDB, React, and Vite.

## Workspaces

- `server/` — Express API, Mongoose models, tenant-scoped access, audit and payout ledger.
- `client/` — React application, route-level code splitting, TanStack Query, React Hook Form, Zod, DnD Kit, and Recharts.

## Run locally

1. Configure `server/.env` from `server/.env.example`. Use a MongoDB Atlas deployment or a local MongoDB replica set: financial, profile, and audit operations use multi-document transactions. The default local URI expects replica set `rs0`; start local `mongod` with `--replSet rs0` and initialize it once with `mongosh --eval "rs.initiate()"`.
2. Set a unique `JWT_SECRET` of at least 32 characters and `CLIENT_ORIGIN` to the frontend origin.
3. From `server/`, run `npm install` and `npm run dev`.
4. Configure `client/.env` from `client/.env.example`. From `client/`, run `npm install` and `npm run dev`.
5. Create an initial admin by registering an account and promoting it with `npm run promote-admin -- <email>` from `server/`, or use the explicitly configured demo seeder below for a development workspace.

The API creates a default agency during startup and assigns existing records that have no tenant ID to it. Back up the database before deploying this migration.

Run `npm run init-db` from `server/` after configuring `MONGODB_URI` (or `MONGO_URI`) to create collections and the indexes declared by the Mongoose schemas. If Node.js is using a broken local DNS stub for Atlas SRV records, configure `MONGODB_DNS_SERVERS` with a comma-separated list of reachable DNS resolver IPs; this changes the resolver for that Node process. The application can also use `MONGODB_DIRECT_URI` as a fallback when SRV lookup fails with `querySrv ECONNREFUSED`; use only the exact seed list and replica-set name supplied by Atlas. The initializer does not drop or replace existing indexes; index conflicts, including duplicate values that violate a unique index, are reported as errors. Use the same Atlas or replica-set deployment required by transactional API operations.

### Explicit demo seeding

The optional seeder creates or verifies one admin, specialist, and consultant plus three fictional sample leads. It does not reset existing balances, overwrite passwords, or create sample payout requests. Configure `SEED_DEMO_DATA=true` and set distinct `SEED_ADMIN_*`, `SEED_SPECIALIST_*`, and `SEED_CONSULTANT_*` credentials in `server/.env`; use unique passwords of at least 12 characters. Then run `npm run seed` from `server/`. The sample lead emails use the reserved `.example` domain. Set `SEED_DEMO_DATA=false` again when seeding is complete.

The admin sidebar includes an audit trail with action filters, search, before/after state inspection, and cursor-based loading of older entries.

## Access model

- **Consultant:** captures leads, can edit/delete unassigned leads, requests payouts, and views own statements/support tickets.
- **Specialist:** claims unassigned leads and manages assigned pipeline stages, stage reports, scheduled meetings, and negotiation activity. Specialists see only their assigned leads and the unassigned queue, with separate filters for assigned, available, and combined work.
- **Admin:** manages roles and assignments, processes payout transitions, handles support tickets, and views tenant-wide metrics and audit activity.

### Lead execution and commissions

Consultant intake records the center address/region, registration, adult decision-maker contact preferences, aggregate student/staff counts, administration method, pain point, owner persona, qualification tier, expected contract value, and a written handoff. Verbal POPIA consent and the no-identifiable-child-data certification are mandatory at submission. Do not store names, contact details, health information, photographs, or other identifying information about children. Older leads are not assumed to have consent: specialists do not receive those records in their queue until the consultant verifies the compliance fields, and claim/contact/scheduling endpoints enforce the same gate. Compliance confirmations retain their actor and timestamp.

The specialist pipeline has five ordered stages: `1_new_unclaimed`, `2_specialist_contacted`, `3_demo_meeting_scheduled`, `4_proposal_negotiation`, and `5_closed_won_pending_payout`. Claiming a compliant lead records the specialist, timestamp, consultant attribution, and stage history. Specialists progress one stage at a time; a scheduled appointment is required to enter stage 3. Every progression requires a report of at least 15 characters. Consultant lead queries remain scoped to their own submissions, and the Leads page refreshes in the background to keep handoff and stage changes visible.

Specialists can record call, email, note, and meeting touchpoints, optional future follow-ups, and appointments with types and statuses. Appointments can be completed, cancelled, or rescheduled; synced Google events are updated or cancelled as well, while local-only appointments remain local. Appointment creation, timeline activity, and stage advancement are persisted with audit records. With Google OAuth configured, the server can create a generic Calendar event with a Meet conference; it does not invite attendees or send lead contact details to Google. Without a refresh token, the meeting is recorded locally and no fake Meet URL is generated. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and optionally `GOOGLE_CALENDAR_ID` in `server/.env` to enable live sync.

The persistence layer remains MongoDB/Mongoose as used by this application; the supplied PostgreSQL/Supabase DDL is represented by tenant-scoped Mongoose schemas, queries, and middleware rather than introducing a second database stack. Lead interaction and appointment records are embedded in their tenant-scoped lead document so reads and writes share the lead's tenant boundary.

When an authorized team member moves a lead to **Closed Won**, the platform calculates a one-time commission at the lead's default 10% rate against its estimated value, rounds to cents, and credits the originating consultant's balance. Specialists cannot alter that value; the consultant can set it before handoff, and an admin can correct it before the deal is closed. The lead update, balance credit, append-only ledger entry, and audit record run in one MongoDB transaction. Commissioned deals cannot have their stage or estimated value changed through the current API. The rate and value are stored as financial inputs; configure and formally approve your business commission policy before using this default in production. Existing Closed Won leads are not back-credited automatically.

Admin specialist assignments require a reason and retain transfer history. Support messages record the actual sender identity and role; old messages remain readable under their legacy sender labels.

Consultant statements are month-filtered and include lead captures, commissions credited, and payout activity for the selected month. The displayed balance is the current balance, not an end-of-month balance.

Tenant isolation is applied in the Mongoose persistence layer using request-bound tenant context, query/update scoping, and tenant-aware indexes. MongoDB does not provide PostgreSQL-style row-level security; this is not database-native RLS. Keep all tenant model access behind the authenticated tenant middleware, use least-privilege database credentials, and review any new aggregation, raw collection, or bulk-write code for tenant isolation.

Payout requests reserve the consultant balance immediately. Approval, payment, or rejection appends a ledger record; rejection refunds the reserved amount. These transitions run in MongoDB transactions and depend on Atlas or replica-set transaction support.

Audit and ledger records reject mutation through the Mongoose model middleware. This application-level guard is not immutable against direct database access: production database roles and operational controls must prevent the API identity from modifying or deleting those collections, and backups/retention should be configured separately.

The built-in authentication rate limiter uses in-memory state. Configure a shared rate-limit store before running multiple API replicas, and use a secrets manager, TLS, restricted network access, and least-privilege MongoDB credentials in production.

The supplied implementation is a production-oriented foundation, not a claim of certified enterprise readiness. Before production, add deployment-specific monitoring, backups, transaction/restore drills, integration tests against a replica set, security testing, and operational review of data retention and privacy requirements.
