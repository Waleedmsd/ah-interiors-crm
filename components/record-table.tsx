'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowDownUp,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SearchX,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { StatusPill } from '@/components/page-ui';
import { downloadCsv } from '@/lib/preview-utils';
import { demoOrders } from '@/lib/demo-data';
const financialColumn = (column: string) =>
  /cost|total|amount|value|price/i.test(column);
const displayCell = (value: string) =>
  /^£[\d,]+(?:\.\d{1,2})?$/.test(value)
    ? new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
      }).format(Number(value.replace(/[£,]/g, '')))
    : value;

export type RecordRow = {
  id: string;
  cells: string[];
  status: string;
  tone?: 'green' | 'gold' | 'red' | 'blue' | 'grey';
  orderId?: string;
  note?: string;
};
export function RecordTable({
  title,
  description,
  columns,
  rows,
  detailAction,
}: {
  title: string;
  description?: string;
  columns: string[];
  rows: RecordRow[];
  detailAction?: (row: RecordRow) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [reverse, setReverse] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<RecordRow | null>(null);
  const filtered = rows.filter(
    (row) =>
      (status === 'All statuses' || row.status === status) &&
      (row.cells.join(' ') + ' ' + row.status)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (reverse) filtered.reverse();
  const pages = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="section-card">
      <div className="section-heading">
        <div>
          <h2>
            {title} <span className="count-tag">{rows.length}</span>
          </h2>
          {description && <p>{description}</p>}
        </div>
        <Button
          className="btn btn-small"
          variant="outline"
          onClick={() =>
            downloadCsv(
              title.toLowerCase().replaceAll(' ', '-') + '.csv',
              [...columns, 'Status'],
              filtered.map((row) => [...row.cells, row.status]),
            )
          }
        >
          <Download />
          Export
        </Button>
      </div>
      <div className="toolbar">
        <label className="search-field">
          <Search />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            aria-label={'Search ' + title.toLowerCase()}
            placeholder="Search records…"
          />
        </label>
        <div className="action-row">
          <select
            className="select-field"
            value={status}
            aria-label="Filter by status"
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            {['All statuses', ...new Set(rows.map((row) => row.status))].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
          <Button
            variant="outline"
            className="icon-btn"
            onClick={() => setReverse(!reverse)}
            aria-label={reverse ? 'Show newest first' : 'Show oldest first'}
            aria-pressed={reverse}
          >
            <ArrowDownUp />
          </Button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className={
                    financialColumn(column) ? 'number-cell' : undefined
                  }
                >
                  {column}
                </th>
              ))}
              <th>Status</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(currentPage * 6, currentPage * 6 + 6).map((row) => (
              <tr
                key={row.id}
                className={selected?.id === row.id ? 'selected-row' : undefined}
              >
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={
                      financialColumn(columns[index])
                        ? 'number-cell'
                        : undefined
                    }
                  >
                    {index === 0 ? (
                      <button
                        className="text-link"
                        onClick={() => setSelected(row)}
                      >
                        {cell}
                      </button>
                    ) : (
                      displayCell(cell)
                    )}
                  </td>
                ))}
                <td>
                  <StatusPill tone={row.tone}>{row.status}</StatusPill>
                </td>
                <td>
                  <button
                    className="row-action"
                    onClick={() => setSelected(row)}
                    aria-label={'View ' + row.cells[0]}
                  >
                    <ArrowUpRight />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <div className="empty-state">
          <SearchX />
          <strong>No matching records</strong>
          <p>Try a different search or clear the status filter.</p>
          <button
            className="text-link mt-3"
            onClick={() => {
              setQuery('');
              setStatus('All statuses');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="section-footer">
        <span>
          {filtered.length ? currentPage * 6 + 1 : 0}–
          {Math.min((currentPage + 1) * 6, filtered.length)} of{' '}
          {filtered.length} records
        </span>
        <div className="action-row">
          <Button
            variant="outline"
            className="icon-btn"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span>
            Page {currentPage + 1} of {pages}
          </span>
          <Button
            variant="outline"
            className="icon-btn"
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="!w-full !max-w-[510px] overflow-y-auto p-6">
          <SheetHeader className="!p-0 !pr-7">
            <SheetTitle className="detail-title">
              {selected?.cells[0]}
            </SheetTitle>
            <SheetDescription>Record details · local preview</SheetDescription>
          </SheetHeader>
          {selected && (
            <>
              <StatusPill tone={selected.tone}>{selected.status}</StatusPill>
              <div className="detail-grid detail-section">
                {columns.map((column, index) => (
                  <div key={column}>
                    <span className="detail-label">{column}</span>
                    <span className="detail-value">
                      {selected.cells[index]}
                    </span>
                  </div>
                ))}
              </div>
              {selected.note && (
                <p className="soft-notice mt-3">{selected.note}</p>
              )}
              {selected.orderId &&
                demoOrders.some((order) => order.id === selected.orderId) && (
                  <Link
                    className="btn mt-3"
                    href={'/orders/' + selected.orderId}
                    onClick={() => setSelected(null)}
                  >
                    View related order
                    <ArrowUpRight />
                  </Link>
                )}
              {detailAction?.(selected)}
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
