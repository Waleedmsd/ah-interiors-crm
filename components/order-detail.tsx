'use client';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  FileCheck2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrderNextAction } from '@/components/order-next-action';
import { AssistantPanel } from '@/components/assistant-panel';
import {
  OrderProducts,
  FulfilmentPanel,
  PaymentPanel,
  OrderHistory,
  OrderDocuments,
  OrderMessages,
} from '@/components/order-panels';
import { useWorkspace } from '@/components/workspace-provider';
import { currentStatus, isPaid, completed, packHref } from '@/lib/operations';

const tabs = [
  ['products', 'Products & checks'],
  ['fulfilment', 'Fulfilment'],
  ['payment', 'Payment'],
  ['messages', 'Messages'],
  ['documents', 'Documents'],
  ['timeline', 'Activity'],
];
export function OrderDetail({ id }: { id: string }) {
  const { cases, dispatch, now, notify, ready } = useWorkspace();
  const order = cases.find((item) => item.id === id);
  const params = useSearchParams();
  const router = useRouter();
  const requestedTab = params.get('tab');
  const tab =
    requestedTab && tabs.some((item) => item[0] === requestedTab)
      ? requestedTab
      : 'products';
  const [note, setNote] = useState('');
  if (!order)
    return (
      <div className="page">
        <div className="ops-empty">
          <h2>
            {ready ? 'Order not found on this browser' : 'Loading local order…'}
          </h2>
          <p>
            Locally created orders are saved on the browser where you create
            them.
          </p>
          <Link className="btn" href="/orders">
            Back to orders
          </Link>
        </div>
      </div>
    );
  const status = currentStatus(order);
  return (
    <div className="page ops-page">
      <nav className="ops-subnav" aria-label="Breadcrumb">
        <Link href="/">Today</Link>
        <ChevronRight size={13} />
        <Link href="/orders">Orders</Link>
        <ChevronRight size={13} />
        <span>#{id}</span>
      </nav>
      <PageIntro
        title={order.customer}
        description={'Order #' + id + ' · ' + order.date + ' · ' + order.city}
        action={
          <>
            <Link className="btn" href={'/invoices/' + order.invoice}>
              View invoice
            </Link>
          </>
        }
      />
      <div className="ops-order-head">
        <StatusPill
          tone={
            completed(order)
              ? 'green'
              : order.issues.length
                ? 'red'
                : status === 'New'
                  ? 'grey'
                  : status === 'In review'
                    ? 'gold'
                    : 'blue'
          }
        >
          {status === 'Approved' ? 'Approved · not executed' : status}
        </StatusPill>
        <StatusPill tone={isPaid(order) ? 'green' : 'gold'}>
          {isPaid(order) ? 'Paid · sample record' : 'Payment hold'}
        </StatusPill>
        <span className="preview-label">{order.channel}</span>
        <span>Original ref: {order.sourceRef}</span>
        <span className="ops-spacer" />
        <span>Owner: Amir · admin</span>
      </div>
      <div className="ops-stage-strip">
        {[
          {
            label: '01 · Payment',
            value: isPaid(order) ? 'Recorded' : 'Awaiting balance',
            done: isPaid(order),
          },
          {
            label: '02 · Preparation',
            value: order.pack
              ? 'Pack prepared'
              : order.status === 'New'
                ? 'Not started'
                : 'Existing order',
            done: Boolean(order.pack) || order.status !== 'New',
          },
          {
            label: '03 · Approval',
            value:
              order.pack?.state === 'Approved'
                ? 'Recorded locally'
                : order.pack
                  ? 'Your review'
                  : 'Not requested',
            done: order.pack?.state === 'Approved',
            active: order.pack?.state === 'Draft',
          },
          {
            label: '04 · Fulfilment',
            value: completed(order)
              ? 'Complete'
              : order.groups.every(
                    (group) => group.supplierStatus === 'Not ordered',
                  )
                ? 'Not ordered'
                : 'In progress',
            done: completed(order),
          },
        ].map((stage) => (
          <div
            className={
              'ops-stage ' +
              (stage.done ? 'done' : stage.active ? 'active' : '')
            }
            key={stage.label}
          >
            <span>{stage.label}</span>
            <strong>
              {stage.done && <Check size={14} />}
              {stage.value}
            </strong>
          </div>
        ))}
      </div>
      <div className="ops-case-layout">
        <div className="stack ops-case-main">
          {order.issues.map((issue) => (
            <div className="ops-warning" key={issue}>
              <TriangleAlert size={20} />
              <div>
                <strong>Needs a decision</strong>
                {issue}
              </div>
            </div>
          ))}
          {order.pack && (
            <Link
              href={packHref(id)}
              className={
                order.pack.state === 'Approved'
                  ? 'ops-approved-strip'
                  : 'ops-muted-box flex items-center gap-3'
              }
            >
              <FileCheck2 size={21} />
              <div className="flex-1">
                <strong>
                  {order.pack.state === 'Approved'
                    ? 'Approved pack · revision '
                    : 'Review order pack · revision '}
                  {order.pack.revision}
                </strong>
                <p className="text-sm mt-1">
                  {order.pack.drafts.length} drafts · {order.groups.length}{' '}
                  supplier group{order.groups.length > 1 ? 's' : ''} · nothing
                  sent or booked
                </p>
              </div>
              <ArrowRight size={18} />
            </Link>
          )}
          <Tabs
            value={tab}
            onValueChange={(value) =>
              router.replace('/orders/' + id + '?tab=' + value, {
                scroll: false,
              })
            }
            className="ops-case-tabs"
          >
            <div className="ops-tabs-scroll">
              <TabsList variant="line" className="ops-tabs">
                {tabs.map(([value, label]) => (
                  <TabsTrigger value={value} key={value}>
                    {label}
                    {value === 'messages' && order.pack && (
                      <span className="ops-tab-count">
                        {order.pack.drafts.length}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <TabsContent value="products">
              <OrderProducts order={order} />
            </TabsContent>
            <TabsContent value="fulfilment">
              <FulfilmentPanel order={order} />
            </TabsContent>
            <TabsContent value="payment">
              <PaymentPanel order={order} />
            </TabsContent>
            <TabsContent value="messages">
              <OrderMessages order={order} />
            </TabsContent>
            <TabsContent value="documents">
              <OrderDocuments order={order} />
            </TabsContent>
            <TabsContent value="timeline">
              <OrderHistory order={order} />
            </TabsContent>
          </Tabs>
          <Panel
            title="Internal note"
            description="Only visible in the local workspace."
          >
            <div className="ops-contact">
              {order.note && (
                <p className="ops-muted-box mb-4 whitespace-pre-wrap">
                  {order.note}
                </p>
              )}
              <form
                className="ops-note-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!note.trim()) return;
                  const result = dispatch({
                    type: 'note',
                    id,
                    text: note,
                    now,
                  });
                  if (result.error) return;
                  setNote('');
                  notify('Internal note added to this order’s activity.');
                }}
              >
                <textarea
                  aria-label="Internal order note"
                  placeholder="Add access instructions, a decision, or something to follow up…"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <Button
                  className="btn btn-small"
                  disabled={!ready || !note.trim()}
                  type="submit"
                >
                  Add note
                </Button>
              </form>
            </div>
          </Panel>
        </div>
        <aside className="ops-case-sidebar">
          <OrderNextAction order={order} />
          <Panel title="Customer & destination">
            <div className="ops-contact">
              <div className="ops-contact-name">
                <span className={'avatar avatar-' + order.color}>
                  {order.initials}
                </span>
                <div>
                  <Link
                    className="customer-name-link"
                    href={'/customers?customer=' + order.customerId}
                  >
                    {order.customer}
                  </Link>
                  <p>{order.customerId}</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Delivery address · sample</dt>
                  <dd>
                    {order.address}
                    <br />
                    {order.postcode} · United Kingdom
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{order.email}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{order.phone}</dd>
                </div>
                <div>
                  <dt>Order channel</dt>
                  <dd>
                    {order.channel} · {order.sourceRef}
                  </dd>
                </div>
              </dl>
            </div>
          </Panel>
          <AssistantPanel orderId={id} />
          <p className="ops-local-note">
            <ShieldCheck size={17} />
            Synthetic customer and catalogue data. This workspace does not send
            emails, buy stock or book transport.
          </p>
        </aside>
      </div>
      <Link href="/" className="text-link mt-6">
        <ArrowLeft size={15} />
        Back to Today
      </Link>
    </div>
  );
}
