# AH Interiors CRM audit

Audit date: 2 October 2026. Scope: application source, dependencies, local persistence, existing workflows and automated tests in the supplied Amiro.io workspace.

## Existing stack and persistence

React 19, TypeScript, Next-compatible App Router through Vinext/Vite, Tailwind 4, Base UI/shadcn components, Lucide icons and Motion. Cloudflare/Wrangler build tooling exists. No database driver, database schema, migration directory, authentication service or API routes were found in the application source. This directory is not a Git checkout.

`components/local-commerce-store.ts` persists the canonical commerce state in browser localStorage under `ah-interiors-local-workspace-v3`. Web Locks enforce one editing tab; other tabs are read-only. Recovery attempts to back up invalid saved data before replacing it. This is browser-local persistence, not shared business storage. Existing browser records have not been read or modified during this audit.

## Existing models and workflows

| Area | Existing implementation | Reuse / gap |
| --- | --- | --- |
| Customers | `lib/commerce.ts`: Customer; canonical IDs, identity validation, customer account and linked orders/invoices | Reuse identity and account relationships; no shared customer database |
| Products | `lib/operations.ts`: Line; product name, supplier, SKU, article, quantity, price, cost and verification | Order lines only; no independent product master or price history |
| Orders | OrderCase, Group, Job, Evidence, Draft, Pack; OperationsState and operationsReducer | Existing review gates, supplier routing, payment gates and fulfilment evidence should be preserved |
| Invoices/payments | InvoiceLine, Payment, Invoice, CommerceState; integer-pence calculations, draft/issue/void, immutable issued details, partial/full payments, customer snapshot, history | Reuse ledger rules; refunds and production tax treatment absent |
| Suppliers/purchases | Supplier names and order fulfilment groups; purchasing screen uses static sample rows | No canonical Supplier, PurchaseOrder or receipt ledger |
| Delivery/assembly | Group milestones and collection/delivery jobs; assembly screen uses static jobs | No independently persisted delivery/assembly entities |
| Tasks/approvals | Order-linked Task, reminders, reviewed packs and approval blockers | No central task/approval entities or staff identity |
| Dashboard | Today attention/review/movement dashboard and shared studio components | Full management metrics and operational reports absent |
| Mail | MailDraft, ThreadFlags, MailState; separately persisted local drafts and flags | No connected mailbox; messages are not automatically sent |
| Settings | Appearance store and session preferences; integration placeholders | No persisted business settings or role administration |
| Attachments | Sample documents and local composer attachment metadata | No authenticated shared upload/storage service |
| Flooring/stock/service/expenses | No canonical domain models found | New modules needed |

## Authentication, permissions and integrations

There is no authenticated staff principal or server-side authorization boundary in the supplied application. A browser editing lock is concurrency protection, not role-based access. Integration cards and synthetic assistant replies do not constitute connected Shopify, eBay, mailbox, banking or supplier integrations. Credentials should never be added to browser code.

## Reusable UI and services

Reuse WorkspaceProvider, applyCommerce, operationsReducer, customer picker/profile, invoice editor/detail/list, order detail/review, PageIntro, Panel, Stat, StatusPill, RecordTable, dialogs, navigation, appearance preferences and the consolidated `app/reskin.css` design system. Preserve the existing canonical customer/order/invoice relationships rather than introducing parallel ledgers.

## Risks and implementation boundary

- Treating localStorage as a multi-user database would leave stock, approvals, payments and audit events without an authoritative shared transaction boundary.
- Static purchasing and assembly rows must be reconciled with canonical records before operational reporting can count them.
- Existing supplier cost values and selling values need explicit VAT and units semantics before a central margin service replaces any calculations.
- Migrating browser records requires explicit import validation, backup, stable IDs and reconciliation of invoice/order balances. Existing version-3 restore validation must continue to work.
- Secure least-privilege staff roles, assignment restrictions, durable attachments and background notifications require a backend.
- Database migration testing and rollback cannot be performed without the actual schema and database environment. No schema migration or replacement database was invented.
- Logical phase commits cannot be created in this directory because Git metadata is absent. Do not initialize unrelated history without resolving the intended repository.

## Validation

`node --test tests/*.test.mjs`: 87 tests passed, zero failures. Coverage includes commerce relationships and restoration, invoice/payment rules, supplier review and fulfilment gates, reminders, mail drafts, appearance state and UI invariants. These are baseline checks, not evidence that the requested new modules exist.

## Required next input

Provide the existing CRM backend/Git checkout if it lives elsewhere. If this browser-local preview is the entire existing CRM, confirm that backend persistence and staff authentication should be introduced here; their implementation cannot preserve an existing database/authentication system that is absent. No ERPNext, Frappe or separate application is required.
