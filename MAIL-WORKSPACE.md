# Communications — Liquid Studio mail workspace

This replaces the earlier single-message preview at `/communications`. It remains local-only.

## Available now

- Inbox, Starred, Drafts, Sent and Archive folders, with derived counts.
- Search by sender, subject, message text and order reference; unread and review filters.
- A threaded reader with expandable messages, recipient headers, attachment-reference details and linked order context.
- Reply, forward and new-message composers with To, Cc, Bcc, subject, order link, message, signature and attachment names.
- Review before handing a message to the user's email app; draft persistence, safe closing and confirmed discard.
- Read/star/archive operations and bulk read/archive, with recoverable Archive storage.
- Desktop split panes and mobile list-to-thread navigation.
- Existing Full/Reduced motion and Glass/Solid display settings.

## What remains deliberately disconnected

No Gmail account is connected. Sample incoming/outgoing messages are explicitly illustrative, not retrieved or sent records. The Sent folder never treats a saved draft, approval or email-app handoff as a sent message.

The composer can open a `mailto:` draft in the user's configured email app. The user must review and send it there. Amiro's own Send control is disabled until the backend connection exists. Sample addresses use example.invalid and must be replaced for real mail.

Attachments are filename/size metadata only. No file contents are uploaded, stored or embedded in the email-app handoff. Attach the original files manually in that app. Sample PDF references link to the existing document library without inventing PDF content.

## Storage and workflow boundaries

General mail drafts and thread flags use `amiro-mail-preview-v1`, separate from the commerce ledger. This is browser-local, unencrypted preview data—not a synced mailbox or business backup. Unavailable storage keeps edits in memory with a visible warning. Invalid saved data is retained, not silently overwritten. Per-draft revisions reject stale saves/discards.

Invoice email drafts are projected directly from each invoice and link to the existing invoice editor. Order-pack drafts are projected directly from their approval packs and link to `/orders/{id}/review`. Those drafts cannot be edited or sent through the general composer. Canonical payment, snapshot, approval and evidence gates are unchanged.

Earlier session drafts (mail-*, po-*, asm-*) remain available through their original save API. The single-editor workspace lock also gates new mail mutations.

## Validation

- `tests/mail.test.mjs`: 16 tests for parsing, identity, recipients, safe email handoff, metadata limits, persistence failure and stale writes.
- `scripts/mail-browser-check.mjs`: isolated synthetic browser journeys for threads, folders, composer validation, draft persistence/discard, five viewport widths, read-only state and canonical draft links.
- The browser test never opens a mail app or sends an external message.
- Existing 71 regression checks remain part of the final suite. Build, type and changed-file lint checks run separately.
- Screenshots and latest reports: `output/mail-studio/`.

Final local results (7 September 2026): 87 regression checks pass, all eight mail browser journeys pass, TypeScript and targeted lint pass, and the local build succeeds. The mailbox and composer have zero automated axe violations in the tested views; 24 layered-background contrast nodes still require manual review. The native email app was not opened during testing. Historical failed-run diagnostics are separated under `output/mail-studio/history/`.

Direct Gmail sync, real attachment bytes, provider-confirmed sent state, authentication and multi-device storage belong to the backend phase.
