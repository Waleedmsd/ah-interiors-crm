# AH Interiors — hardening and release record

Review date: 4 October 2026. Work is on `codex/production-hardening-2026-10-04`, draft PR #1. It is not a production deployment. The existing application and database model are retained; no Frappe, ERPNext, second CRM or live Shopify connection is introduced.

## Changes in this hardening pass

- `lib/workspace-access.ts`, `components/auth-boundary.tsx`, `components/staff-work.tsx` and `middleware.ts`: one explicit client navigation policy, deny-by-default workspace mounting, consistent restricted-page behaviour and usable navigation for all nine staff roles. Middleware checks authentication without maintaining a conflicting role-route list. APIs continue to authorize independently.
- `components/studio-navigation.tsx` and `components/operations-shell.tsx`: sidebar actions and searchable page links follow staff access. Explicit development preview remains separate from production authentication.
- `lib/api-client.ts`: preserve supplied headers, distinguish failed JSON/HTML/network responses, handle successful empty responses, preserve cancellation and never automatically retry a mutation.
- `components/server-commerce-store.ts`, `lib/empty-commerce.ts`: no synthetic customer/order fallback when shared data is unavailable; serialize saves with a synchronous lock; use the latest server version; refresh after an uncertain write rather than reporting unconfirmed success.
- `lib/financial-access.ts`, `server/services/commerce-presentation.ts`, `server/services/commerce.ts`: redact structured supplier line costs from sales responses, including successful writes and idempotent retries, without altering the canonical database. A hidden amount is `null`, not zero. Redacted response data cannot be restored as the canonical ledger. This is not a text-scrubbing guarantee for staff-authored notes or uploaded documents; those still require appropriate record access and staff information-handling practices.
- `components/order-panels.tsx`, `components/order-review.tsx`, `components/customer-picker.tsx` and `components/invoice-detail.tsx`: respect financial/editing authority, tolerate restricted amounts, do not announce a failed specification save as successful and remove misleading browser-only wording in several shared workflows.
- Purchasing, inventory, Documents and Communications: keyboard-scrollable tables, clearer loading/error/empty states, constrained repeated submissions and improved record details.
- `app/accessibility.css`: address measured text-contrast failures rather than disabling accessibility rules. Staff surfaces remain responsive. Workspace metadata is non-indexable, which is supplementary and not an authentication control.
- The temporary branch-write review executor and its workflow/plan were removed after use. The retained quality workflow has read-only repository permissions.

## Verification and what it proves

The authoritative result is the latest completed **CRM quality gate** for the reviewed application commit, not a green check from an older commit. A cancelled or missing check is not a pass.

| Check | Evidence | Coverage / limitation |
| --- | --- | --- |
| Original domain regressions | `npm test` | Commerce, invoice arithmetic and restoration, review gates, browser-preview stores and UI invariants. |
| TypeScript | `npx --no-install tsc --noEmit` | Type checking. CI explicitly uses Bash with pipe-failure propagation so `tee` cannot hide a failure. |
| Backend tests | `npm run test:backend` | Separate disposable PostgreSQL test databases, real service/API transactions, permissions, costs, refunds, stock, deliveries, assembly, flooring and after-sales. External fetches are blocked unless a test supplies an explicit fixture. |
| Migrations | `npm run db:migrate` against the disposable CI database | Fresh-schema creation. This does not replace a migration rehearsal on a copy of business data. |
| Production build | `npm run build` | The repository's actual Node/Vinext production build. It is not proof of a specific hosting environment. |
| Management browser baseline | `scripts/quality/browser-baseline.mjs` | 22 routes at 1440 px and 390 px: 44 route/viewport scenarios, real login, uncaught errors, server failures, horizontal overflow and serious/critical automated accessibility findings. |
| Staff browser matrix | `scripts/quality/staff-browser-check.mjs` | 82 role/route/viewport scenarios across nine roles, forbidden-route handling and session termination. Route opening is not a substitute for completing each module's business lifecycle. |
| Real commerce browser journey | `scripts/quality/commerce-browser-check.mjs` | Customer creation, catalogue-linked order and draft invoice, invoice issue, verified partial payment, refresh persistence, separate Accounts visibility, Sales cost/payment restrictions and a populated mobile invoice. Uses real APIs and the disposable CI database, not mocked save responses. |

Tests are expected to fail when a regression is found. Keep the gates strict; repair the code instead of skipping checks, hiding overflow or relaxing assertions merely to obtain a green run.

The quality run saves its exact tested commit, source archive, test logs, JSON reports and browser screenshots as a private repository artifact retained for seven days. The PR's merge-test SHA can differ from the branch head SHA: record both when comparing evidence. Do not distribute environment files, session cookies, database dumps or runtime credentials with a source delivery.

## Module traceability

| Area | Primary existing implementation | Important safeguards to preserve |
| --- | --- | --- |
| Customers, sales orders, invoices and payments | `lib/commerce.ts`; `server/services/commerce.ts` | One canonical ledger with transactional relational projections; verified payments; version and duplicate-request checks. |
| Products, suppliers and margins | `server/services/catalogue.ts`; `server/services/order-costs.ts` | Supplier/product relationships, price history and role-restricted financial data. |
| Purchase orders and supplier chasing | `server/services/purchasing.ts` | Purchase item history, valid supplier confirmations, dates and receiving stages. |
| Inventory | `server/services/inventory.ts` | Atomic movements, reservations, receiving, returns and repeat-safe requests; quantities use the correct stock unit. |
| Furniture delivery and assembly | `server/services/furniture.ts`; `server/services/operational.ts` | Separate shipment groups, payment/stock gates, assigned staff, delivery evidence and completion checks. |
| Flooring | `server/services/flooring.ts` | Room measurements and accepted quote; material demand, shortage buying, reservations, fitting assignment and sign-off. |
| After-sales | `server/services/after-sales.ts` | Linked cases, replacements, returns, delivery proof, refund evidence and customer-confirmed outcomes. |
| Tasks, expenses and approvals | `lib/business-modules.ts`; `server/services/operational.ts` | Lifecycle authority, record relationships, approval decisions and overdue work. |
| Reports, documents and communications | `server/services/reporting.ts`; `records.ts`; `communications.ts` | Role-scoped reporting and records, durable file metadata and shared drafts without pretending messages were sent. |
| Staff access, settings and audit | `server/auth.ts`; `permissions.ts`; `api.ts` | Active-user checks on requests, opaque sessions, restricted management operations and business audit history. |

## Explicit boundaries before live release

1. **Hosting and secrets:** select and verify the real Node host, HTTPS domain, exact `APP_ORIGIN`, persistent PostgreSQL, persistent attachment storage and restricted application database credentials. No production credentials are supplied or changed by this PR.
2. **Clean business setup:** provision real staff with their approved roles and actual business settings. Do not use development demo accounts or run `db:seed` as a production bootstrap. Rehearse clean initialization/import without overwriting existing records. Production provisioning is still a deliberate administration step, not a one-click deployment provided by this PR.
3. **Recovery and rollout:** test an encrypted database-and-attachment backup and restore on the selected host; reconcile invoice/payment balances and file bytes; rehearse migrations on a copy of business data and agree rollback. A local dump command alone is not a verified recovery plan.
4. **Business acceptance:** run actual representative furniture, flooring, partial shipment, failed delivery, assembly and after-sales scenarios in staging. Confirm supplier lead times, delivery charges, permission assignments, tax treatment and margin rules with the business. No externally promised delivery or supplier booking is inferred from an internal status.
5. **File and account operations:** decide malware scanning, retention, monitoring and password-reset administration before exposing the service to staff or customers. Automated password-reset email and mailbox delivery are not connected.

Payments and refunds are manual records of verified money movement; they do not charge a card or return money through a provider. Refund records do not automatically cancel a sale or create statutory credit notes. Use the agreed accounting process for those adjustments. This operational CRM is not represented as a complete statutory accounting/tax system.

Shopify remains explicitly deferred. Existing integration code/tests are not evidence of a live connection; quality tests use synthetic fixtures and no real shop credentials. Email sending, supplier portals, couriers and payment providers are not silently connected by this hardening work.

## Review decision

A passing gate supports a tested staging/review candidate. It does not certify that every business requirement, browser, dataset, security threat or host configuration has been tested. Keep the PR unmerged and production unchanged until the remaining operational release decisions and business acceptance are explicitly approved.
