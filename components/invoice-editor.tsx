'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageIntro } from '@/components/page-ui';
import { CustomerPicker } from '@/components/customer-picker';
import { useWorkspace } from '@/components/workspace-provider';
import {
  dateKey,
  invoiceTotals,
  nextInvoiceId,
  parsePounds,
  type Invoice,
} from '@/lib/commerce';
import { pounds } from '@/components/invoice-list';
export function InvoiceEditor({
  invoice,
  onDone,
}: {
  invoice?: Invoice;
  onDone?: () => void;
}) {
  const { commerce, mutate, ready, notify, now } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const [customerId, setCustomerId] = useState(
    invoice?.customerId || params.get('customer') || '',
  );
  const [issueDate, setIssueDate] = useState(
    () => invoice?.issueDate || dateKey(Date.now()),
  );
  const [dueDate, setDueDate] = useState(
    () => invoice?.dueDate || dateKey(Date.now() + 7 * 86400000),
  );
  const [lines, setLines] = useState(
    invoice?.lines.map((line) => ({
      id: line.id,
      description: line.description,
      quantity: String(line.quantity),
      price: (line.unitPence / 100).toFixed(2),
    })) || [{ id: 'line-1', description: '', quantity: '1', price: '' }],
  );
  const [discount, setDiscount] = useState(
    ((invoice?.discountPence || 0) / 100).toFixed(2),
  );
  const [tax, setTax] = useState(String((invoice?.taxBps || 0) / 100));
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(lines.length);
  const recordId = useRef('');
  const locked = Boolean(invoice?.orderId);
  const values = lines.map((line) => ({
    id: line.id,
    description: line.description,
    quantity: Number(line.quantity),
    unitPence: parsePounds(line.price),
  }));
  const totals = invoiceTotals({
    lines: values.map((line) => ({
      ...line,
      unitPence: Number.isFinite(line.unitPence) ? line.unitPence : 0,
    })),
    discountPence: parsePounds(discount) || 0,
    taxBps: parsePounds(tax) || 0,
    payments: [],
  });
  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    recordId.current ||= invoice?.id || nextInvoiceId(commerce);
    const input = {
      customerId,
      orderId: invoice?.orderId,
      issueDate,
      dueDate,
      lines: values,
      discountPence: parsePounds(discount),
      taxBps: parsePounds(tax),
      notes,
      now,
    };
    const result = mutate({
      type: invoice ? 'edit-invoice' : 'create-invoice',
      id: recordId.current,
      input,
    });
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    notify('Invoice draft saved. Nothing has been sent.');
    if (onDone) onDone();
    else router.push('/invoices/' + result.id);
  }
  return (
    <div className={invoice ? 'invoice-edit-view' : 'page commerce-page'}>
      {!invoice && (
        <Link className="back-link" href="/invoices">
          <ArrowLeft size={15} /> All invoices
        </Link>
      )}
      <PageIntro
        eyebrow="INVOICE STUDIO"
        title={invoice ? 'Edit draft' : 'Create an invoice'}
        description={
          invoice
            ? invoice.id + ' · review before issuing'
            : 'A considered invoice, connected to your customer.'
        }
      />
      <form className="commerce-layout" onSubmit={submit}>
        <div className="commerce-stack">
          <section className="section-card form-section">
            <div className="form-section-heading">
              <span className="step-dot">01</span>
              <div>
                <h2>Customer & dates</h2>
                <p>
                  {locked
                    ? 'Customer and amounts are linked to the original order.'
                    : 'Standalone invoices stay on the same customer account.'}
                </p>
              </div>
            </div>
            <CustomerPicker
              value={customerId}
              onChange={setCustomerId}
              disabled={Boolean(invoice)}
            />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="invoice-issued">Invoice date</label>
                <input
                  id="invoice-issued"
                  type="date"
                  required
                  className="commerce-input"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="invoice-due">Due date</label>
                <input
                  id="invoice-due"
                  type="date"
                  required
                  min={issueDate}
                  className="commerce-input"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>
          </section>
          <section className="section-card form-section">
            <div className="form-section-heading">
              <span className="step-dot">02</span>
              <div>
                <h2>Invoice items</h2>
                <p>
                  {locked
                    ? 'Amounts are fixed to keep the order and invoice in agreement.'
                    : 'All amounts are in GBP. Add products or services.'}
                </p>
              </div>
            </div>
            {lines.map((line, index) => (
              <div className="invoice-edit-line" key={line.id}>
                <div className="field">
                  <label htmlFor={'desc-' + line.id}>
                    Description {index + 1}
                  </label>
                  <input
                    id={'desc-' + line.id}
                    className="commerce-input"
                    required
                    disabled={locked}
                    value={line.description}
                    onChange={(event) =>
                      setLines((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="Product or service"
                  />
                </div>
                <div className="field">
                  <label htmlFor={'qty-' + line.id}>Qty</label>
                  <input
                    id={'qty-' + line.id}
                    className="commerce-input"
                    type="number"
                    min="1"
                    max="10000"
                    step="1"
                    required
                    disabled={locked}
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? { ...item, quantity: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={'unit-' + line.id}>Unit price (£)</label>
                  <input
                    id={'unit-' + line.id}
                    className="commerce-input"
                    inputMode="decimal"
                    required
                    disabled={locked}
                    value={line.price}
                    onChange={(event) =>
                      setLines((items) =>
                        items.map((item) =>
                          item.id === line.id
                            ? { ...item, price: event.target.value }
                            : item,
                        ),
                      )
                    }
                    placeholder="0.00"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="icon-btn"
                  aria-label={'Remove invoice item ' + (index + 1)}
                  disabled={locked || lines.length === 1}
                  onClick={() =>
                    setLines((items) =>
                      items.filter((item) => item.id !== line.id),
                    )
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
            {!locked && (
              <Button
                type="button"
                variant="outline"
                className="btn"
                onClick={() =>
                  setLines((items) => [
                    ...items,
                    {
                      id: 'extra-' + ++sequence.current,
                      description: '',
                      quantity: '1',
                      price: '',
                    },
                  ])
                }
              >
                <Plus size={16} /> Add item
              </Button>
            )}
            <div className="form-grid mt-5">
              <div className="field">
                <label htmlFor="invoice-discount">Discount (£)</label>
                <input
                  id="invoice-discount"
                  className="commerce-input"
                  inputMode="decimal"
                  disabled={locked}
                  value={discount}
                  onChange={(event) => setDiscount(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="invoice-tax">Tax rate (%) · preview</label>
                <input
                  id="invoice-tax"
                  className="commerce-input"
                  inputMode="decimal"
                  disabled={locked}
                  value={tax}
                  onChange={(event) => setTax(event.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="invoice-notes">Customer-visible notes</label>
              <textarea
                id="invoice-notes"
                className="commerce-input"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Payment instructions or a personal note…"
              />
            </div>
          </section>
        </div>
        <aside>
          <section className="section-card form-section summary-card">
            <div className="summary-icon">
              <FileText size={22} />
            </div>
            <h2>{invoice?.id || 'Invoice summary'}</h2>
            <p className="muted">Draft first. Review before you issue.</p>
            <dl className="totals-list">
              <div>
                <dt>Subtotal</dt>
                <dd>{pounds(totals.subtotal)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>−{pounds(totals.discount)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{pounds(totals.tax)}</dd>
              </div>
              <div className="total-row">
                <dt>Invoice total</dt>
                <dd>{pounds(totals.total)}</dd>
              </div>
            </dl>
            <p className="soft-notice">
              Tax settings and company billing details are not verified. This is
              a local preview, not a production tax invoice.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="btn btn-primary full-width"
              disabled={!ready || busy}
            >
              Save invoice draft
            </Button>
            {onDone && (
              <Button
                type="button"
                className="btn full-width mt-2"
                variant="outline"
                onClick={onDone}
              >
                Cancel edit
              </Button>
            )}
          </section>
        </aside>
      </form>
    </div>
  );
}
