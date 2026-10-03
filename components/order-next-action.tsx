'use client';
import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, Sparkles } from 'lucide-react';
import { ProcessButton } from '@/components/process-button';
import { useWorkspace } from '@/components/workspace-provider';
import {
  approvalBlockers,
  completed,
  isPaid,
  type OrderCase,
} from '@/lib/operations';
export function OrderNextAction({ order }: { order: OrderCase }) {
  const { ready, persistence } = useWorkspace();
  const paid = isPaid(order);
  const done = completed(order);
  const approved = order.pack?.state === 'Approved';
  const review = order.pack?.state === 'Draft';
  const blockers = review ? approvalBlockers(order) : [];
  if (order.flooringLeadId)
    return (
      <section className="next-action-panel" aria-label="Next action">
        <div className="next-action-label">FLOORING WORKFLOW</div>
        <h2>
          {done
            ? 'Fitting signed off'
            : !paid
              ? 'Confirm payment before fitting'
              : 'Prepare materials & fitting'}
        </h2>
        <p>
          {done
            ? 'The fitting evidence and accepted quote remain linked to this order.'
            : 'Use the connected flooring job to allocate stock, review shortage purchases and schedule fitting.'}
        </p>
        <Link
          className="btn btn-primary"
          href={
            !paid
              ? '/invoices/' + order.invoice
              : '/flooring/fitting?record=' + order.flooringLeadId
          }
        >
          {!paid ? 'Open invoice' : 'Open fitting job'}
          <ArrowRight size={16} />
        </Link>
      </section>
    );
  if (
    process.env.NEXT_PUBLIC_CRM_MODE !== 'preview' ||
    process.env.NODE_ENV === 'production'
  )
    return (
      <section className="next-action-panel" aria-label="Next action">
        <div className="next-action-label">CONNECTED FULFILMENT</div>
        <h2>
          {done
            ? 'Review completion & actual costs'
            : !paid
              ? 'Verify payment'
              : 'Manage stock & shipments'}
        </h2>
        <p>
          {done
            ? 'Delivery and assembly evidence are linked to this order. Review actual costs before treating profit as final.'
            : !paid
              ? 'Confirm payment on the invoice before allocating stock and releasing deliveries.'
              : 'See stock shortages, purchase orders, delivery jobs and assembly sign-off in one workflow.'}
        </p>
        <Link
          className="btn btn-primary"
          href={
            !paid
              ? '/invoices/' + order.invoice
              : '/orders/' + order.id + '?tab=fulfilment'
          }
        >
          {!paid ? 'Open invoice' : 'Open fulfilment'}
          <ArrowRight size={16} />
        </Link>
      </section>
    );
  const title = done
    ? 'Completion evidence recorded'
    : !paid
      ? 'Confirm the remaining payment'
      : approved
        ? 'Check the approved handoff'
        : review
          ? 'Review the prepared order pack'
          : order.status === 'New'
            ? 'Prepare the supplier order'
            : 'Check the next fulfilment step';
  return (
    <section className="next-action-panel" aria-label="Next action">
      <div className="next-action-label">
        {done ? (
          <Check size={16} />
        ) : !paid ? (
          <LockKeyhole size={16} />
        ) : (
          <Sparkles size={16} />
        )}{' '}
        {done ? 'RECORD COMPLETE' : 'NEXT ACTION'}
      </div>
      <h2>{title}</h2>
      <p>
        {done
          ? 'All groups have the required delivery and assembly evidence.'
          : !paid
            ? 'Full payment is required before an order pack can proceed.'
            : approved
              ? 'Approval is saved locally. It does not send a message, place an order or book a job.'
              : review
                ? 'Verify the product details, routing and every message before local approval.'
                : order.status === 'New'
                  ? 'Build supplier drafts and route instructions from the current record.'
                  : 'Inspect each supplier group independently. Missing evidence remains visible.'}
      </p>
      {blockers.length > 0 && (
        <div className="next-action-prerequisites">
          <strong>{blockers.length} checks before approval</strong>
          <ul>
            {blockers.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {blockers.length > 3 && (
            <small>All checks are shown in the review pack.</small>
          )}
        </div>
      )}
      {!ready && (
        <p className="next-action-readonly">
          {persistence === 'read-only'
            ? 'Read-only tab. Make changes in the active editing tab.'
            : 'Workspace is loading. Editing will be available shortly.'}
        </p>
      )}
      {!done && (!paid || order.pack || order.status === 'New') ? (
        <ProcessButton id={order.id} />
      ) : (
        <Link
          className="btn btn-primary"
          href={'/orders/' + order.id + '?tab=fulfilment'}
        >
          {done ? 'View completion evidence' : 'Inspect fulfilment'}
          <ArrowRight size={16} />
        </Link>
      )}
      <Link
        className="next-action-assistant"
        href={'/assistant?order=' + order.id}
      >
        Ask Amiro about this order
        <ArrowRight size={14} />
      </Link>
    </section>
  );
}
