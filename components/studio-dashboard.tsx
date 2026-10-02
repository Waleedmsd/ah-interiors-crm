'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  FileCheck2,
  Plus,
  Search,
  Sparkles,
  Truck,
  TriangleAlert,
} from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { LiveBusinessSnapshot } from '@/components/live-business-snapshot';
import { StudioReveal } from '@/components/studio-motion';
import { ProcessButton } from '@/components/process-button';
import { PageIntro, Panel, Stat, StatusPill } from '@/components/page-ui';
import {
  dueLabel,
  isPaid,
  packHref,
  movementRows,
  currentStatus,
} from '@/lib/operations';

const filters = [
  'All work',
  'Approvals',
  'Follow-ups',
  'Exceptions',
  'Delivery & assembly',
];
export function StudioDashboard() {
  const { cases, now, dispatch, notify, ask, setAssistantOpen } =
    useWorkspace();
  const [filter, setFilter] = useState('All work');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const tasks = cases.flatMap((order) =>
    order.tasks.map((task) => ({ ...task, order })),
  );
  const due = tasks.filter((task) => task.dueAt <= now);
  const reviews = cases.filter((order) => order.pack?.state === 'Draft');
  const matches = (text: string) =>
    text.toLowerCase().includes(query.trim().toLowerCase());
  const queue = [
    ...cases
      .filter((order) => order.status === 'New' && !order.pack)
      .map((order) => ({
        id: order.id,
        title: isPaid(order) ? 'Prepare supplier order' : 'Payment to verify',
        category: isPaid(order) ? 'Approvals' : 'Exceptions',
        detail: order.product,
        order,
        task: undefined as (typeof tasks)[number] | undefined,
      })),
    ...due.map((task) => ({
      ...task,
      id: task.order.id + '-' + task.id,
      task,
    })),
  ].sort(
    (a, b) =>
      Number(b.category === 'Exceptions') -
        Number(a.category === 'Exceptions') ||
      (a.task?.dueAt ?? now) - (b.task?.dueAt ?? now),
  );
  const visible = queue.filter(
    (row) =>
      (filter === 'All work' || row.category === filter) &&
      matches(
        [
          row.title,
          row.order.id,
          row.order.customer,
          row.order.supplier,
          row.order.channel,
        ].join(' '),
      ),
  );
  const shown = expanded ? visible : visible.slice(0, 6);
  const reviewRows = reviews.filter(
    (order) =>
      (filter === 'All work' || filter === 'Approvals') &&
      matches(order.customer + ' ' + order.id + ' ' + order.product),
  );
  const movements = movementRows(cases).filter((row) =>
    matches(row.order.customer + ' ' + row.order.id + ' ' + row.label),
  );
  const exceptions = queue.filter(
    (row) => row.category === 'Exceptions',
  ).length;
  return (
    <div className="page liquid-today">
      <PageIntro
        eyebrow="AH INTERIORS / YOUR WORKSPACE"
        title="A clear view of today."
        description="The decisions, reviews and movements that need you."
        action={
          <Link href="/orders/new" className="btn btn-primary">
            <Plus size={16} />
            Create order
          </Link>
        }
      />
      <LiveBusinessSnapshot />
      <div className="liquid-dashboard-columns">
        <div className="stack">
          <Panel
            title="Needs your attention"
            description="Prioritised work, with a clear next step."
            action={
              <StatusPill tone={exceptions ? 'red' : 'grey'}>
                {exceptions} exceptions
              </StatusPill>
            }
          >
            <div className="toolbar">
              <label className="search-field">
                <Search size={17} />
                <input
                  aria-label="Search today's work"
                  placeholder="Search customer or order…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select
                className="toolbar-select"
                aria-label="Filter today's work"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                {filters.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="liquid-work-list">
              {shown.map((row) => (
                <article
                  className="liquid-work-item"
                  data-status={
                    row.category === 'Exceptions' ? 'exception' : 'review'
                  }
                  key={row.id}
                >
                  <span className="liquid-work-item-icon">
                    {row.category === 'Exceptions' ? (
                      <TriangleAlert size={18} />
                    ) : row.task ? (
                      <Clock3 size={18} />
                    ) : (
                      <FileCheck2 size={18} />
                    )}
                  </span>
                  <div className="liquid-work-item-title">
                    <Link href={'/orders/' + row.order.id}>
                      {row.order.customer}
                      <ArrowUpRight size={14} />
                    </Link>
                    <p>{row.title}</p>
                    <small>
                      #{row.order.id} ·{' '}
                      {row.task
                        ? dueLabel(row.task.dueAt, now)
                        : row.order.channel}
                    </small>
                    {row.task && (
                      <button
                        className="liquid-inline-action"
                        onClick={async () => {
                          const result = await dispatch({
                            type: 'snooze',
                            id: row.order.id,
                            taskId: row.task!.id,
                            now,
                          });
                          if (!result.error)
                            notify(
                              'Reminder moved forward 24 hours. Nothing sent.',
                            );
                        }}
                      >
                        Remind me tomorrow
                      </button>
                    )}
                  </div>
                  {row.task ? (
                    <button
                      className="btn btn-small"
                      onClick={async () => {
                        ask(
                          'Draft a supplier follow-up for order #' +
                            row.order.id,
                        );
                        setAssistantOpen(true);
                      }}
                    >
                      Prepare follow-up
                      <ArrowRight size={14} />
                    </button>
                  ) : (
                    <ProcessButton id={row.order.id} compact />
                  )}
                </article>
              ))}
              {!shown.length && (
                <div className="ops-empty">
                  <Check size={25} />
                  <h3>
                    {query ? 'No matching work' : 'All clear in this view'}
                  </h3>
                  <p>
                    {query
                      ? 'Try another customer or order reference.'
                      : 'Items appear here when they need a decision.'}
                  </p>
                </div>
              )}
            </div>
            <div className="section-footer">
              <span>{visible.length} items in this view</span>
              {visible.length > 6 && (
                <button
                  className="text-link"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'Show less' : 'Show all work'}
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          </Panel>
          <Panel
            title="Ready for review"
            description="Check the details before approving anything."
            action={
              <Link href="/reviews" className="text-link">
                All reviews
                <ArrowUpRight size={14} />
              </Link>
            }
          >
            <div className="liquid-work-list">
              {reviewRows.map((order) => (
                <Link
                  className="liquid-work-item liquid-review-link"
                  href={packHref(order.id)}
                  key={order.id}
                >
                  <span className="liquid-work-item-icon">
                    <FileCheck2 size={18} />
                  </span>
                  <div className="liquid-work-item-title">
                    <strong>{order.customer}</strong>
                    <p>{order.product}</p>
                    <small>
                      #{order.id} · {order.groups.length} supplier{' '}
                      {order.groups.length === 1 ? 'group' : 'groups'}
                    </small>
                  </div>
                  <StatusPill tone="gold">Review pending</StatusPill>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
              {!reviewRows.length && (
                <div className="ops-empty">
                  <FileCheck2 size={24} />
                  <h3>No packs waiting in this view</h3>
                  <p>Prepared order packs appear here for your review.</p>
                </div>
              )}
            </div>
          </Panel>
        </div>
        <aside className="stack">
          <Panel
            title="Upcoming movements"
            description="Each fulfilment group, tracked separately."
            action={<Truck size={19} />}
          >
            <div className="liquid-movements">
              {movements.slice(0, 5).map((row) => (
                <Link
                  className="liquid-movement"
                  key={row.order.id + row.group.id}
                  href={'/orders/' + row.order.id + '?tab=fulfilment'}
                >
                  <span className="liquid-movement-icon">
                    <CalendarDays size={18} />
                  </span>
                  <div>
                    <strong>{row.order.customer}</strong>
                    <p>{row.label}</p>
                    <small>{row.detail}</small>
                  </div>
                  <ArrowUpRight size={15} />
                </Link>
              ))}
              {!movements.length && (
                <div className="ops-empty">
                  <Truck size={24} />
                  <h3>No matching movements</h3>
                  <p>Recorded delivery and assembly activity appears here.</p>
                </div>
              )}
            </div>
            <div className="section-footer">
              <span>{movements.length} matching groups</span>
              <Link href="/assembly" className="text-link">
                Fulfilment
                <ArrowRight size={14} />
              </Link>
            </div>
          </Panel>
          <section className="liquid-assistant-invite">
            <span className="liquid-module-marker" data-module="assistant">
              <Sparkles size={21} />
            </span>
            <h2>
              A little clarity.
              <br />A useful next step.
            </h2>
            <p>
              Ask Amiro to summarise a record or prepare a follow-up. You stay
              in control.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => setAssistantOpen(true)}
            >
              Talk to Amiro
              <ArrowUpRight size={16} />
            </button>
            <small>Drafting assistant · review before sending</small>
          </section>
          <p className="liquid-proof-note">
            Counts reflect your workspace records. An approved pack is not a
            placed supplier order.
          </p>
        </aside>
      </div>
    </div>
  );
}
