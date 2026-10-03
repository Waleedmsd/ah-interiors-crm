'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  invoiceForOrder,
  invoiceInputForOrder,
  nextInvoiceId,
  parsePounds,
} from '@/lib/commerce';
import {
  Clock3,
  FileText,
  Mail,
  Package,
  ShieldCheck,
  Truck,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { StatusPill } from '@/components/page-ui';
import { useWorkspace } from '@/components/workspace-provider';
import {
  hasAssembly,
  isPaid,
  routes,
  packHref,
  type Line,
  type OrderCase,
  type Group,
  type Route,
} from '@/lib/operations';
import { money } from '@/lib/demo-data';

export function OrderProducts({ order }: { order: OrderCase }) {
  const itemTotal = order.lines.reduce(
    (sum, line) => sum + Math.round(line.quantity * line.unitPrice * 100) / 100,
    0,
  );
  return (
    <div className="ops-tab-body">
      <div className="ops-muted-box">
        <strong>{order.supplierSource}</strong>
        <br />
        {order.flooringLeadId
          ? 'Materials and prices are locked to the accepted flooring quote. Use the linked fitting workflow to progress this order.'
          : 'Supplier identification and catalogue verification are separate. Check each article against the supplier catalogue before ordering.'}
      </div>
      {order.lines.map((line) => (
        <ProductLine
          key={
            line.id +
            line.article +
            line.matched +
            line.cost +
            line.costVerified
          }
          line={line}
          order={order}
        />
      ))}
      <div className="ops-total">
        <span>Products</span>
        <span>{money(itemTotal, 2)}</span>
      </div>
      {order.total !== itemTotal && (
        <div className="ops-total">
          <span>
            {order.flooringLeadId ? (
              'Fitting and extras, less quote discount'
            ) : (
              <>
                Delivery{order.groups.some(hasAssembly) ? ' & assembly' : ''} ·
                customer charge
              </>
            )}
          </span>
          <span>{money(order.total - itemTotal, 2)}</span>
        </div>
      )}
      <div className="ops-total">
        <strong>Customer order total</strong>
        <strong>{money(order.total, 2)}</strong>
      </div>
    </div>
  );
}
function ProductLine({ line, order }: { line: Line; order: OrderCase }) {
  const { dispatch, now, notify, ready } = useWorkspace();
  const [article, setArticle] = useState(line.article);
  const [matched, setMatched] = useState(line.matched);
  const [cost, setCost] = useState(
    line.costVerified === false ? '' : line.cost.toFixed(2),
  );
  const locked =
    !!order.flooringLeadId ||
    !ready ||
    order.pack?.state === 'Approved' ||
    order.status !== 'New';
  const dirty =
    article !== line.article ||
    matched !== line.matched ||
    parsePounds(cost) / 100 !== line.cost ||
    line.costVerified === false;
  return (
    <article className="ops-line">
      <div className="ops-line-top">
        <span className="ops-product-icon">
          <Package size={24} strokeWidth={1.3} />
        </span>
        <div className="ops-line-name">
          <h3>{line.name}</h3>
          <p>{line.options}</p>
          <small>
            {line.supplier} · SKU {line.sku}
          </small>
        </div>
        <div className="ops-line-price">
          <strong>{money(line.unitPrice * line.quantity, 2)}</strong>
          <span>
            {line.quantity} × {money(line.unitPrice, 2)}
          </span>
        </div>
      </div>
      <div className="ops-spec-grid">
        <label>
          <span className="ops-field-label">Supplier article</span>
          <input
            className="ops-inline-input"
            aria-label={'Article code for ' + line.name}
            value={article}
            disabled={locked}
            onChange={(event) => {
              setArticle(event.target.value);
              setMatched(false);
            }}
          />
        </label>
        <div>
          <span className="ops-field-label">Catalogue reference</span>
          <strong>{line.catalogue}</strong>
          {line.colourCode && (
            <>
              <span className="ops-field-label mt-2">Colour code</span>
              <strong>{line.colourCode}</strong>
            </>
          )}
        </div>
        <div>
          <label className="ops-field-label" htmlFor={'cost-' + line.id}>
            Supplier unit cost (£)
          </label>
          <input
            id={'cost-' + line.id}
            className="ops-inline-input"
            inputMode="decimal"
            value={cost}
            disabled={locked}
            onChange={(event) => setCost(event.target.value)}
            placeholder="Verify catalogue cost"
          />
        </div>
      </div>
      <div className="ops-line-bottom">
        <div>
          <label className="ops-check-row" htmlFor={'match-' + line.id}>
            <Checkbox
              id={'match-' + line.id}
              checked={matched}
              disabled={locked || !article.trim()}
              onCheckedChange={(value) => setMatched(Boolean(value))}
            />
            <span>Specification checked · local record</span>
          </label>
          <p>Includes finish, dimensions and every accessory.</p>
        </div>
        {dirty ? (
          <Button
            className="btn btn-small btn-primary"
            disabled={locked || !Number.isFinite(parsePounds(cost))}
            onClick={async () => {
              dispatch({
                type: 'line',
                id: order.id,
                lineId: line.id,
                article,
                matched,
                cost: parsePounds(cost) / 100,
                now,
              });
              notify(
                order.pack
                  ? 'Specification saved. Draft pack rebuilt; review checks reset.'
                  : 'Sample specification saved.',
              );
            }}
          >
            Save check
          </Button>
        ) : (
          <StatusPill tone={line.matched ? 'green' : 'gold'}>
            {line.matched ? 'Matched · sample' : 'Needs review'}
          </StatusPill>
        )}
      </div>
    </article>
  );
}

export function FulfilmentPanel({ order }: { order: OrderCase }) {
  return (
    <div className="ops-tab-body">
      {order.groups.length > 1 && (
        <div className="ops-warning">
          <Truck size={18} />
          <div>
            <strong>One customer order. Separate fulfilment groups.</strong>
            Combine delivery where practical. Changes to delivery costs or
            customer arrangements need explicit approval in the order pack.
          </div>
        </div>
      )}
      {order.groups.map((group) => (
        <FulfilmentGroup
          key={group.id + group.route + group.coverageChecked}
          order={order}
          group={group}
        />
      ))}
      <div className="ops-muted-box">
        BStar collection and delivery are separate jobs. A collection, a
        delivery window, or a booked assembly appointment does not mean the
        customer order is complete.
      </div>
    </div>
  );
}
function FulfilmentGroup({ order, group }: { order: OrderCase; group: Group }) {
  const { dispatch, now, notify, ready } = useWorkspace();
  const [route, setRoute] = useState<Route>(group.route);
  const [checked, setChecked] = useState(group.coverageChecked);
  const [open, setOpen] = useState(false);
  const [evidenceType, setEvidenceType] = useState<
    'receipt' | 'release' | 'booking' | 'delivery' | 'assembly'
  >('receipt');
  const [detail, setDetail] = useState('');
  const editable =
    ready && order.status === 'New' && order.pack?.state !== 'Approved';
  const available = [
    !group.receipt ? 'receipt' : null,
    group.receipt && isPaid(order) && !group.released ? 'release' : null,
    group.released &&
    hasAssembly(group) &&
    group.assembly === 'Awaiting booking'
      ? 'booking'
      : null,
    group.released && !group.delivery ? 'delivery' : null,
    group.delivery && hasAssembly(group) && group.assembly !== 'Complete'
      ? 'assembly'
      : null,
  ].filter(Boolean) as (typeof evidenceType)[];
  return (
    <section className="ops-route-card">
      <div className="ops-route-heading">
        <div>
          <h3>{group.supplier}</h3>
          <p>
            {order.lines
              .filter((line) => line.groupId === group.id)
              .map((line) => line.quantity + ' × ' + line.name)
              .join(' · ')}
          </p>
        </div>
        <StatusPill
          tone={
            group.delivery &&
            (!hasAssembly(group) || group.assembly === 'Complete')
              ? 'green'
              : 'blue'
          }
        >
          {group.delivery &&
          (!hasAssembly(group) || group.assembly === 'Complete')
            ? 'Complete'
            : group.supplierStatus}
        </StatusPill>
      </div>
      <div className="ops-route-body">
        <div className="ops-route-path">
          <span>{group.supplier}</span>
          <ArrowRight size={15} />
          <span>
            {hasAssembly(group)
              ? group.route
              : group.route.startsWith('AH')
                ? 'AH showroom'
                : 'BStar collection'}
          </span>
          <ArrowRight size={15} />
          <span>{order.customer.split(' ')[0]}</span>
        </div>
        <div className="ops-spec-grid !p-0 !border-0">
          <label>
            <span className="ops-field-label">Delivery & service route</span>
            <select
              className="ops-inline-input"
              value={route}
              disabled={!editable}
              onChange={(event) => {
                setRoute(event.target.value as Route);
                setChecked(false);
              }}
            >
              {routes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="ops-field-label">Customer postcode</span>
            <strong>{order.postcode}</strong>
          </div>
          <div>
            <span className="ops-field-label">Charging arrangement</span>
            <strong>
              {hasAssembly({ ...group, route })
                ? 'AH pays provider directly · sample'
                : 'AH BStar account · sample'}
            </strong>
          </div>
        </div>
        <label className="ops-check-row" htmlFor={'coverage-' + group.id}>
          <Checkbox
            id={'coverage-' + group.id}
            checked={checked}
            disabled={!editable}
            onCheckedChange={(value) => setChecked(Boolean(value))}
          />
          <span>
            Postcode route reviewed for this preview
            <br />
            <small className="ops-field-label">
              Manual coverage is indicative. Reconfirm current coverage and
              rates before live use.
            </small>
          </span>
        </label>
        {(route !== group.route || checked !== group.coverageChecked) && (
          <div>
            <Button
              className="btn btn-small btn-primary"
              onClick={async () => {
                dispatch({
                  type: 'route',
                  id: order.id,
                  groupId: group.id,
                  route,
                  checked,
                  now,
                });
                notify(
                  'Route saved. Any existing draft pack has been rebuilt for review.',
                );
              }}
            >
              Save route{order.pack ? ' & rebuild drafts' : ''}
            </Button>
          </div>
        )}
        <div className="ops-route-milestones">
          {[
            ['Supplier', group.supplierStatus],
            ['Physical receipt', group.receipt ? 'Received' : 'Awaiting goods'],
            ['AH release', group.released ? 'Released' : 'Not released'],
            [
              'Delivery',
              group.delivery ? 'Confirmed complete' : 'Not complete',
            ],
            ['Assembly', group.assembly],
            ['Follow-up', 'Within 24 hours'],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {group.jobs.length > 0 && (
          <div>
            {group.jobs.map((job) => (
              <div className="ops-job" key={job.type}>
                <span>{job.type}</span>
                <div>
                  <strong>{job.ref}</strong>
                  <small>{job.window}</small>
                </div>
                <StatusPill tone={job.status === 'Done' ? 'green' : 'grey'}>
                  {job.status}
                </StatusPill>
              </div>
            ))}
          </div>
        )}
        {hasAssembly(group) && (
          <div className="ops-muted-box">
            <strong>Provider heads-up at supplier order placement.</strong>
            <br />
            Then track receipt, AH release, customer booking and completion
            separately. No appointment is inferred from elapsed time.
          </div>
        )}
        {group.supplierStatus === 'Confirmed' && available.length > 0 && (
          <div>
            <Button
              className="btn btn-small"
              onClick={async () => {
                setEvidenceType(available[0]);
                setOpen(true);
              }}
            >
              Record sample update
              <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:!max-w-[520px]">
          <DialogTitle>Record a preview update</DialogTitle>
          <DialogDescription>
            This adds sample evidence only. It does not contact the provider or
            book anything.
          </DialogDescription>
          <label>
            <span className="ops-field-label">Evidence type</span>
            <select
              className="ops-inline-input"
              value={evidenceType}
              onChange={(event) =>
                setEvidenceType(event.target.value as typeof evidenceType)
              }
            >
              {available.map((value) => (
                <option key={value} value={value}>
                  {
                    {
                      receipt: 'Physical receipt confirmation',
                      release: 'AH release to book',
                      booking: 'Confirmed assembly appointment',
                      delivery: 'Delivery completion evidence',
                      assembly: 'Assembly completion evidence',
                    }[value]
                  }
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="ops-field-label">
              Source, reference and confirmed details
            </span>
            <textarea
              className="ops-inline-input"
              rows={4}
              placeholder="Example: sample provider email, appointment on 10 September…"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </label>
          <Button
            className="btn btn-primary"
            disabled={
              !ready || !detail.trim() || !available.includes(evidenceType)
            }
            onClick={async () => {
              dispatch({
                type: 'evidence',
                id: order.id,
                groupId: group.id,
                event: evidenceType,
                detail,
                now,
              });
              setOpen(false);
              setDetail('');
              notify('Sample evidence recorded. No external action taken.');
            }}
          >
            Record local evidence
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function PaymentPanel({ order }: { order: OrderCase }) {
  const { commerce, mutate, ready } = useWorkspace();
  const router = useRouter();
  const invoice = invoiceForOrder(commerce, order.id);
  return (
    <div className="ops-tab-body">
      <div className={isPaid(order) ? 'ops-approved-strip' : 'ops-warning'}>
        <ShieldCheck size={22} />
        <div>
          <strong>
            {isPaid(order)
              ? 'Paid · recorded in the local ledger'
              : 'Payment hold · do not process yet'}
          </strong>
          <p>
            {isPaid(order)
              ? 'The linked invoice is fully paid in this preview.'
              : 'An invoice is not proof of payment. Record verified funds on the invoice before preparing the supplier order.'}
          </p>
        </div>
      </div>
      <div className="ops-route-milestones">
        {[
          ['Order total', money(order.total, 2)],
          ['Payments recorded', money(order.paid, 2)],
          ['Outstanding', money(order.total - order.paid, 2)],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="ops-spec-grid !p-0 !border-0">
        <div>
          <span className="ops-field-label">Linked customer invoice</span>
          {invoice ? (
            <Link className="text-link" href={'/invoices/' + invoice.id}>
              {invoice.id} · {invoice.lifecycle}
            </Link>
          ) : (
            <strong>No active invoice</strong>
          )}
        </div>
        <div>
          <span className="ops-field-label">Latest payment reference</span>
          <strong>{order.paymentReference}</strong>
        </div>
        <div>
          <span className="ops-field-label">Customer account</span>
          <Link
            className="text-link"
            href={'/customers?customer=' + order.customerId}
          >
            {order.customer}
          </Link>
        </div>
      </div>
      <div>
        {invoice ? (
          <Link className="btn btn-primary" href={'/invoices/' + invoice.id}>
            <FileText size={16} />
            {invoice.lifecycle === 'Draft'
              ? 'Review & issue invoice'
              : isPaid(order)
                ? 'View invoice & payments'
                : 'Open invoice · record payment'}
          </Link>
        ) : (
          <Button
            className="btn btn-primary"
            disabled={!ready}
            onClick={async () => {
              const result = await mutate({
                type: 'create-invoice',
                id: nextInvoiceId(commerce),
                input: invoiceInputForOrder(order, Date.now()),
              });
              if (!result.error) router.push('/invoices/' + result.id);
            }}
          >
            Generate invoice draft
          </Button>
        )}
      </div>
      <div className="ops-muted-box">
        Partial and full payments are recorded in one invoice ledger. Only the
        linked order is updated. No bank, payment provider or email service is
        connected.
      </div>
    </div>
  );
}

export function OrderHistory({ order }: { order: OrderCase }) {
  return (
    <div className="ops-tab-body">
      <h3>Evidence & decisions</h3>
      <p>A local session history. Approval never stands in for execution.</p>
      <div>
        {[...order.events].reverse().map((event) => (
          <div className="ops-evidence-row" key={event.id}>
            <Clock3 size={18} />
            <div>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              <small>{event.source}</small>
            </div>
            <time>
              {new Intl.DateTimeFormat('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/London',
              }).format(event.at)}
            </time>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrderDocuments({ order }: { order: OrderCase }) {
  const [selected, setSelected] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const records = [
    {
      title: 'Customer invoice · ' + order.invoice,
      source: order.channel,
      body:
        'SAMPLE INVOICE RECORD\n\n' +
        order.customer +
        '\nOriginal reference: ' +
        order.sourceRef +
        '\n\n' +
        order.lines
          .map(
            (line) =>
              line.quantity +
              ' × ' +
              line.name +
              ': ' +
              money(line.quantity * line.unitPrice, 2),
          )
          .join('\n') +
        '\nTotal including customer service charges: ' +
        money(order.total, 2) +
        '\nPayment recorded: ' +
        money(order.paid, 2),
    },
    ...order.lines.map((line) => ({
      title: line.catalogue,
      source: 'Catalogue · sample extract',
      body:
        'SAMPLE CATALOGUE RECORD — NOT A REAL SUPPLIER PAGE\n\n' +
        line.name +
        '\nArticle: ' +
        line.article +
        '\n' +
        line.options +
        '\n\nCurrent supplier PDFs will be connected from Dropbox in the backend phase.',
    })),
    ...order.groups
      .filter((group) => group.supplierStatus === 'Confirmed')
      .map((group) => ({
        title: group.supplier + ' confirmation · sample',
        source: 'Supplier correspondence',
        body:
          'SAMPLE CONFIRMATION RECORD\n\nCustomer ref: CC-' +
          order.customer +
          '\nDestination: ' +
          group.route +
          '\nStatus: ' +
          group.supplierStatus +
          '\n\n' +
          (order.issues.join('\n') ||
            'No discrepancy recorded in this sample.'),
      })),
  ];
  return (
    <div className="ops-tab-body">
      <p>
        Order-linked sample records. No private Dropbox files have been
        imported.
      </p>
      {records.map((record, index) => (
        <div className="ops-evidence-row" key={record.title + index}>
          <FileText size={20} />
          <div>
            <strong>{record.title}</strong>
            <small>{record.source}</small>
          </div>
          <Button className="btn btn-small" onClick={() => setSelected(record)}>
            View sample
          </Button>
        </div>
      ))}
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <DialogContent className="sm:!max-w-[650px]">
          <DialogTitle>{selected?.title}</DialogTitle>
          <DialogDescription>
            Text preview of a sample document record, not an original PDF.
          </DialogDescription>
          <pre className="ops-muted-box whitespace-pre-wrap font-sans max-h-[55vh] overflow-auto">
            {selected?.body}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function OrderMessages({ order }: { order: OrderCase }) {
  const { ask, setAssistantOpen } = useWorkspace();
  return (
    <div className="ops-tab-body">
      {order.pack ? (
        <>
          <div className="ops-muted-box">
            {order.pack.drafts.length} drafts in revision {order.pack.revision}.{' '}
            {order.pack.state === 'Approved'
              ? 'Approved locally; none sent.'
              : 'Awaiting review; none sent.'}
          </div>
          {order.pack.drafts.map((draft) => (
            <Link
              href={packHref(order.id)}
              key={draft.id}
              className="ops-evidence-row"
            >
              <Mail size={19} />
              <div>
                <strong>{draft.subject}</strong>
                <p>To: {draft.to}</p>
                <small>
                  {draft.kind} · {draft.timing}
                </small>
              </div>
              <StatusPill tone={draft.reviewed ? 'green' : 'gold'}>
                {draft.reviewed ? 'Reviewed' : 'Draft'}
              </StatusPill>
            </Link>
          ))}
        </>
      ) : (
        <div className="ops-empty">
          <Mail size={30} />
          <h3>
            {order.status === 'New'
              ? 'Drafts start with Process order'
              : 'Correspondence is not connected yet'}
          </h3>
          <p>
            {order.status === 'New'
              ? 'Prepare the complete pack to review supplier, provider and customer messages together.'
              : 'Use the assistant to prepare a follow-up from this sample order. Live email threads come with the backend.'}
          </p>
        </div>
      )}
      <div>
        <Button
          className="btn"
          onClick={async () => {
            ask(
              'Draft a supplier follow-up for order #' + order.id,
              [],
              order.id,
            );
            setAssistantOpen(true);
          }}
        >
          Prepare an order follow-up
          <ArrowRight size={15} />
        </Button>
      </div>
    </div>
  );
}
