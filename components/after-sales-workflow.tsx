'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  PackageCheck,
  RotateCcw,
  MessagesSquare,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import './after-sales-workflow.css';
type Project = Awaited<
  ReturnType<typeof import('@/server/services/after-sales').afterSalesProject>
>;
const money = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    n / 100,
  );
export function AfterSalesWorkflow({
  caseId,
  version,
  onChange,
}: {
  caseId: string;
  version: number;
  onChange: () => Promise<void>;
}) {
  const [p, setP] = useState<Project | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [tab, setTab] = useState('Contact'),
    [product, setProduct] = useState(''),
    [quantity, setQuantity] = useState(1),
    [cost, setCost] = useState('');
  const [audience, setAudience] = useState<'Customer' | 'Supplier'>('Customer'),
    [note, setNote] = useState(''),
    [nextDate, setNextDate] = useState('');
  const [reservation, setReservation] = useState(''),
    [returnQty, setReturnQty] = useState(1),
    [location, setLocation] = useState(''),
    [disposition, setDisposition] = useState('Restock'),
    [reason, setReason] = useState('');
  const [stopReason, setStopReason] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [amount, setAmount] = useState(''),
    [refund, setRefund] = useState(''),
    [outcome, setOutcome] = useState('Advice / no further action'),
    [resolution, setResolution] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  async function load() {
    try {
      const v = await apiRequest<Project>(
        '/api/service-cases/' + caseId + '/workflow',
      );
      setP(v);
      setProduct(v.workflow.productId ?? '');
      setQuantity(v.workflow.quantity);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [caseId, version]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!p || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setP(
        await apiRequest<Project>(
          '/api/service-cases/' + caseId + '/workflow',
          {
            method: 'POST',
            body: JSON.stringify({ action, version: p.version, ...extra }),
          },
        ),
      );
      setNotice('Saved to the case and linked records.');
      setNote('');
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return (
      <section className="after-sales">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Loading case workflow…'}
        </p>
        {error && (
          <button className="btn" onClick={load}>
            Try again
          </button>
        )}
      </section>
    );
  const w = p.workflow,
    closed = ['Resolved', 'Closed'].includes(p.status);
  const itemName = p.products.find((v) => v.id === w.productId)?.name;
  return (
    <section className="after-sales" aria-label="After-sales workflow">
      <header>
        <div>
          <span className="as-eyebrow">CONNECTED AFTER-SALES</span>
          <h3>Make the customer whole</h3>
          <p>Track the remedy, its evidence and your next commitment.</p>
        </div>
        <button
          className="btn btn-small"
          aria-label="Refresh after-sales"
          onClick={load}
          disabled={busy}
        >
          <RefreshCw size={15} />
        </button>
      </header>
      {error && (
        <p className="as-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="as-success" role="status">
          {notice}
        </p>
      )}
      <div className="as-commitments">
        <div>
          <MessagesSquare size={16} />
          <span>
            Customer update
            <strong>{w.customerNextDate || 'No update scheduled'}</strong>
          </span>
        </div>
        <div>
          <PackageCheck size={16} />
          <span>
            Supplier follow-up
            <strong>{w.supplierNextDate || 'No chase scheduled'}</strong>
          </span>
        </div>
      </div>
      {w.productId && (
        <p className="as-item">
          <strong>
            {quantity} × {itemName}
          </strong>
          <span>{p.allocated} replacement units allocated</span>
        </p>
      )}
      <nav className="as-tabs" aria-label="Case workflow sections">
        {['Contact', 'Replacement', 'Return', 'Refund', 'Resolve'].map((v) => (
          <button
            type="button"
            key={v}
            aria-pressed={tab === v}
            onClick={() => {
              setTab(v);
              setError('');
            }}
          >
            {v}
          </button>
        ))}
      </nav>
      {closed ? (
        <div className="as-complete">
          <CheckCircle2 size={22} />
          <h4>
            {p.status} · {w.outcome || 'Case resolved'}
          </h4>
          <p>Existing evidence and linked records remain available below.</p>
          {p.canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act('reopen', { reason });
              }}
            >
              <label>
                Reason for reopening
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="btn" disabled={busy}>
                Reopen case
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          {tab === 'Contact' && (
            <div className="as-section">
              <h4>Log a customer or supplier update</h4>
              <p>
                Record a call, email or agreed action after it happens. This
                does not send a message.
              </p>
              {p.canManage && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('contact', { audience, note, nextDate });
                  }}
                >
                  <div className="as-fields">
                    <label>
                      Contact with
                      <select
                        value={audience}
                        onChange={(e) =>
                          setAudience(e.target.value as typeof audience)
                        }
                      >
                        <option>Customer</option>
                        <option>Supplier</option>
                      </select>
                    </label>
                    <label>
                      Next promised update / chase
                      <input
                        type="date"
                        value={nextDate}
                        onChange={(e) => setNextDate(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    What was discussed or agreed?
                    <textarea
                      required
                      maxLength={2000}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    Log update
                  </button>
                </form>
              )}
            </div>
          )}
          {['Replacement', 'Return'].includes(tab) && (
            <div className="as-section">
              <h4>Item affected</h4>
              {!p.orderId ? (
                <p>
                  Link the original order using Edit case before recording a
                  replacement or return.
                </p>
              ) : p.canManage &&
                !w.purchaseOrderId &&
                !w.deliveryId &&
                !w.returns.length &&
                !p.allocated ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('configure', { productId: product, quantity });
                  }}
                >
                  <div className="as-fields">
                    <label>
                      Ordered product
                      <select
                        required
                        value={product}
                        onChange={(e) => setProduct(e.target.value)}
                      >
                        <option value="">Choose an order item</option>
                        {p.products.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Affected quantity
                      <input
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                      />
                    </label>
                  </div>
                  <button className="btn" disabled={busy}>
                    Save affected item
                  </button>
                </form>
              ) : (
                <p>
                  {itemName ?? 'Select an affected item'} · {w.quantity} units
                </p>
              )}
            </div>
          )}
          {tab === 'Replacement' && (
            <div className="as-section">
              <h4>Supply & redelivery</h4>
              {p.canStock &&
                p.replacementRequired &&
                ![
                  'Out for Delivery',
                  'Delivered',
                  'Completed',
                  'Failed',
                  'Cancelled',
                ].includes(p.delivery?.status ?? '') && (
                  <details>
                    <summary>Customer no longer wants the replacement</summary>
                    <p>
                      Confirm any external supplier or carrier cancellation
                      first. This releases allocated stock and cancels an unsent
                      purchase draft or an undispatched job. Dispatched goods
                      require a return.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act('stop-replacement', { reason: stopReason });
                      }}
                    >
                      <label>
                        Cancellation reason / agreed alternative
                        <textarea
                          aria-label="Replacement cancellation reason"
                          required
                          value={stopReason}
                          onChange={(e) => setStopReason(e.target.value)}
                        />
                      </label>
                      <button className="btn" disabled={busy}>
                        Stop replacement & release stock
                      </button>
                    </form>
                  </details>
                )}
              <p>
                Allocate warehouse stock first. Any shortage becomes a
                case-linked purchase draft. Receive supplier goods in Inventory,
                then prepare again to allocate them.
              </p>
              {p.canStock && w.productId && !w.deliveryId && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('prepare', {
                      unitCostPence: Math.round(Number(cost) * 100),
                    });
                  }}
                >
                  <label>
                    Agreed supplier cost per replacement (£)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                    />
                    <small>
                      Use £0 only when the supplier has agreed a free
                      replacement. Review the draft PO before sending.
                    </small>
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    <PackageCheck size={16} />
                    Allocate & draft shortage
                  </button>
                </form>
              )}
              {p.canManage && w.productId && !w.deliveryId && (
                <button
                  className="btn"
                  disabled={busy || p.allocated !== w.quantity}
                  onClick={() => act('delivery')}
                >
                  Create replacement delivery
                  <ArrowRight size={15} />
                </button>
              )}
              <small>
                Replacement delivery is separate from the original sale.
                Customer proof is required on the delivery job.
              </small>
            </div>
          )}
          {tab === 'Return' && (
            <div className="as-section">
              <h4>Receive returned goods</h4>
              <p>
                Record only goods physically received. Restock adds saleable
                stock; write-off records the return and damage without making it
                available to sell.
              </p>
              {p.canStock && w.productId ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('return', {
                      reservationId: reservation,
                      quantity: returnQty,
                      locationId: location,
                      disposition,
                      reason,
                    });
                  }}
                >
                  <label>
                    Delivered stock
                    <select
                      required
                      value={reservation}
                      onChange={(e) => setReservation(e.target.value)}
                    >
                      <option value="">Choose delivered units</option>
                      {p.returnable.map((r, i) => (
                        <option key={r.id} value={r.id}>
                          Dispatch {i + 1} · {r.quantity} units remaining
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="as-fields">
                    <label>
                      Quantity received
                      <input
                        required
                        type="number"
                        step={1}
                        min={1}
                        value={returnQty}
                        onChange={(e) => setReturnQty(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Receiving location
                      <select
                        required
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      >
                        <option value="">Choose location</option>
                        {p.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Inspection outcome
                    <select
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value)}
                    >
                      <option>Restock</option>
                      <option>Write off</option>
                    </select>
                  </label>
                  <label>
                    Condition and reason
                    <textarea
                      required
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !p.returnable.length}
                  >
                    <RotateCcw size={16} />
                    Record physical return
                  </button>
                </form>
              ) : (
                <p>
                  A manager or team lead records stock returns after selecting
                  the affected item.
                </p>
              )}
            </div>
          )}
          {tab === 'Refund' && (
            <div className="as-section">
              <h4>Refund / goodwill</h4>
              <p>
                Request the exact amount for another manager to approve.
                Accounts records the refund on the invoice, then links that
                payment evidence here.
              </p>
              {p.invoiceId && (
                <Link className="as-link" href={'/invoices/' + p.invoiceId}>
                  Open original invoice
                  <ArrowRight size={15} />
                </Link>
              )}
              {(!w.approvalId || p.approval?.status === 'Rejected') &&
                !w.refundId &&
                (p.canManage || p.canRefund) &&
                p.invoiceId && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void act('request-refund', {
                        amountPence: Math.round(Number(amount) * 100),
                        reason: refundReason,
                      });
                    }}
                  >
                    <label>
                      Refund amount (£)
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </label>
                    <label>
                      Refund reason
                      <textarea
                        aria-label="Refund reason"
                        required
                        value={refundReason}
                        onChange={(e) => setRefundReason(e.target.value)}
                      />
                    </label>
                    <button className="btn btn-primary" disabled={busy}>
                      Request refund approval
                    </button>
                  </form>
                )}
              {p.canRefund && !w.refundId && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('link-refund', { refundId: refund });
                  }}
                >
                  <label>
                    Recorded invoice refund
                    <select
                      required
                      value={refund}
                      onChange={(e) => setRefund(e.target.value)}
                    >
                      <option value="">Choose payment evidence</option>
                      {p.availableRefunds.map((r) => (
                        <option key={r.id} value={r.id}>
                          {money(r.amountPence)} · {r.reference}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="btn"
                    disabled={busy || !p.availableRefunds.length}
                  >
                    Link recorded refund
                  </button>
                </form>
              )}
            </div>
          )}
          {tab === 'Resolve' && (
            <div className="as-section">
              <h4>Resolve with evidence</h4>
              <p>
                Replacement deliveries, open purchases, required returns and
                requested refunds are checked before this case can be resolved.
              </p>
              {p.canManage && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act('resolve', {
                      outcome,
                      note: resolution,
                      customerConfirmed: confirmed,
                    });
                  }}
                >
                  <label>
                    Resolution outcome
                    <select
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                    >
                      {[
                        'Advice / no further action',
                        'Replacement delivered',
                        'Refund recorded',
                        'Returned goods',
                        'Combined remedy',
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Resolution details
                    <textarea
                      required
                      maxLength={2000}
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                    />
                  </label>
                  <label className="as-checkbox">
                    <input
                      required
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Customer confirmation of the resolution has been recorded.
                  </label>
                  <button className="btn btn-primary" disabled={busy}>
                    Resolve case
                  </button>
                </form>
              )}
            </div>
          )}
        </>
      )}
      <div className="as-linked">
        {p.purchase && (
          <Link href={'/purchasing?record=' + p.purchase.id}>
            <PackageCheck size={17} />
            <span>
              {p.purchase.number} · {p.purchase.status}
              <small>
                {p.purchase.expectedDate
                  ? 'Expected ' + p.purchase.expectedDate
                  : 'Set the supplier ETA on the purchase order'}
              </small>
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
        {p.delivery && (
          <Link href={'/deliveries?record=' + p.delivery.id}>
            <PackageCheck size={17} />
            <span>
              {p.delivery.number} · {p.delivery.status}
              <small>
                {p.delivery.proof
                  ? 'Customer proof recorded'
                  : 'Open to assign, book and capture proof'}
              </small>
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
        {p.approval && (
          <Link href={'/approvals?record=' + p.approval.id}>
            <span>
              {p.approval.number} · {p.approval.status}
              <small>{money(w.refundPence)} refund request</small>
            </span>
            <ArrowRight size={16} />
          </Link>
        )}
        {p.refund && (
          <p className="as-success">
            Refund recorded: {money(p.refund.amountPence)} ·{' '}
            {p.refund.reference}
          </p>
        )}
      </div>
      {w.returns.length > 0 && (
        <div className="as-history">
          <h4>Return receipts</h4>
          {w.returns.map((r) => (
            <p key={r.movementId}>
              {r.quantity} units · {r.disposition} ·{' '}
              {new Date(r.at).toLocaleDateString('en-GB')}
            </p>
          ))}
        </div>
      )}
      {w.contacts.length > 0 && (
        <div className="as-history">
          <h4>Customer & supplier history</h4>
          {[...w.contacts].reverse().map((c) => (
            <article key={c.id}>
              <span>
                {c.audience} · {c.by} ·{' '}
                {new Date(c.at).toLocaleDateString('en-GB')}
              </span>
              <p>{c.note}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function OrderAfterSales({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<
      { id: string; number: string; title: string; status: string }[] | null
    >(null),
    [error, setError] = useState('');
  useEffect(() => {
    apiRequest<typeof rows>(
      '/api/orders/' + encodeURIComponent(orderId) + '/service-cases',
    )
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [orderId]);
  return (
    <section className="after-sales">
      <h3>After-sales history</h3>
      <p>Claims and remedies remain linked to the original order.</p>
      <Link
        className="btn"
        href={'/service-cases?create=1&order=' + encodeURIComponent(orderId)}
      >
        Open a service case
        <ArrowRight size={15} />
      </Link>
      {error ? (
        <p role="alert">{error}</p>
      ) : !rows ? (
        <p>Loading cases…</p>
      ) : !rows.length ? (
        <p>No service cases recorded for this order.</p>
      ) : (
        <div className="as-linked">
          {rows.map((r) => (
            <Link key={r.id} href={'/service-cases?record=' + r.id}>
              <span>
                {r.number} · {r.status}
                <small>{r.title}</small>
              </span>
              <ArrowRight size={16} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
