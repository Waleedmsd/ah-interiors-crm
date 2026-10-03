'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BarChart3,
  TrendingUp,
  Wallet,
  Package,
  CalendarDays,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
type TableRow = Record<string, string | number>;
type Reports = {
  generatedAt?: string;
  orderCount?: number;
  profit?: Record<string, number>;
  accounts?: Record<string, number>;
  flooring?: Record<string, number>;
  service?: Record<string, number>;
  delivery?: Record<string, number>;
  assembly?: Record<string, number>;
  salesByChannel?: TableRow[];
  salesByDay?: TableRow[];
  salesByProduct?: TableRow[];
  salesBySupplier?: TableRow[];
};
const pounds = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    (value ?? 0) / 100,
  );
const headings: Record<string, string> = {
  channel: 'Channel',
  orders: 'Orders',
  salesPence: 'Sales value',
  date: 'Date',
  product: 'Product',
  units: 'Units sold',
  revenuePence: 'Revenue',
  supplier: 'Supplier',
};
function ReportTable({
  title,
  subtitle,
  rows,
  columns,
}: {
  title: string;
  subtitle?: string;
  rows: TableRow[];
  columns: string[];
}) {
  return (
    <section className="ops-collection report-table">
      <div className="ops-collection-heading">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <span className="ops-total">{rows.length}</span>
      </div>
      <div className="table-wrap">
        <table className="ops-table">
          <thead>
            <tr>
              {columns.map((key) => (
                <th key={key}>{headings[key] ?? key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col}>
                    {typeof row[col] === 'number' && col.endsWith('Pence')
                      ? pounds(row[col])
                      : String(row[col] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="report-no-data">
          <BarChart3 size={25} />
          <strong>No data in this report yet</strong>
          <p>As your team records activity, the figures will appear here.</p>
        </div>
      )}
    </section>
  );
}
function ReportMetric({
  label,
  value,
  note,
  index = 0,
}: {
  label: string;
  value: string;
  note: string;
  index?: number;
}) {
  const Icon = [TrendingUp, Wallet, Package, CalendarDays][index % 4];
  return (
    <div
      className={'ops-stat ' + ['blue', 'green', 'violet', 'amber'][index % 4]}
    >
      <span className="ops-stat-heading">
        {label}
        <span className="ops-stat-icon">
          <Icon size={17} />
        </span>
      </span>
      <strong>{value}</strong>
      <span className="ops-stat-caption">{note}</span>
    </div>
  );
}
export function ReportsWorkspace() {
  const [data, setData] = useState<Reports | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState('Sales');
  useEffect(() => {
    apiRequest<Reports>('/api/reports')
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  const channels = data?.salesByChannel ?? [];
  const total = channels.reduce(
      (sum, row) => sum + Number(row.salesPence ?? 0),
      0,
    ),
    largest = Math.max(
      1,
      ...channels.map((row) => Number(row.salesPence ?? 0)),
    );
  return (
    <div className="page ops-page reports-page">
      <header className="ops-page-header">
        <div>
          <div className="ops-eyebrow">
            <BarChart3 size={15} />
            Business intelligence<span>/</span>AH Interiors
          </div>
          <h1>Reports</h1>
          <p>
            A clearer picture of sales, profitability and the work behind them.
          </p>
        </div>
        <Link href="/" className="btn">
          Back to dashboard
          <ArrowUpRight size={15} />
        </Link>
      </header>
      {error && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <div className="report-navigation">
        <div className="ops-tabs">
          {[
            'Sales',
            ...(data?.profit || data?.accounts ? ['Profit & accounts'] : []),
            ...(data?.delivery ||
            data?.flooring ||
            data?.service ||
            data?.assembly
              ? ['Operations']
              : []),
          ].map((name) => (
            <button
              key={name}
              aria-pressed={tab === name}
              onClick={() => setTab(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <span>All time · GBP</span>
      </div>
      {!data ? (
        <output className="ops-loading">
          Preparing your reports…
          <div className="ops-skeleton" />
        </output>
      ) : (
        <>
          {tab === 'Sales' && (
            <>
              <div className="ops-stats">
                <ReportMetric
                  label="Total order value"
                  value={pounds(total)}
                  note="Across all recorded orders"
                />
                <ReportMetric
                  label="Orders"
                  value={String(data.orderCount ?? 0)}
                  note="Shared sales records"
                  index={1}
                />
                <ReportMetric
                  label="Average order value"
                  value={pounds(data.orderCount ? total / data.orderCount : 0)}
                  note="Value per recorded order"
                  index={2}
                />
                <ReportMetric
                  label="Sales channels"
                  value={String(channels.length)}
                  note="Channels with recorded sales"
                  index={3}
                />
              </div>
              <div className="reports-two-column">
                <section className="ops-collection">
                  <div className="ops-collection-heading">
                    <div>
                      <h2>Channel performance</h2>
                      <p>How your recorded sales are distributed</p>
                    </div>
                  </div>
                  <div className="report-channel-chart">
                    {channels.map((row, i) => (
                      <div key={String(row.channel)}>
                        <span>
                          {row.channel}
                          <strong>{pounds(Number(row.salesPence))}</strong>
                        </span>
                        <div>
                          <i
                            style={{
                              width:
                                (Number(row.salesPence) / largest) * 100 + '%',
                              background: [
                                '#6385e4',
                                '#63aaa3',
                                '#a68bc9',
                                '#d3ac74',
                                '#899bb9',
                              ][i % 5],
                            }}
                          />
                        </div>
                        <small>
                          {row.orders} orders ·{' '}
                          {total
                            ? ((Number(row.salesPence) / total) * 100).toFixed(
                                1,
                              )
                            : 0}
                          % of recorded value
                        </small>
                      </div>
                    ))}
                    {!channels.length && <p>No recorded sales yet.</p>}
                  </div>
                </section>
                <ReportTable
                  title="Sales by channel"
                  subtitle="All recorded sales orders"
                  rows={channels}
                  columns={['channel', 'orders', 'salesPence']}
                />
              </div>
              {data.salesByProduct && (
                <ReportTable
                  title="Sales by product"
                  subtitle="Units and revenue across your product range"
                  rows={data.salesByProduct}
                  columns={['product', 'units', 'revenuePence']}
                />
              )}
              <div className="reports-two-column">
                {data.salesByDay && (
                  <ReportTable
                    title="Sales by day"
                    subtitle="Issued invoice values"
                    rows={data.salesByDay}
                    columns={['date', 'salesPence']}
                  />
                )}
                {data.salesBySupplier && (
                  <ReportTable
                    title="Sales by supplier"
                    rows={data.salesBySupplier}
                    columns={['supplier', 'orders', 'salesPence']}
                  />
                )}
              </div>
            </>
          )}
          {tab === 'Profit & accounts' && (
            <>
              {data.profit && (
                <>
                  <div className="report-section-heading">
                    <h2>
                      Profitability{' '}
                      {data.profit.provisional ? '· provisional' : ''}
                    </h2>
                    <span>
                      {data.profit.costCoverage} orders with verified supplier
                      costs · {data.profit.reviewedCostCoverage ?? 0} with
                      reviewed variable costs
                    </span>
                  </div>
                  <div className="ops-stats">
                    <ReportMetric
                      label="Gross profit"
                      value={
                        data.profit.costCoverage
                          ? pounds(data.profit.grossPence)
                          : '—'
                      }
                      note="Verified supplier costs"
                    />
                    <ReportMetric
                      label="Contribution"
                      value={
                        data.profit.costCoverage
                          ? pounds(data.profit.contributionPence)
                          : '—'
                      }
                      note="Includes recorded variable costs"
                      index={1}
                    />
                    <ReportMetric
                      label="Average margin"
                      value={
                        data.profit.costCoverage
                          ? (data.profit.averageMarginBps / 100).toFixed(1) +
                            '%'
                          : '—'
                      }
                      note="Orders with cost coverage"
                      index={2}
                    />
                    <ReportMetric
                      label="Below minimum"
                      value={String(data.profit.belowMinimum)}
                      note="Requires a margin review"
                      index={3}
                    />
                  </div>
                  {!data.profit.costCoverage && (
                    <div className="report-coverage">
                      <TrendingUp size={25} />
                      <div>
                        <h3>Complete your cost picture</h3>
                        <p>
                          Verify supplier costs on your orders to see meaningful
                          profit and margin figures here.
                        </p>
                      </div>
                      <Link className="btn" href="/orders">
                        View orders
                        <ArrowUpRight size={14} />
                      </Link>
                    </div>
                  )}
                </>
              )}
              {data.accounts && (
                <>
                  <div className="report-section-heading">
                    <h2>Accounts overview</h2>
                    <Link href="/invoices" className="ops-text-link">
                      View invoices
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  <div className="ops-stats">
                    {[
                      ['invoiced', 'Invoiced', 'Issued invoice value'],
                      ['paid', 'Net payments', 'Payments after refunds'],
                      [
                        'outstanding',
                        'Outstanding',
                        'Current invoice balances',
                      ],
                      ['overdue', 'Overdue', 'Past the invoice due date'],
                    ].map(([key, label, note], index) => (
                      <ReportMetric
                        key={key}
                        label={label}
                        value={pounds(data.accounts![key])}
                        note={note}
                        index={index}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === 'Operations' && (
            <div className="reports-operations">
              {(
                [
                  {
                    key: 'delivery',
                    label: 'Delivery performance',
                    href: '/deliveries',
                    fields: [
                      ['total', 'All jobs'],
                      ['completed', 'Delivered'],
                      ['failed', 'Failed'],
                      ['rescheduled', 'Rescheduled'],
                    ],
                  },
                  {
                    key: 'assembly',
                    label: 'Assembly performance',
                    href: '/assembly-jobs',
                    fields: [
                      ['total', 'All jobs'],
                      ['completed', 'Completed'],
                      ['issues', 'Issues reported'],
                    ],
                  },
                  {
                    key: 'flooring',
                    label: 'Flooring pipeline',
                    href: '/flooring',
                    fields: [
                      ['leads', 'All leads'],
                      ['quotes', 'Open quotes'],
                      ['won', 'Won'],
                      ['lost', 'Lost'],
                    ],
                  },
                  {
                    key: 'service',
                    label: 'Customer service',
                    href: '/service-cases',
                    fields: [
                      ['open', 'Open cases'],
                      ['overdue', 'Chase overdue'],
                    ],
                  },
                ] as const
              ).map(
                (group) =>
                  data[group.key] && (
                    <section className="ops-collection" key={group.key}>
                      <div className="ops-collection-heading">
                        <h2>{group.label}</h2>
                        <Link
                          className="ops-open"
                          href={group.href}
                          aria-label={'Open ' + group.label}
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </div>
                      <div className="report-operation-values">
                        {group.fields.map(([key, label]) => (
                          <div key={key}>
                            <span>{label}</span>
                            <strong>{data[group.key]![key] ?? 0}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  ),
              )}
            </div>
          )}
          <div className="report-footnote">
            <span className="ops-connected-dot" />
            Shared CRM records
            {data.generatedAt
              ? ' · Updated ' +
                new Date(data.generatedAt).toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </div>
        </>
      )}
    </div>
  );
}
