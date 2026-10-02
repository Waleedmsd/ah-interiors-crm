'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Truck,
  Hammer,
  LifeBuoy,
  ListChecks,
  TrendingUp,
  CalendarDays,
  Wallet,
  Package,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
type Summary = {
  sales?: {
    todayPence: number;
    weekPence: number;
    monthPence: number;
    orderCount: number;
    averageOrderPence: number;
    byChannel: { channel: string; orders: number; revenuePence: number }[];
  };
  accounts?: Record<string, number>;
  profit?: Record<string, number>;
  orders?: Record<string, number>;
  suppliers?: Record<string, number>;
  delivery?: Record<string, number>;
  assembly?: Record<string, number>;
  flooring?: Record<string, number>;
  service?: Record<string, number>;
  tasks?: Record<string, number>;
};
const pounds = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format((value ?? 0) / 100);
export function LiveBusinessSnapshot() {
  const [data, setData] = useState<Summary | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    apiRequest<Summary>('/api/dashboard')
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  if (error)
    return (
      <p role="alert" className="ops-error">
        {error}
      </p>
    );
  if (!data)
    return (
      <output className="ops-loading">
        Loading your business overview…
        <div className="ops-skeleton" />
      </output>
    );
  const sales = data.sales;
  const metrics = sales
    ? [
        {
          label: 'Sales today',
          value: pounds(sales.todayPence),
          note: 'Issued today',
          icon: TrendingUp,
          href: '/reports',
        },
        {
          label: 'This week',
          value: pounds(sales.weekPence),
          note: 'Week to date',
          icon: CalendarDays,
          href: '/reports',
        },
        {
          label: 'This month',
          value: pounds(sales.monthPence),
          note: 'Month to date',
          icon: Wallet,
          href: '/reports',
        },
        {
          label: 'Order value',
          value: pounds(sales.averageOrderPence),
          note: 'Average across ' + sales.orderCount + ' orders',
          icon: Package,
          href: '/orders',
        },
      ]
    : [];
  const today = [
    {
      name: 'Deliveries today',
      value: data.delivery?.today,
      detail: (data.delivery?.readyToBook ?? 0) + ' ready to book',
      icon: Truck,
      href: '/deliveries',
    },
    {
      name: 'Assembly today',
      value: data.assembly?.today,
      detail: (data.assembly?.awaiting ?? 0) + ' awaiting booking',
      icon: Hammer,
      href: '/assembly-jobs',
    },
    {
      name: 'Open customer cases',
      value: data.service?.open,
      detail: (data.service?.overdue ?? 0) + ' follow-ups overdue',
      icon: LifeBuoy,
      href: '/service-cases',
    },
    {
      name: 'Your tasks',
      value: data.tasks?.mine,
      detail: (data.tasks?.today ?? 0) + ' due today',
      icon: ListChecks,
      href: '/tasks',
    },
  ].filter((item) => item.value !== undefined);
  const channels = sales?.byChannel ?? [];
  const max = Math.max(1, ...channels.map((c) => c.revenuePence));
  const pipeline = [
    ['new', 'New orders'],
    ['needsSupplierOrder', 'To be ordered'],
    ['awaitingConfirmation', 'Awaiting confirmation'],
    ['confirmed', 'Confirmed'],
    ['readyForDelivery', 'Delivery ready'],
    ['completed', 'Completed'],
  ];
  return (
    <div className="business-snapshot">
      <div className="ops-stats">
        {metrics.map((metric, i) => (
          <Link
            className={'ops-stat ' + ['blue', 'violet', 'green', 'amber'][i]}
            key={metric.label}
            href={metric.href}
          >
            <span className="ops-stat-heading">
              {metric.label}
              <span className="ops-stat-icon">
                <metric.icon size={17} />
              </span>
            </span>
            <strong>{metric.value}</strong>
            <span className="ops-stat-caption">
              {metric.note}
              <ArrowUpRight size={13} />
            </span>
          </Link>
        ))}
      </div>
      <div className="snapshot-grid">
        <section className="ops-collection">
          <div className="ops-collection-heading">
            <div>
              <h2>Sales across your channels</h2>
              <p>Recorded order value · all time</p>
            </div>
            <Link className="ops-text-link" href="/reports">
              View reports
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="snapshot-channels">
            {channels.map((channel, i) => (
              <Link
                href="/orders"
                key={channel.channel}
                className="snapshot-channel"
              >
                <span>
                  <i
                    style={{
                      background: [
                        '#6185e9',
                        '#67afad',
                        '#a88cce',
                        '#ddb16e',
                        '#8b9fc0',
                      ][i % 5],
                    }}
                  />
                  {channel.channel}
                  <small>{channel.orders} orders</small>
                  <strong>{pounds(channel.revenuePence)}</strong>
                </span>
                <div>
                  <i
                    style={{
                      width:
                        Math.max(1, (channel.revenuePence / max) * 100) + '%',
                      background: [
                        '#6185e9',
                        '#67afad',
                        '#a88cce',
                        '#ddb16e',
                        '#8b9fc0',
                      ][i % 5],
                    }}
                  />
                </div>
              </Link>
            ))}
            {!channels.length && <p>No orders recorded yet.</p>}
          </div>
          <div className="snapshot-channel-footer">
            <span>
              Total orders <strong>{sales?.orderCount ?? 0}</strong>
            </span>
            <span>Across {channels.length} channels</span>
          </div>
        </section>
        <section className="ops-collection">
          <div className="ops-collection-heading">
            <div>
              <h2>Keep today moving</h2>
              <p>Your team’s operational pulse</p>
            </div>
            <span className="snapshot-live">
              <span className="ops-connected-dot" />
              Live
            </span>
          </div>
          <div className="snapshot-today">
            {today.map((item) => (
              <Link href={item.href} key={item.name}>
                <span className="snapshot-today-icon">
                  <item.icon size={19} />
                </span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </div>
                <b>{item.value}</b>
                <ArrowUpRight size={15} />
              </Link>
            ))}
          </div>
        </section>
      </div>
      {data.orders && (
        <section className="snapshot-pipeline">
          <div>
            <h2>Order pipeline</h2>
            <Link className="ops-text-link" href="/orders">
              All orders
              <ArrowUpRight size={13} />
            </Link>
          </div>
          <div>
            {pipeline.map(([key, label], i) => (
              <Link href="/orders" key={key}>
                <span>
                  <i
                    style={{
                      background: [
                        '#90a6ce',
                        '#d2ab6c',
                        '#ad99ce',
                        '#7999e0',
                        '#66aba6',
                        '#7db593',
                      ][i],
                    }}
                  />
                  {label}
                </span>
                <strong>{data.orders?.[key] ?? 0}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}
      {data.profit && (
        <div className="snapshot-profit">
          <span>
            <TrendingUp size={16} />
            Contribution profit{' '}
            <strong>
              {data.profit.costCoverage
                ? pounds(data.profit.contributionPence)
                : 'Awaiting verified costs'}
            </strong>
          </span>
          <span>
            {data.profit.costCoverage} of {data.profit.orderCount} orders have
            verified costs
          </span>
          <Link href="/reports" className="ops-text-link">
            Profit details
            <ArrowUpRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
