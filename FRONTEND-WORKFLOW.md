# AH Interiors: local orders, customers and invoicing workspace

Implemented screens:

- `/`: Today, with approval work, payment holds, 24-hour internal reminders, exceptions, upcoming movements and the assistant.
- `/orders/:id`: product and catalogue checks, independent fulfilment groups, payment evidence, messages, sample documents, internal notes and activity.
- `/reviews` and `/orders/:id/review`: complete order packs, editable recipient/subject/body, per-draft review, final checks, mixed-delivery acceptance and local approval.
- `/orders/new`: customer selection/creation, sales channel, original reference, multi-supplier line items, proposed routes, charges and notes. Saving creates an unpaid order and linked invoice draft together.
- `/invoices` (also `/accounts`): searchable, sortable, exportable invoice ledger with All due, Overdue, Draft, Partially paid, Paid and Void filters. Overdue is independent of partial-payment status.
- `/invoices/new` and `/invoices/:id`: invoice editor, issuing, immutable issued details, partial/full payment history, unpaid-invoice voiding, customer email drafts and Print / Save PDF.
- `/customers?customer=C-0001`: canonical customer account with all linked orders, invoices, payment totals and outstanding balance.

The September 2026 Liquid Studio redesign uses one navigation model: a 232px expanded sidebar, a 76px compact sidebar, and a labelled mobile drawer below 900px. The top bar contains context and global controls, not duplicate module navigation. A pearl canvas, frosted navigation and substantially opaque work surfaces separate the application shell from operational content. Orders use cobalt accents, Purchasing violet, Fulfilment teal and Finance ink; status and selection have independent meanings. DM Sans body text and Plus Jakarta Sans headings are retained. Today prioritises attention, review and upcoming movements. Orders, customers, invoices, approvals, assistant and all supporting workspaces share the consolidated system in app/reskin.css; superseded visual rules were removed from app/globals.css.

Settings > Appearance controls Full/Reduced motion, Glass/Solid materials, and Responsive/Expanded/Compact navigation. Full motion and Glass are the explicit defaults; there is no automatic System motion mode. Appearance is saved independently under amiro-ui-preferences-v1. Unavailable storage leaves these choices session-only without changing the commerce ledger. Motion consumers use live preference-aware spatial targets; changing preferences does not remount business providers or replay the initial shell entrance. Reduced mode removes spatial movement, Solid removes transparency, and printing is static. The assistant drawer hands off to the full conversation workspace and keeps separate unsent composers for linked records in memory. No backend connection or external action is introduced.

## Try the workflow

1. Process John Smith's paid order (`10004821`). Review its Rauch article, colour code and separately coded accessories. Review all three drafts and the final checks, then Go ahead.
2. Process Emma White's order (`10004824`) to explore two suppliers, separate transport instructions and mixed-order delivery approval.
3. Open David Brown (`10004823`), select Payment, then open the linked invoice. Record a partial or full verified payment in the local ledger. Processing remains blocked until the full order amount is recorded.
4. Open Nadia Khan (`10004786`) to record sample appointment, delivery and assembly evidence. These are independent milestones; completion clears the follow-up only when all required work is complete.
5. Edit a reviewed message or a catalogue/route selection. The affected approval checks reset. Approved packs must be revised before editing.
6. Create a new customer order. Its invoice starts as a draft. Review and issue it, then record a partial payment. Check that the invoice, order balance and customer account agree. Record the remainder to unlock order preparation.
7. Create a standalone invoice for the same customer. Its payments affect that customer account, never an unrelated order.
8. On an issued invoice, choose Email customer. Save the local draft or open the message in your email app. Use Print / Save PDF first and manually attach that PDF in the email app. No message is sent automatically.

## Boundaries

Orders, customer accounts, invoices, invoice email drafts and order workflow actions persist in browser-local storage under `ah-interiors-local-workspace-v3`. They survive refresh on the same browser and origin. Different ports/browsers have separate records. They are not server-backed, encrypted account storage or a business backup. Assistant chat and earlier standalone draft preferences remain session-only.

An exclusive browser Web Lock allows one editing tab at a time. Other tabs are read-only and receive saved changes; close the editing tab and refresh another tab to change ownership. Browsers without Web Locks support are read-only. Storage failure is shown explicitly. Unreadable saved data is backed up locally before replacing it with sample records; if backup fails, the original is not overwritten and the preview remains session-only. Restoring validates financial relationships and repairs stale sequence counters.

No live AI, automatic email sending, purchases, bookings, bank checks or connector imports are implemented. Manual payment recording never collects money. Issued invoices cannot be edited, and paid/partially paid invoices cannot be voided; refunds, credit notes, verified company/VAT details and production tax treatment are backend/accounting work still to do. Printed invoices clearly say LOCAL PREVIEW. The seeded workday is 5 September 2026; new actions and reminders use current local runtime time. Reminders are UI state, not an operating-system or background notification service.

Seeded customer details, catalogue codes, prices, contacts and evidence are synthetic. User-entered records stay on this browser. Supplier tags identify a supplier, not a verified article. New products require explicit catalogue and supplier-cost checks before approval. Catalogue maps and postcode coverage must be validated from current sources before a live implementation. Transport drafts are held planning instructions; they are not ready-to-execute portal jobs.

Commerce screens share `lib/commerce.ts`, `lib/operations.ts`, the local store and `WorkspaceProvider`. Financial amounts are calculated in integer pennies. Customer identity is canonical; issued invoices retain a customer snapshot. Duplicate invoice generation for an order opens its active invoice. Older purchasing and document-library screens remain earlier standalone previews. The backend phase must provide authoritative connected records, secure credentials, durable storage, idempotent external execution and real evidence verification.

## Validation

Communications now uses a Gmail-style Liquid Studio mail workspace with folders, expandable threads, recipient headers and detailed local composers. General mail drafts and thread flags persist separately under `amiro-mail-preview-v1`; invoice and approval drafts remain in their canonical records. No Gmail account is connected and nothing is automatically sent. See [MAIL-WORKSPACE.md](MAIL-WORKSPACE.md) for boundaries and the added mail tests.

- The original 51 domain/workflow checks are retained. Five preference-aware motion checks, nine UI preference/identity checks and six UI preference-store checks bring the suite to 71 passing checks.
- Run: `node --test tests/preview.test.mjs tests/operations.test.mjs tests/commerce.test.mjs tests/motion.test.mjs tests/liquid-ui.test.mjs tests/ui-preference-store.test.mjs`.
- TypeScript, targeted changed-component lint and a local production build are checked separately. The build retains framework-generated timing/static-analysis warnings; it is not deployed.
- The screenshot matrix covers 17 routes at 390, 768, 1024, 1440 and 1920px. Contained table scrolling is intentional. Complete synthetic browser journeys exercise invoice issuing, partial/full payment, linked customers, separate routes, draft review invalidation, local approval and static PDF output.
- Live preference changes, persistence, unavailable appearance storage, read-only tabs, keyboard focus restoration, touch navigation and long content have dedicated browser checks. Invoice, fulfilment and approval records also receive 390/768px reflow checks.
- Axe sweeps cover 15 routes in both Glass and Solid. Zero automated violations is not a WCAG certification: layered-background contrast still has manual-review flags. Native browser 200% zoom and the native print dialog remain manual checks; 720-CSS-pixel equivalent reflow and Chromium PDF generation were tested.
- QA uses fresh isolated headless Chrome contexts at 127.0.0.1:3001, separate from the user's localhost:3001 origin. It does not import, mutate or publish the user's browser records. Browser-plugin startup was blocked by Windows ACLs, so this fallback is documented rather than presented as an in-app-browser run.
- Current evidence and the annotated walkthrough are in [output/liquid-studio/DESIGN-REVIEW.md](output/liquid-studio/DESIGN-REVIEW.md). Historical failed-run diagnostics are not current results.

Use `npm run dev -- --port 3001` for the local preview. Keep it bound to localhost; do not publish or connect real accounts without a separate request.
