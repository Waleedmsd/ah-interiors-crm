'use client';
import { ArrowUpRight, Clock3, ShieldCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { PageIntro, Panel, Stat, StatusPill } from '@/components/page-ui';
import { RecordTable, type RecordRow } from '@/components/record-table';
import { DraftDialog } from '@/components/draft-dialog';
const rows: RecordRow[] = [
  {
    id: '2841',
    cells: ['PO-2026-002841', 'John Smith', 'Rauch', '£1,040', '—'],
    status: 'Draft',
    tone: 'blue',
    orderId: '10004821',
    note: 'Draft purchase order only. Customer order approval and supplier code verification are required before sending.',
  },
  {
    id: '2836',
    cells: ['PO-2026-002836', 'Lucy Turner', 'Rauch', '£1,390', 'Under review'],
    status: 'Price mismatch',
    tone: 'red',
    orderId: '10004812',
    note: 'Expected supplier cost £1,040; confirmed £1,390. The £350 difference requires review before purchasing continues.',
  },
  {
    id: '2829',
    cells: [
      'PO-2026-002829',
      'Daniel Wilson',
      'Hypnos',
      '£1,860',
      'Unconfirmed',
    ],
    status: 'Awaiting reply',
    tone: 'gold',
    orderId: '10004798',
    note: 'Confirmation is four days overdue. Request the confirmed cost and estimated delivery week.',
  },
  {
    id: '2825',
    cells: ['PO-2026-002825', 'Oliver James', 'Wiemann', '£2,215', 'Week 41'],
    status: 'Confirmed',
    tone: 'green',
    note: 'Sample confirmation checked against the purchase order. Delivery scheduling remains a separate step.',
  },
  {
    id: '2819',
    cells: ['PO-2026-002819', 'Nadia Khan', 'Rauch', '£2,460', 'Week 42'],
    status: 'Confirmed',
    tone: 'green',
    orderId: '10004786',
    note: 'Supplier week confirmed in sample data. The customer’s requested assembly date is not available.',
  },
];
export default function PurchasingPage() {
  return (
    <div className="page">
      <PageIntro
        title="Purchasing"
        description="Stay close to your suppliers, from purchase order to confirmation."
        action={
          <Link className="btn" href="/settings">
            <ShieldCheck size={16} />
            Approval rules
          </Link>
        }
      />
      <div className="metric-grid">
        <Stat
          label="Purchase orders"
          value="05"
          note="In this sample workspace"
        />
        <Stat label="Confirmed" value="02" note="Supplier response reviewed" />
        <Stat
          label="Awaiting reply"
          value="01"
          note="Hypnos · 4 days overdue"
          action
        />
        <Stat
          label="Needs your decision"
          value="01"
          note="Rauch · £350 price difference"
          action
        />
      </div>
      <div className="stack">
        <RecordTable
          title="Supplier purchase orders"
          description="Customer orders and supplier commitments, side by side"
          columns={[
            'Purchase order',
            'Customer',
            'Supplier',
            'Cost',
            'Delivery',
          ]}
          rows={rows}
          detailAction={(row) => (
            <DraftDialog
              key={row.id}
              id={'po-' + row.id}
              recipient={row.cells[2]}
              subject={'Confirmation requested — ' + row.cells[0]}
              body={
                'Hello,\n\nPlease could you confirm the agreed cost and estimated delivery week for ' +
                row.cells[0] +
                ', for ' +
                row.cells[1] +
                '?\n\n' +
                (row.status === 'Price mismatch'
                  ? 'Our expected cost is £1,040, but your confirmation shows £1,390. Please clarify the £350 difference before we proceed.\n\n'
                  : '') +
                'Kind regards,\nAH Interiors'
              }
              label="Prepare supplier follow-up"
            />
          )}
        />
        <div className="two-column">
          <Panel
            title="Supplier overview"
            description="Response status across the current sample"
          >
            <div className="supplier-grid">
              {[
                {
                  name: 'Rauch',
                  initials: 'R',
                  detail: '3 purchase orders',
                  status: '1 exception',
                  tone: 'red' as const,
                },
                {
                  name: 'Hypnos',
                  initials: 'H',
                  detail: '1 purchase order',
                  status: 'Reply overdue',
                  tone: 'gold' as const,
                },
                {
                  name: 'Wiemann',
                  initials: 'W',
                  detail: '1 purchase order',
                  status: 'Confirmed',
                  tone: 'green' as const,
                },
              ].map((supplier) => (
                <div className="supplier-tile" key={supplier.name}>
                  <span className="avatar">{supplier.initials}</span>
                  <strong>{supplier.name}</strong>
                  <p>{supplier.detail}</p>
                  <StatusPill tone={supplier.tone}>
                    {supplier.status}
                  </StatusPill>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Follow-up priorities">
            <Link href="/communications" className="attention-row">
              <span className="attention-icon">
                <TriangleAlert />
              </span>
              <div>
                <strong>Resolve the Rauch price</strong>
                <p>Review the confirmation before approving any change.</p>
              </div>
              <ArrowUpRight />
            </Link>
            <Link href="/communications" className="attention-row">
              <span className="attention-icon">
                <Clock3 />
              </span>
              <div>
                <strong>Chase Hypnos confirmation</strong>
                <p>Daniel Wilson · PO-2026-002829</p>
              </div>
              <ArrowUpRight />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
