'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SearchX,
} from 'lucide-react';
import { PageIntro, StatusPill, Stat } from '@/components/page-ui';
import { Button } from '@/components/ui/button';
import { ProcessButton } from '@/components/process-button';
import { useWorkspace } from '@/components/workspace-provider';
import { filterOrders, money, workflowTone } from '@/lib/demo-data';
import { downloadCsv } from '@/lib/preview-utils';
export default function OrdersPage() {
  const { orders, cases } = useWorkspace();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All orders');
  const [sort, setSort] = useState('Newest first');
  const [page, setPage] = useState(0);
  const filtered = filterOrders(orders, query, status).sort((a, b) =>
    sort === 'Highest value'
      ? b.total - a.total
      : sort === 'Lowest value'
        ? a.total - b.total
        : b.id.localeCompare(a.id),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const newOrders = orders.filter((order) => order.status === 'New').length;
  return (
    <div className="page">
      <PageIntro
        eyebrow="WORKSPACE / ORDERS"
        title="Orders"
        description="Every customer, every supplier, one clear record."
        action={
          <>
            <Link href="/orders/new" className="btn btn-primary">
              + Create order
            </Link>
            <Button
              variant="outline"
              className="btn"
              onClick={() =>
                downloadCsv(
                  'amiro-orders.csv',
                  [
                    'Order',
                    'Customer',
                    'Supplier',
                    'Total GBP',
                    'Paid GBP',
                    'Workflow',
                  ],
                  filtered.map((order) => [
                    order.id,
                    order.customer,
                    order.supplier,
                    order.total,
                    order.paid,
                    order.status,
                  ]),
                )
              }
            >
              <Download />
              Export orders
            </Button>
          </>
        }
      />
      <div className="metric-grid">
        <Stat
          module="orders"
          label="Order value"
          value={money(
            orders.reduce((sum, order) => sum + order.total, 0),
            2,
          )}
          note={'Across ' + orders.length + ' local orders'}
        />
        <Stat
          label="Awaiting approval"
          value={String(
            cases.filter((order) => order.pack?.state === 'Draft').length,
          ).padStart(2, '0')}
          note="Prepared packs ready for your review"
          action
        />
        <Stat
          module="fulfilment"
          label="In progress"
          value={String(
            orders.filter(
              (order) =>
                !['New', 'In review', 'Approved', 'Complete'].includes(
                  order.status,
                ),
            ).length,
          ).padStart(2, '0')}
          note="Purchasing, delivery and assembly"
        />
        <Stat
          label="Outstanding balance"
          value={money(
            orders.reduce((sum, order) => sum + order.total - order.paid, 0),
            2,
          )}
          note="Customer payment to collect"
          action
        />
      </div>
      <section className="section-card liquid-order-collection">
        <div className="liquid-table-heading">
          <div>
            <h2>Order workspace</h2>
            <p>Payment and fulfilment are tracked independently.</p>
          </div>
          <span className="liquid-module-marker" data-module="orders">
            {orders.length} records
          </span>
        </div>
        <fieldset className="tabs-line" aria-label="Order status filters">
          {[
            'All orders',
            'New',
            'In review',
            'Approved',
            'Attention',
            'Complete',
          ].map((value) => (
            <button
              key={value}
              className="tab-link"
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(0);
              }}
            >
              {value}
              {value === 'New' && (
                <span className="count-tag ml-2">{newOrders}</span>
              )}
            </button>
          ))}
        </fieldset>
        <div className="toolbar">
          <label className="search-field">
            <Search />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search order, customer, supplier…"
              aria-label="Search orders"
            />
          </label>
          <select
            className="select-field"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="Sort orders"
          >
            {['Newest first', 'Highest value', 'Lowest value'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order / placed</th>
                <th>Customer</th>
                <th>Supplier</th>
                <th>Total</th>
                <th>Payment</th>
                <th>Workflow</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered
                .slice(currentPage * 6, currentPage * 6 + 6)
                .map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="order-link" href={'/orders/' + order.id}>
                        #{order.id}
                      </Link>
                      <span className="cell-sub">{order.date}</span>
                    </td>
                    <td aria-label={order.customer + ', ' + order.city}>
                      <div className="customer-cell">
                        <span className={'avatar avatar-' + order.color}>
                          {order.initials}
                        </span>
                        <div>
                          <strong>{order.customer}</strong>
                          <span className="cell-sub">{order.product}</span>
                          <span className="cell-sub">{order.city}</span>
                        </div>
                      </div>
                    </td>
                    <td>{order.supplier}</td>
                    <td className="money-cell">
                      <strong>{money(order.total, 2)}</strong>
                    </td>
                    <td>
                      <StatusPill
                        tone={order.paid === order.total ? 'green' : 'gold'}
                      >
                        {order.paid === order.total
                          ? 'Paid'
                          : order.paid > 0
                            ? 'Part paid'
                            : 'Unpaid'}
                      </StatusPill>
                    </td>
                    <td>
                      <StatusPill
                        tone={
                          order.status === 'New'
                            ? 'grey'
                            : order.status === 'In review'
                              ? 'gold'
                              : workflowTone(order.status)
                        }
                      >
                        {order.status === 'Approved'
                          ? 'Approved locally'
                          : order.status}
                      </StatusPill>
                    </td>
                    <td>
                      <ProcessButton id={order.id} compact />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="empty-state">
            <SearchX />
            <strong>No orders found</strong>
            <p>Try another customer name, order number, or status.</p>
            <button
              className="text-link mt-3"
              onClick={() => {
                setQuery('');
                setStatus('All orders');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
        <div className="section-footer">
          <span>
            {filtered.length ? currentPage * 6 + 1 : 0}–
            {Math.min(currentPage * 6 + 6, filtered.length)} of{' '}
            {filtered.length} orders
          </span>
          <div className="action-row">
            <Button
              variant="outline"
              className="icon-btn"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 0}
              aria-label="Previous orders"
            >
              <ChevronLeft />
            </Button>
            <span>
              Page {currentPage + 1} of {pageCount}
            </span>
            <Button
              variant="outline"
              className="icon-btn"
              disabled={currentPage + 1 >= pageCount}
              onClick={() => setPage(currentPage + 1)}
              aria-label="Next orders"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
