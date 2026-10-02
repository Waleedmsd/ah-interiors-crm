'use client';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Boxes,
  ClipboardList,
  FileText,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { AssistantPanel } from '@/components/assistant-panel';
import { OrderNextAction } from '@/components/order-next-action';
import { useWorkspace } from '@/components/workspace-provider';
import { currentStatus, isPaid } from '@/lib/operations';
export default function AssistantPage() {
  const { cases, messages } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const order = cases.find((item) => item.id === params.get('order'));
  const drafts = messages.filter(
    (message) => message.action?.status === 'prepared',
  ).length;
  return (
    <div className="page">
      <PageIntro
        eyebrow="AMIRO / ASSISTANT"
        title="Space to think. Help to act."
        description="Prepare your next step, with the right record beside you."
        action={<StatusPill tone="grey">Local preview</StatusPill>}
      />
      <div className="chat-workspace">
        <AssistantPanel full orderId={order?.id} />
        <aside className="stack">
          <Panel
            title="Conversation context"
            description="Choose the record you want to work on."
          >
            <div className="liquid-context-picker">
              <label htmlFor="assistant-order">Linked order</label>
              <select
                id="assistant-order"
                className="commerce-input"
                value={order?.id || ''}
                onChange={(event) =>
                  router.replace(
                    event.target.value
                      ? '/assistant?order=' + event.target.value
                      : '/assistant',
                  )
                }
              >
                <option value="">Whole workspace</option>
                {cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    #{item.id} · {item.customer}
                  </option>
                ))}
              </select>
            </div>
            {order ? (
              <div className="liquid-linked-record">
                <Link href={'/customers?customer=' + order.customerId}>
                  {order.customer}
                  <ArrowUpRight size={15} />
                </Link>
                <p>{order.product}</p>
                <div className="action-row">
                  <StatusPill tone={isPaid(order) ? 'green' : 'gold'}>
                    {isPaid(order) ? 'Paid' : 'Payment hold'}
                  </StatusPill>
                  <StatusPill tone="grey">
                    {currentStatus(order) === 'Approved'
                      ? 'Approved locally'
                      : currentStatus(order)}
                  </StatusPill>
                </div>
                <Link href={'/orders/' + order.id} className="text-link">
                  Open full record
                  <ArrowUpRight size={14} />
                </Link>
              </div>
            ) : (
              [
                {
                  icon: ClipboardList,
                  title: 'Orders',
                  detail: cases.length + ' records in this browser',
                  href: '/orders',
                },
                {
                  icon: Mail,
                  title: 'Communications',
                  detail: 'Saved messages and drafts',
                  href: '/communications',
                },
                {
                  icon: Boxes,
                  title: 'Purchasing',
                  detail: 'Supplier confirmations and exceptions',
                  href: '/purchasing',
                },
                {
                  icon: FileText,
                  title: 'Documents',
                  detail: 'Available local references',
                  href: '/documents',
                },
              ].map((item) => (
                <Link
                  className="chat-context"
                  key={item.title}
                  href={item.href}
                >
                  <item.icon />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
              ))
            )}
          </Panel>
          {order && <OrderNextAction order={order} />}
          <Panel title="Prepared is not performed">
            <div className="section-body">
              <ShieldCheck size={22} />
              <p className="liquid-control-copy">
                Drafts and checklists are prepared locally. You review the
                content and approve the handoff. Nothing is sent, ordered or
                booked here.
              </p>
              <div className="liquid-prepared-count">
                <strong>{drafts}</strong>
                <span>
                  prepared {drafts === 1 ? 'draft' : 'drafts'} in this session
                </span>
              </div>
            </div>
          </Panel>
          <p className="liquid-proof-note">
            Responses are scripted for this frontend preview. Only available
            local records are shown; no live account connection is implied.
          </p>
        </aside>
      </div>
    </div>
  );
}
