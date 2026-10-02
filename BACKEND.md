# Full-stack AH Interiors CRM

The existing React/Vinext application now runs in a Node monolith with native `/api/*` routes, PostgreSQL and Drizzle migrations. The browser preview remains available only when explicitly configured for development. No ERP platform was added.

## Local development

Requires Node 22.13+ and PostgreSQL 17 (or Docker).

1. `npm ci --cache .npm-cache`
2. Copy `.env.example` to `.env`, choose unique database and seed passwords, and set `APP_ORIGIN` to the exact browser origin, for example `http://localhost:3001`. `localhost` and `127.0.0.1` are different origins.
3. Start PostgreSQL. With Docker, set `POSTGRES_PASSWORD` in your shell and run `docker compose up -d`. The development port is bound to loopback only.
4. `npm run db:migrate`
5. `npm run db:seed`
6. `npm run dev -- --port 3001`
7. Open `http://localhost:3001`. Demo emails: `manager@ahinteriors.test`, `sales@ahinteriors.test`, `warehouse@ahinteriors.test`. All use your `SEED_PASSWORD`. There is no built-in password. Never use these accounts or demo seed data in production.

This Windows workspace has an ignored portable PostgreSQL runtime in `.runtime/postgres/pgsql`, a cluster in `.runtime/pgdata`, and generated credentials in ignored `.env`. Start it with `.runtime/postgres/pgsql/bin/pg_ctl.exe -D .runtime/pgdata -l .runtime/postgres.log -o "-p 54329 -h 127.0.0.1" -w start`; stop with the same binary and `-D .runtime/pgdata -m fast -w stop`. Do not commit or distribute `.runtime`, `.env`, backups or uploads. Generated local passwords are available in `.env`; do not paste them into logs or Git.

## Commands and verification

- `npm test`: all original browser-preview domain tests.
- `npx tsc --noEmit`: TypeScript.
- `npx tsx --env-file=.env --test tests/backend/*.test.ts`: PostgreSQL integration tests; create isolated databases named `ah_crm_test_<process-id>` and remove only those databases afterwards. The test database user requires CREATE DATABASE permission. Production application users should not have that permission.
- `node --env-file=.env scripts/backend-browser-check.mjs`: isolated browser login/refresh verification, using synthetic development credentials.
- `npm run db:generate`: review a new SQL migration from the typed schema.
- `npm run db:migrate`: apply reviewed migrations.
- `npm run jobs:run`: one background-job pass; run each minute through your platform scheduler. It uses PostgreSQL locking and notification deduplication, without Redis or a second database.
- `npm run build`, then `npm start -- --port 3001`: Node production build and server. Configure production variables in the hosting environment; local `.env` is not a deployment secret manager.

## Architecture and data preservation

`server/db/schema.ts` and versioned SQL migrations own schema. `server/services` owns transactions and business rules; `server/api.ts` owns HTTP validation, authentication and authorization. UI uses `lib/api-client.ts`. No UI component imports a database driver.

The legacy commerce workflow retains its validated version-3 document so draft reviews, fulfilment groups, notes, evidence and issued invoice snapshots survive the transition. Customer, order, invoice and payment relational projections are updated within the same transaction. They are reporting projections of one canonical ledger, not independent customer/order systems. Version checks reject conflicting edits. Server requests use idempotency keys. Failed transactions do not leave partial customer/payment/audit records. Database row locking currently serializes ledger writes; revisit per-order transaction scope if scale requires it.

Browser data is never silently imported or overwritten. To import an existing browser ledger, export `ah-interiors-local-workspace-v3` from that browser and retain an untouched backup. For a fresh database, seed with `SEED_COMMERCE=false`, authenticate as management, then POST the exported JSON to `/api/commerce/import` from the configured origin. Restore validation checks ledger relationships. Imports are rejected once a shared workspace exists. A later merge tool is needed to merge into an already populated database; do not delete live records to force an import.

## Security and operations

Passwords use salted scrypt. Opaque session tokens are stored only as SHA-256 hashes in PostgreSQL. Cookies are HttpOnly and SameSite=Lax, plus Secure in production. Every protected API call rechecks active staff status and permissions. Writes require the exact configured origin. Sessions expire after eight hours. Login throttles persist in PostgreSQL. Never expose the database port publicly.

Attachments are stored outside public assets, using UUID storage keys and database metadata. Authenticated record access is required to upload/download. Only PDFs and supported images up to 10 MB are accepted. Storage is abstracted behind `FileStorage`; configure an object storage implementation before running multiple application instances without shared persistent disk. Attachment content must be downloaded rather than executed inline. Add malware scanning for production uploads.

The password-reset token table prepares one-time, expiring reset flows. Automated reset delivery is not connected to SMTP yet. Use staff management and a deliberate administration process until reset delivery is implemented; never pretend that an email has been sent.

`/api/health` verifies database connectivity. Unexpected API failures return a generic response; logs exclude bodies, credentials and stack traces. Audit values are business data, access restricted to appropriate staff. Define retention and monitoring before production.

## Production preparation and backup

Deploy on a Node host with HTTPS, persistent PostgreSQL, and persistent attachment storage. Set `NODE_ENV=production`, `DATABASE_URL`, `APP_ORIGIN` (HTTPS origin), and `ATTACHMENT_ROOT`; do not expose server variables through `NEXT_PUBLIC_*`. Create actual staff users, remove/disable synthetic demo users through management controls, and do not run demo seeding in production. Back up before migrations and run the full suite against staging. The current Vinext version is a beta dependency and requires staging verification on the selected host before claiming production readiness.

Set `PG_DUMP_PATH` to your PostgreSQL `pg_dump` executable and run `npx tsx --env-file=.env scripts/db-backup.ts`. The command writes a custom-format database dump and copies attachments into ignored `backups/<timestamp>`. Passwords are passed through process environment, not command-line arguments. For a consistent database/files snapshot, pause uploads and writes during backup, or use coordinated storage snapshots. Encrypt backups and copy them to separately controlled storage; the project disk alone is not a disaster-recovery plan.

Restore into an EMPTY replacement database using the matching PostgreSQL tools: configure `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` in a secure shell, then `pg_restore --exit-on-error --no-owner --dbname <replacement-database> <backup>/database.dump`. Copy `<backup>/attachments` into the configured storage root. Point a staging app at the replacement, verify staff login, invoice balances, files and counts, then switch production deliberately. Test restores regularly. Keep secrets and backup files out of source control.

Migrations are additive for this stage. Roll back application code only to a version compatible with the migrated schema. For a failed schema rollout, restore the pre-migration backup into a replacement database; do not drop business tables to undo changes. Generated migration files and metadata belong in Git.

## Shared dashboard, reporting and refunds

The home dashboard reads shared business records through /api/dashboard. The /reports page uses /api/reports, and global search uses /api/search with role-filtered results. Reporting-only staff receive aggregate sales data; cost and profit summaries are restricted to Management, Team Lead and Accounts. Profit summaries identify how many orders have verified supplier costs.

Management and Accounts can record an already-sent refund from an issued invoice. This records an accounting event; it does not send money through a bank or payment processor. Refunds reduce net payments and reopen the invoice/order balance; they do not cancel the sale or issue a credit note. Payment and refund histories remain intact, and the invoice displays both before its recalculated balance.

Above the management setting refundApprovalPence, first create a Refund request in Management approvals, link it to the invoice ID, and enter its exact amount. A different manager must approve it. Enter its APR reference on the refund form. Each approval can be used once; retries with the same request ID remain safe. The server stores the approved record ID on the refund and audits the invoice change in the same transaction. The payment projection represents refunds as negative amounts.
