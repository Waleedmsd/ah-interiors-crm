'use client';
import { useRef, useState } from 'react';
import { FileText, FolderTree, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageIntro, Panel, Stat } from '@/components/page-ui';
import { RecordTable, type RecordRow } from '@/components/record-table';
import { useWorkspace } from '@/components/workspace-provider';
const initialRows: RecordRow[] = [
  {
    id: 'rauch',
    cells: [
      'Rauch-Confirmation-8273662.pdf',
      '#10004812',
      'Supplier confirmation',
      'Gmail',
      'Today, 10:32',
    ],
    status: 'Filed',
    tone: 'green',
    orderId: '10004812',
    note: 'Sample path: /Orders/2026/09/03/10004812-Turner/03-Suppliers. File contents are not included in this preview.',
  },
  {
    id: 'po',
    cells: [
      'PO-2026-002841.pdf',
      '#10004821',
      'Purchase order',
      'Amiro',
      'Today, 10:16',
    ],
    status: 'Draft',
    tone: 'blue',
    orderId: '10004821',
    note: 'Draft metadata only. No PDF has been created or sent to a supplier.',
  },
  {
    id: 'invoice',
    cells: [
      'Invoice-10004821.pdf',
      '#10004821',
      'Customer invoice',
      'Magento',
      'Today, 09:43',
    ],
    status: 'Filed',
    tone: 'green',
    orderId: '10004821',
    note: 'Sample path: /Orders/2026/09/05/10004821-Smith/02-Customer-Invoices. Original documents will be available after the backend is connected.',
  },
  {
    id: 'flatpack',
    cells: [
      'Flatpack-ASM-909.pdf',
      '#10004761',
      'Assembly booking',
      'Gmail',
      'Yesterday',
    ],
    status: 'Filed',
    tone: 'green',
    orderId: '10004761',
    note: 'Sample path: /Orders/2026/08/24/10004761-Hall/04-Assembly. No remote file is fetched in this preview.',
  },
  {
    id: 'hypnos',
    cells: [
      'Hypnos-Confirmation.pdf',
      '#10004798',
      'Supplier confirmation',
      'Expected',
      'Overdue',
    ],
    status: 'Missing',
    tone: 'red',
    orderId: '10004798',
    note: 'The required supplier confirmation has not been received. A follow-up is needed before the workflow can continue.',
  },
];
export default function DocumentsPage() {
  const [rows, setRows] = useState(initialRows);
  const filePicker = useRef<HTMLInputElement>(null);
  const { notify } = useWorkspace();
  return (
    <div className="page">
      <PageIntro
        title="Documents"
        description="An organised paper trail for every order, supplier, and customer."
        action={
          <>
            <input
              type="file"
              multiple
              className="sr-only"
              ref={filePicker}
              tabIndex={-1}
              aria-label="Choose local documents"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                setRows((current) => [
                  ...files.map((file, index) => ({
                    id: 'local-' + Date.now() + '-' + index,
                    cells: [
                      file.name,
                      'Unassigned',
                      'Local document',
                      'This browser',
                      'Just added',
                    ],
                    status: 'Local preview',
                    tone: 'blue' as const,
                    note:
                      'Selected locally · ' +
                      (file.size / 1024).toFixed(1) +
                      ' KB. Only the file name and size are retained on this page. Contents are not uploaded, read, or stored.',
                  })),
                  ...current,
                ]);
                if (files.length)
                  notify(
                    files.length +
                      ' file names added locally. Nothing was uploaded.',
                  );
                event.target.value = '';
              }}
            />
            <Button
              className="btn btn-primary"
              onClick={() => filePicker.current?.click()}
            >
              <Upload />
              Add local files
            </Button>
          </>
        }
      />
      <div className="metric-grid">
        <Stat
          label="Documents"
          value={String(rows.length).padStart(2, '0')}
          note="In the sample library"
        />
        <Stat label="Filed" value="03" note="Matched to a customer order" />
        <Stat label="Drafts" value="01" note="Purchase order awaiting review" />
        <Stat
          label="Missing"
          value="01"
          note="Hypnos confirmation overdue"
          action
        />
      </div>
      <div className="stack">
        <RecordTable
          title="Document library"
          description="Search by filename, order number, or document type"
          columns={['File name', 'Order', 'Document type', 'Source', 'Added']}
          rows={rows}
        />
        <div className="two-column">
          <Panel
            title="Order folder structure"
            description="A predictable home for every file"
          >
            <div className="folder-structure">
              <div>
                <FolderTree size={20} />
                <strong>/Orders / 2026 / 09 / 05 / 10004821-Smith</strong>
              </div>
              {[
                '01-Order',
                '02-Customer-Invoices',
                '03-Suppliers',
                '04-Assembly',
              ].map((folder) => (
                <p key={folder}>
                  <FileText size={15} />
                  {folder}
                </p>
              ))}
            </div>
          </Panel>
          <Panel title="Document checks">
            <div className="section-body !pt-0">
              <p className="text-sm leading-7 text-muted-foreground">
                Order numbers and document types determine the folder. Unmatched
                files remain unassigned until reviewed.
              </p>
              <p className="soft-notice mt-4">
                <strong>Waiting for Hypnos</strong>The missing confirmation is
                linked to order #10004798. An acknowledgement email does not
                replace it.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
