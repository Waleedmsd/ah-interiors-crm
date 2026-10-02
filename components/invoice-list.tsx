'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  ReceiptText,
} from 'lucide-react';
import { PageIntro, Stat, StatusPill } from '@/components/page-ui';
import { Button } from '@/components/ui/button';
import { useWorkspace } from '@/components/workspace-provider';
import {
  accountTotals,
  invoiceTotals,
  invoiceStatus,
  invoiceOverdue,
  type Invoice,
} from '@/lib/commerce';
import { money } from '@/lib/demo-data';
import { downloadCsv } from '@/lib/preview-utils';
export const pounds = (value: number) => money(value / 100, 2);
export function InvoiceStatus({
  invoice,
  now,
}: {
  invoice: Invoice;
  now: number;
}) {
  const status = invoiceStatus(invoice);
  return (
    <div className="invoice-status">
      <StatusPill
        tone={
          status === 'Paid'
            ? 'green'
            : status === 'Partially paid'
              ? 'gold'
              : status === 'Due'
                ? 'gold'
                : 'grey'
        }
      >
        {status}
      </StatusPill>
      {invoiceOverdue(invoice, now) && (
        <span className="overdue-label">Overdue</span>
      )}
    </div>
  );
}
export function InvoiceList() {
  const { invoices, customers, ready, now: today } = useWorkspace();
  const [filter, setFilter] = useState('All invoices');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('Newest first');
  const [page, setPage] = useState(0);
  const totals = accountTotals(invoices, today);
  const filtered = invoices
    .filter((invoice) => {
      const status = invoiceStatus(invoice);
      const customer = customers.find((item) => item.id === invoice.customerId);
      const value = invoiceTotals(invoice);
      return (
        (filter === 'All invoices' ||
          filter === status ||
          (filter === 'All due' &&
            invoice.lifecycle === 'Issued' &&
            value.balance > 0) ||
          (filter === 'Overdue' && invoiceOverdue(invoice, today))) &&
        [invoice.id, customer?.name, customer?.email, invoice.orderId]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === 'Due date'
        ? a.dueDate.localeCompare(b.dueDate)
        : sort === 'Highest balance'
          ? invoiceTotals(b).balance - invoiceTotals(a).balance
          : b.createdAt - a.createdAt || b.id.localeCompare(a.id),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages - 1);
  return (
    <div className="page commerce-page">
      <PageIntro
        eyebrow="FINANCE WORKSPACE"
        title="Invoices"
        description="Every invoice. Every payment. One customer record."
        action={
          <>
            <Button
              variant="outline"
              className="btn"
              onClick={() =>
                downloadCsv(
                  'ah-invoices.csv',
                  [
                    'Invoice',
                    'Customer',
                    'Order',
                    'Status',
                    'Overdue',
                    'Due date',
                    'Total GBP',
                    'Paid GBP',
                    'Balance GBP',
                  ],
                  filtered.map((invoice) => {
                    const value = invoiceTotals(invoice);
                    return [
                      invoice.id,
                      customers.find((item) => item.id === invoice.customerId)
                        ?.name || '',
                      invoice.orderId || '',
                      invoiceStatus(invoice),
                      invoiceOverdue(invoice, today) ? 'Yes' : 'No',
                      invoice.dueDate,
                      value.total / 100,
                      value.paid / 100,
                      value.balance / 100,
                    ];
                  }),
                )
              }
            >
              <Download size={16} /> Export
            </Button>
            <Link href="/invoices/new" className="btn btn-primary">
              <Plus size={17} /> Create invoice
            </Link>
          </>
        }
      />
      <div className="metric-grid finance-metrics">
        <Stat
          label="Outstanding"
          value={pounds(totals.outstanding)}
          note="Balance on issued invoices"
          action
        />
        <Stat
          label="Overdue"
          value={pounds(totals.overdue)}
          note="Past the due date · includes partial payments"
          action
        />
        <Stat
          label="Payments recorded"
          value={pounds(totals.paid)}
          note="Local ledger · no money moved"
        />
        <Stat
          label="Draft invoices"
          value={String(
            invoices.filter((invoice) => invoice.lifecycle === 'Draft').length,
          ).padStart(2, '0')}
          note="Ready to review before issuing"
        />
      </div>
      <section className="section-card">
        <fieldset className="tabs-line" aria-label="Invoice filters">
          {[
            'All invoices',
            'All due',
            'Overdue',
            'Draft',
            'Partially paid',
            'Paid',
            'Void',
          ].map((value) => (
            <button
              key={value}
              className="tab-link"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(0);
              }}
            >
              {value}
            </button>
          ))}
        </fieldset>
        <div className="toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              aria-label="Search invoices"
              placeholder="Search invoice, customer or order…"
            />
          </label>
          <select
            className="select-field"
            aria-label="Sort invoices"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {['Newest first', 'Due date', 'Highest balance'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Due date</th>
                <th className="number-cell">Total</th>
                <th className="number-cell">Balance</th>
                <th>
                  <span className="sr-only">Open invoice</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(currentPage * 10, currentPage * 10 + 10)
                .map((invoice) => {
                  const value = invoiceTotals(invoice);
                  const customer = customers.find(
                    (item) => item.id === invoice.customerId,
                  )!;
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <Link
                          className="order-link"
                          href={'/invoices/' + invoice.id}
                        >
                          {invoice.id}
                        </Link>
                        <span className="cell-sub">
                          {invoice.orderId
                            ? 'Order #' + invoice.orderId
                            : 'Standalone invoice'}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={'/customers?customer=' + customer.id}
                          className="customer-name-link"
                        >
                          {customer.name}
                        </Link>
                        <span className="cell-sub">{customer.email}</span>
                      </td>
                      <td>
                        <InvoiceStatus invoice={invoice} now={today} />
                      </td>
                      <td>{invoice.dueDate}</td>
                      <td className="number-cell">{pounds(value.total)}</td>
                      <td className="number-cell">
                        <strong
                          className={
                            invoiceOverdue(invoice, today) ? 'danger-text' : ''
                          }
                        >
                          {invoice.lifecycle === 'Draft' ||
                          invoice.lifecycle === 'Void'
                            ? '—'
                            : pounds(value.balance)}
                        </strong>
                      </td>
                      <td>
                        <Link
                          className="row-action"
                          href={'/invoices/' + invoice.id}
                          aria-label={'View ' + invoice.id}
                        >
                          <ArrowUpRight size={18} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <ReceiptText />
            <strong>
              {ready ? 'No invoices here yet' : 'Loading local invoices…'}
            </strong>
            <p>Create an invoice or choose another filter.</p>
          </div>
        )}
        <div className="section-footer">
          <span>
            {filtered.length ? currentPage * 10 + 1 : 0}–
            {Math.min(currentPage * 10 + 10, filtered.length)} of{' '}
            {filtered.length} invoices
          </span>
          <div className="action-row">
            <Button
              variant="outline"
              className="icon-btn"
              aria-label="Previous invoice page"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <Button
              variant="outline"
              className="icon-btn"
              aria-label="Next invoice page"
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
      <p className="workspace-footnote">
        Browser-local workspace · issued invoices are locked · email sending and
        tax configuration are not connected.
      </p>
    </div>
  );
}
