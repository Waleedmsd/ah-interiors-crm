'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  FileCheck2,
  LockKeyhole,
  ShieldCheck,
  Truck,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { ProcessButton } from '@/components/process-button';
import { useWorkspace } from '@/components/workspace-provider';
import { approvalBlockers, isPaid, type Pack } from '@/lib/operations';
import { money } from '@/lib/demo-data';

export function OrderReview({ id }: { id: string }) {
  const { cases, dispatch, now, notify, ask, setAssistantOpen, ready } =
    useWorkspace();
  const [selected, setSelected] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [changedDrafts, setChangedDrafts] = useState<string[]>([]);
  const order = cases.find((item) => item.id === id);
  function changeDraft(action: Parameters<typeof dispatch>[0]) {
    if (action.type === 'draft') {
      if (action.patch.reviewed === true)
        setChangedDrafts((current) =>
          current.filter((value) => value !== action.draftId),
        );
      else if (
        order?.pack?.drafts.find((draft) => draft.id === action.draftId)
          ?.reviewed
      )
        setChangedDrafts((current) => [
          ...new Set([...current, action.draftId]),
        ]);
    }
    return dispatch(action);
  }
  if (!order)
    return (
      <div className="page ops-empty">
        <h2>
          {ready ? 'Order not found on this browser' : 'Loading local order…'}
        </h2>
        <Link className="btn mt-4" href="/orders">
          Back to orders
        </Link>
      </div>
    );
  const pack = order.pack;
  if (!pack)
    return (
      <div className="page ops-page">
        <PageIntro
          title="Prepare an order pack"
          description={order.customer + ' · #' + id}
        />
        <div className="section-card ops-empty">
          <FileCheck2 size={36} />
          <h3>
            {isPaid(order)
              ? 'Start with Process order'
              : 'Payment must be verified first'}
          </h3>
          <p>
            {isPaid(order)
              ? 'Prepare a complete set of supplier drafts, service instructions and customer updates for your review.'
              : 'This order has an outstanding or unverified payment. Record it in the order workspace before processing.'}
          </p>
          <div className="flex justify-center">
            <ProcessButton id={id} />
          </div>
        </div>
        <Link className="text-link mt-5" href={'/orders/' + id}>
          <ArrowLeft />
          Back to order
        </Link>
      </div>
    );
  const approved = pack.state === 'Approved';
  const blockers = approvalBlockers(order);
  const active = pack.drafts.some((draft) => draft.id === selected)
    ? selected
    : pack.drafts[0].id;
  const reviewedCount = pack.drafts.filter((draft) => draft.reviewed).length;
  const checks: { key: keyof Pack['checks']; label: string; detail: string }[] =
    [
      {
        key: 'specification',
        label: 'Product specification checked',
        detail: 'Articles, colours, dimensions, quantities and accessories.',
      },
      {
        key: 'routing',
        label: 'Delivery route & charges checked',
        detail: 'Provider, postcode, destination and who pays.',
      },
      {
        key: 'payment',
        label: 'Payment evidence checked',
        detail: 'Full payment recorded before supplier ordering.',
      },
    ];
  return (
    <div className="page ops-page">
      <nav className="ops-subnav" aria-label="Breadcrumb">
        <Link href="/reviews">Review & approve</Link>
        <ChevronRight size={13} />
        <Link href={'/orders/' + id}>#{id}</Link>
        <ChevronRight size={13} />
        <span>Revision {pack.revision}</span>
      </nav>
      <PageIntro
        eyebrow="ORDER APPROVAL PACK"
        title={order.customer}
        description={'#' + id + ' · ' + order.channel + ' · ' + order.sourceRef}
        action={
          <Link className="btn" href={'/orders/' + id}>
            <ArrowLeft size={15} />
            Order workspace
          </Link>
        }
      />
      <div className="ops-order-head">
        <StatusPill tone={approved ? 'green' : 'gold'}>
          {approved ? 'Approved locally' : 'Awaiting your review'}
        </StatusPill>
        <span>
          {reviewedCount} / {pack.drafts.length} drafts reviewed
        </span>
        <span className="ops-spacer" />
        <span>
          <LockKeyhole className="inline mr-1" size={13} />
          Local preview · nothing sent
        </span>
      </div>
      {approved && (
        <div className="ops-approved-strip mb-6">
          <ShieldCheck size={25} />
          <div>
            <strong>Approval recorded. Execution has not started.</strong>
            <p>
              Revision {pack.revision} is approved by Amir. Emails, purchases
              and portal bookings are not connected in this frontend.
            </p>
          </div>
          <Button
            className="btn btn-small"
            onClick={() => {
              dispatch({ type: 'revise', id, now });
              notify(
                'A new revision is open. Review and approve it again before execution.',
              );
            }}
          >
            Revise pack
          </Button>
        </div>
      )}
      <div className="ops-review-layout">
        <div className="stack">
          <Panel
            title="What you’re approving"
            description="Grouped by supplier; every customer item accounted for."
            action={
              <span className="preview-label">
                {order.groups.length} group{order.groups.length > 1 ? 's' : ''}
              </span>
            }
          >
            {order.groups.map((group, index) => (
              <div className="ops-pack-group" key={group.id}>
                <div className="ops-pack-group-heading">
                  <span className="count-tag">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <strong>{group.supplier}</strong>
                  <span>{group.supplierStatus}</span>
                </div>
                {order.lines
                  .filter((line) => line.groupId === group.id)
                  .map((line) => (
                    <div className="ops-pack-item" key={line.id}>
                      <div>
                        <strong>
                          {line.quantity} × {line.name}
                        </strong>
                        <p>{line.options}</p>
                        <p>
                          {line.article} ·{' '}
                          {line.matched
                            ? 'sample match checked'
                            : 'match unresolved'}
                        </p>
                      </div>
                      <span>
                        {money(line.quantity * line.cost, 2)}
                        <small className="ops-field-label">
                          Supplier cost · sample
                        </small>
                      </span>
                    </div>
                  ))}
                <div className="ops-pack-route">
                  <Truck size={16} />
                  <span>
                    {group.route} · {order.postcode}
                  </span>
                  <StatusPill tone={group.coverageChecked ? 'green' : 'gold'}>
                    {group.coverageChecked
                      ? 'Route reviewed'
                      : 'Check coverage'}
                  </StatusPill>
                </div>
              </div>
            ))}
            <div className="section-footer">
              <span>
                All codes, rates and contacts shown here are synthetic.
              </span>
              <Link href={'/orders/' + id} className="text-link">
                Check specification
                <ArrowRight />
              </Link>
            </div>
          </Panel>
          {order.groups.length > 1 && (
            <section className="section-card">
              <div className="section-heading">
                <div>
                  <h2>Mixed-order delivery plan</h2>
                  <p>
                    Separate supplier progress. One coordinated customer
                    experience.
                  </p>
                </div>
                <Truck size={20} />
              </div>
              <div className="ops-contact">
                <div className="ops-muted-box mb-4">
                  Keep {order.groups.length} fulfilment groups and their
                  transport references separate. Combine customer delivery where
                  practical. Do not add a charge or change agreed arrangements
                  without customer agreement. Any later material change requires
                  a fresh review.
                </div>
                <label className="ops-check-row" htmlFor={'split-' + id}>
                  <Checkbox
                    id={'split-' + id}
                    checked={pack.checks.split}
                    disabled={approved || !ready}
                    onCheckedChange={(value) =>
                      dispatch({
                        type: 'check',
                        id,
                        key: 'split',
                        value: Boolean(value),
                      })
                    }
                  />
                  <span>
                    I approve this coordination plan. No extra delivery charge
                    or separate appointment is authorised by this approval.
                  </span>
                </label>
              </div>
            </section>
          )}
          <Panel
            title="Messages & instructions"
            description="Edit the actual drafts, then mark each one reviewed."
            action={
              <span className="count-tag">
                {reviewedCount}/{pack.drafts.length}
              </span>
            }
          >
            <Tabs
              value={active}
              onValueChange={(value) => setSelected(String(value))}
            >
              <div className="ops-draft-nav">
                <TabsList className="liquid-draft-tabs">
                  {pack.drafts.map((draft, index) => (
                    <TabsTrigger
                      className="liquid-draft-tab"
                      key={draft.id}
                      value={draft.id}
                      title={draft.subject}
                    >
                      {draft.reviewed ? (
                        <Check size={14} />
                      ) : (
                        <span className="ops-tab-count">{index + 1}</span>
                      )}
                      {draft.kind}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
              {pack.drafts.map((draft, index) => (
                <TabsContent key={draft.id} value={draft.id}>
                  <div className="ops-draft-editor">
                    {changedDrafts.includes(draft.id) && !draft.reviewed && (
                      <output className="ops-changed-notice">
                        <TriangleAlert size={16} />
                        <span>
                          Changed since review. Review this message again; final
                          checks have been cleared.
                        </span>
                      </output>
                    )}
                    <div className="ops-draft-timing">
                      <Clock3 size={15} />
                      <span>{draft.timing}</span>
                    </div>
                    <label>
                      <span>To</span>
                      <input
                        type="email"
                        aria-label={'Recipient for ' + draft.id}
                        value={draft.to}
                        disabled={approved || !ready}
                        onChange={(event) =>
                          changeDraft({
                            type: 'draft',
                            id,
                            draftId: draft.id,
                            patch: { to: event.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Subject</span>
                      <input
                        aria-label={'Subject for ' + draft.id}
                        value={draft.subject}
                        disabled={approved || !ready}
                        onChange={(event) =>
                          changeDraft({
                            type: 'draft',
                            id,
                            draftId: draft.id,
                            patch: { subject: event.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>
                        {draft.kind === 'Transport instructions'
                          ? 'Held planning instructions'
                          : 'Message'}
                      </span>
                      <textarea
                        rows={14}
                        aria-label={'Message for ' + draft.id}
                        value={draft.body}
                        disabled={approved || !ready}
                        onChange={(event) =>
                          changeDraft({
                            type: 'draft',
                            id,
                            draftId: draft.id,
                            patch: { body: event.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="ops-draft-review">
                    <label
                      className="ops-check-row"
                      htmlFor={'review-' + draft.id}
                    >
                      <Checkbox
                        id={'review-' + draft.id}
                        checked={draft.reviewed}
                        disabled={approved || !ready}
                        onCheckedChange={(value) =>
                          changeDraft({
                            type: 'draft',
                            id,
                            draftId: draft.id,
                            patch: { reviewed: Boolean(value) },
                          })
                        }
                      />
                      <span>
                        I have reviewed this{' '}
                        {draft.kind === 'Transport instructions'
                          ? 'transport instruction'
                          : 'recipient and message'}
                        .
                      </span>
                    </label>
                    <small>
                      Any edit clears this check. All changes stay in this
                      preview session.
                    </small>
                    {index < pack.drafts.length - 1 && (
                      <div className="flex justify-end mt-3">
                        <Button
                          className="btn btn-small"
                          onClick={() => setSelected(pack.drafts[index + 1].id)}
                        >
                          Next draft
                          <ArrowRight size={14} />
                        </Button>
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </Panel>
          <p className="ops-local-note">
            <ShieldCheck size={17} />
            Approving this pack does not confirm stock, manufacture, physical
            receipt, delivery or assembly. Each needs its own evidence.
          </p>
        </div>
        <aside className="ops-review-sidebar">
          <section className="section-card overflow-hidden">
            <div className="section-heading">
              <h2>Your decision</h2>
              <FileCheck2 size={19} />
            </div>
            <div className="ops-review-summary">
              <div className="ops-summary-row">
                <span>Customer order</span>
                <strong>{money(order.total, 2)}</strong>
              </div>
              <div className="ops-summary-row">
                <span>Payment</span>
                <StatusPill tone={isPaid(order) ? 'green' : 'gold'}>
                  {isPaid(order) ? 'Paid · sample' : 'On hold'}
                </StatusPill>
              </div>
              <div className="ops-summary-row">
                <span>Supplier groups</span>
                <strong>{order.groups.length}</strong>
              </div>
              <div className="ops-summary-row">
                <span>Drafts reviewed</span>
                <strong>
                  {reviewedCount} / {pack.drafts.length}
                </strong>
              </div>
              <div className="ops-summary-row">
                <span>Approver</span>
                <strong>Amir · admin</strong>
              </div>
            </div>
            <div className="ops-check-section">
              <h3>Final checks</h3>
              {checks.map((check) => (
                <div key={check.key}>
                  <label
                    className="ops-check-row"
                    htmlFor={'check-' + check.key}
                  >
                    <Checkbox
                      id={'check-' + check.key}
                      checked={pack.checks[check.key]}
                      disabled={approved || !ready}
                      onCheckedChange={(value) =>
                        dispatch({
                          type: 'check',
                          id,
                          key: check.key,
                          value: Boolean(value),
                        })
                      }
                    />
                    <span>{check.label}</span>
                  </label>
                  <p className="ml-6 mt-1">{check.detail}</p>
                </div>
              ))}
            </div>
            <div className="ops-approval-action">
              {!approved && blockers.length > 0 && (
                <>
                  <strong className="text-sm flex gap-2 items-center text-amber-800">
                    <TriangleAlert size={15} />
                    Before you go ahead
                  </strong>
                  <ul className="ops-blocker-list">
                    {blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </>
              )}
              <Button
                className="btn btn-primary"
                disabled={approved || blockers.length > 0}
                onClick={() => setConfirm(true)}
              >
                {approved ? (
                  <>
                    <Check size={17} />
                    Approved locally
                  </>
                ) : (
                  <>
                    Go ahead
                    <ArrowRight size={17} />
                  </>
                )}
              </Button>
              <p>
                {approved
                  ? 'Nothing has been sent or booked.'
                  : 'Records approval for this revision only. No live execution is available in this preview.'}
              </p>
            </div>
          </section>
          <div className="ops-muted-box">
            <strong className="block mb-2">
              After supplier order placement
            </strong>
            Notify the assembly provider immediately. Chase missing replies with
            an internal reminder within 24 hours.
            <br />
            <Button
              className="btn btn-small mt-4 w-full"
              onClick={() => {
                ask('What is blocking order #' + id + '?', [], id);
                setAssistantOpen(true);
              }}
            >
              Ask Amiro to review
              <ArrowRight size={14} />
            </Button>
          </div>
        </aside>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="sm:!max-w-[500px]">
          <DialogTitle>Go ahead with revision {pack.revision}?</DialogTitle>
          <DialogDescription>
            You are approving {order.customer}’s pack with {pack.drafts.length}{' '}
            reviewed drafts and {order.groups.length} supplier group
            {order.groups.length > 1 ? 's' : ''}. This records a local approval
            only.
          </DialogDescription>
          <div className="ops-warning">
            <LockKeyhole size={18} />
            <p>
              No email will be sent, purchase placed, or BStar job booked. Held
              transport instructions remain held.
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <Button className="btn" onClick={() => setConfirm(false)}>
              Back to review
            </Button>
            <Button
              className="btn btn-primary"
              disabled={blockers.length > 0 || approved}
              onClick={() => {
                if (approvalBlockers(order).length) return;
                dispatch({ type: 'approve', id, now });
                setConfirm(false);
                notify(
                  'Approval recorded for revision ' +
                    pack.revision +
                    '. Nothing sent or booked.',
                );
              }}
            >
              Approve locally
              <Check size={16} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
