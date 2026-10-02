'use client';
import { useState } from 'react';
import Link from 'next/link';
import { RecordAttachments } from '@/components/record-attachments';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CreditCard,
  FilePenLine,
  Mail,
  Printer,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { PageIntro } from '@/components/page-ui';
import { useWorkspace } from '@/components/workspace-provider';
import {
  customerForInvoice,
  invoiceTotals,
  invoiceStatus,
  parsePounds,
  type Invoice,
} from '@/lib/commerce';
import { InvoiceStatus, pounds } from '@/components/invoice-list';
import { InvoiceEditor } from '@/components/invoice-editor';
const momentLabel = (at: number) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(at);
export function InvoiceDetail({ id }: { id: string }) {
  const { commerce, invoices, ready, now: today } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice)
    return (
      <div className="page">
        <div className="empty-state">
          <h2>
            {ready
              ? 'Invoice not found on this browser'
              : 'Loading local invoice…'}
          </h2>
          <p>
            Locally saved invoices are available on the browser where you
            created them.
          </p>
          <Link href="/invoices" className="btn">
            Back to invoices
          </Link>
        </div>
      </div>
    );
  if (editing && invoice.lifecycle === 'Draft')
    return (
      <div className="page commerce-page"><RecordAttachments entity="invoice" entityId={invoice.id}/>
        <InvoiceEditor invoice={invoice} onDone={() => setEditing(false)} />
      </div>
    );
  const customer = customerForInvoice(commerce, invoice);
  const totals = invoiceTotals(invoice);
  return (
    <div className="page commerce-page invoice-detail-page"><RecordAttachments entity="invoice" entityId={invoice.id}/>
      <div className="no-print">
        <Link href="/invoices" className="back-link">
          <ArrowLeft size={15} /> All invoices
        </Link>
        <PageIntro
          eyebrow="CUSTOMER INVOICE"
          title={invoice.id}
          description={
            customer.name +
            ' · ' +
            (invoice.orderId
              ? 'Order #' + invoice.orderId
              : 'Standalone invoice')
          }
          action={
            <>
              <Button
                variant="outline"
                className="btn"
                onClick={() => window.print()}
              >
                <Printer size={16} /> Print / Save PDF
              </Button>
              {invoice.lifecycle === 'Draft' && (
                <Button
                  variant="outline"
                  className="btn"
                  onClick={() => setEditing(true)}
                >
                  <FilePenLine size={16} /> Edit draft
                </Button>
              )}
            </>
          }
        />
      </div>
      <div className="commerce-layout invoice-detail-layout">
        <div className="commerce-stack">
          <article className="invoice-paper">
            <div className="invoice-paper-top">
              <div className="invoice-brand">
                <span className="invoice-brand-mark">
                  AH<span>.</span>
                </span>
                <div>
                  <strong>AH Interiors</strong>
                  <span>Customer invoice</span>
                </div>
              </div>
              <div className="invoice-paper-id">
                <span className="micro-label">
                  {invoice.lifecycle === 'Draft'
                    ? 'DRAFT INVOICE'
                    : invoice.lifecycle === 'Void'
                      ? 'VOID INVOICE'
                      : 'INVOICE'}
                </span>
                <strong>{invoice.id}</strong>
                <InvoiceStatus invoice={invoice} now={today} />
              </div>
            </div>
            <div className="invoice-address-grid">
              <div>
                <span className="micro-label">BILL TO</span>
                <h3>{customer.name}</h3>
                <p>
                  {customer.address}
                  <br />
                  {customer.city}, {customer.postcode}
                  <br />
                  {customer.email}
                </p>
              </div>
              <dl>
                <div>
                  <dt>Invoice date</dt>
                  <dd>{invoice.issueDate}</dd>
                </div>
                <div>
                  <dt>Due date</dt>
                  <dd>{invoice.dueDate}</dd>
                </div>
                <div>
                  <dt>Customer account</dt>
                  <dd>{customer.id}</dd>
                </div>
                {invoice.orderId && (
                  <div>
                    <dt>Order reference</dt>
                    <dd>#{invoice.orderId}</dd>
                  </div>
                )}
              </dl>
            </div>
            <div className="table-scroll">
              <table className="invoice-paper-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="number-cell">Qty</th>
                    <th className="number-cell">Unit price</th>
                    <th className="number-cell">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{line.description}</td>
                      <td className="number-cell">{line.quantity}</td>
                      <td className="number-cell">{pounds(line.unitPence)}</td>
                      <td className="number-cell">
                        {pounds(line.quantity * line.unitPence)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="invoice-paper-bottom">
              <div className="invoice-notes">
                <span className="micro-label">NOTES</span>
                <p>{invoice.notes || 'Thank you for choosing AH Interiors.'}</p>
                {invoice.lifecycle === 'Draft' && (
                  <p className="danger-text">DRAFT · not yet issued</p>
                )}
                {invoice.lifecycle === 'Void' && (
                  <p className="danger-text">VOID · do not pay this invoice</p>
                )}
              </div>
              <dl className="totals-list">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{pounds(totals.subtotal)}</dd>
                </div>
                {totals.discount > 0 && (
                  <div>
                    <dt>Discount</dt>
                    <dd>−{pounds(totals.discount)}</dd>
                  </div>
                )}
                <div>
                  <dt>Tax ({invoice.taxBps / 100}%)</dt>
                  <dd>{pounds(totals.tax)}</dd>
                </div>
                <div className="total-row">
                  <dt>Total</dt>
                  <dd>{pounds(totals.total)}</dd>
                </div>
                <div>
                  <dt>Payments recorded</dt>
                  <dd>{pounds(totals.paid)}</dd>
                </div>
                <div className="balance-row">
                  <dt>
                    {invoice.lifecycle === 'Draft'
                      ? 'Draft amount'
                      : invoice.lifecycle === 'Void'
                        ? 'Voided amount'
                        : 'Balance due'}
                  </dt>
                  <dd>
                    {pounds(
                      invoice.lifecycle === 'Void'
                        ? totals.total
                        : totals.balance,
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <footer className="invoice-paper-footer">
              <span>AH Interiors · {customer.id}</span>
              <span>LOCAL PREVIEW · billing and tax details not verified</span>
            </footer>
          </article>
          <section className="section-card form-section no-print">
            <div className="section-title-row">
              <h2>Payment history</h2>
              <span className="micro-label">
                {invoice.payments.length} RECORDS
              </span>
            </div>
            {invoice.payments.length ? (
              <div className="payment-history">
                {invoice.payments.map((payment) => (
                  <div key={payment.id}>
                    <span className="payment-history-icon">
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>{payment.reference}</strong>
                      <span>
                        {payment.method} · {momentLabel(payment.at)}
                      </span>
                    </div>
                    <strong>{pounds(payment.amountPence)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="compact-empty">
                <CreditCard size={21} />
                <p>No payments recorded yet.</p>
              </div>
            )}
            <p className="form-footnote">
              Manual ledger records only. This does not charge or refund the
              customer.
            </p>
          </section>
        </div>
        <aside className="commerce-stack no-print">
          <InvoiceActions
            key={invoice.id}
            invoice={invoice}
            customerName={customer.name}
            customerEmail={customer.email}
          />
          <section className="section-card form-section">
            <h2>Connected records</h2>
            <Link
              className="connected-record"
              href={'/customers?customer=' + customer.id}
            >
              <span>
                <strong>{customer.name}</strong>
                <small>Customer account · {customer.id}</small>
              </span>
              <ArrowUpRight size={17} />
            </Link>
            {invoice.orderId && (
              <Link
                className="connected-record"
                href={'/orders/' + invoice.orderId}
              >
                <span>
                  <strong>Order #{invoice.orderId}</strong>
                  <small>Products, fulfilment & approval</small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
            )}
            <Link
              className="text-link"
              href={'/invoices/new?customer=' + customer.id}
            >
              Create another invoice <ArrowUpRight size={14} />
            </Link>
          </section>
          <section className="section-card form-section">
            <h2>Invoice activity</h2>
            <ol className="invoice-timeline">
              {[...invoice.history].reverse().map((event, index) => (
                <li key={index}>
                  <span />
                  <div>
                    <strong>{event.title}</strong>
                    <small>{momentLabel(event.at)}</small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
function InvoiceActions({
  invoice,
  customerName,
  customerEmail,
}: {
  invoice: Invoice;
  customerName: string;
  customerEmail: string;
}) {
  const { mutate, notify, ready, now } = useWorkspace();
  const totals = invoiceTotals(invoice);
  const status = invoiceStatus(invoice);
  const [mode, setMode] = useState<
    'issue' | 'payment' | 'email' | 'void' | null
  >(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [method, setMethod] = useState('Bank transfer');
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState({
    to: customerEmail,
    subject: '',
    body: '',
  });
  function open(value: NonNullable<typeof mode>) {
    setError('');
    setMode(value);
    if (value === 'payment') {
      setAmount((totals.balance / 100).toFixed(2));
      setReference('');
    }
    if (value === 'email')
      setEmail(
        invoice.emailDraft || {
          to: customerEmail,
          subject: 'AH Interiors · ' + invoice.id,
          body:
            'Hello ' +
            customerName +
            ',\n\nPlease find your invoice ' +
            invoice.id +
            ' from AH Interiors.\n\nInvoice total: ' +
            pounds(totals.total) +
            '\nPayments recorded: ' +
            pounds(totals.paid) +
            '\nBalance due: ' +
            pounds(totals.balance) +
            '\nDue date: ' +
            invoice.dueDate +
            '\n' +
            (invoice.orderId
              ? 'Order reference: #' + invoice.orderId + '\n'
              : '') +
            '\n' +
            invoice.lines
              .map(
                (line) =>
                  line.quantity +
                  ' × ' +
                  line.description +
                  ' — ' +
                  pounds(line.quantity * line.unitPence),
              )
              .join('\n') +
            '\n\nPlease contact us if you have any questions.\n\nKind regards,\nAH Interiors',
        },
      );
  }
  async function saveEmail() {
    const result = await mutate({
      type: 'invoice-email',
      id: invoice.id,
      ...email,
      now: Date.now(),
    });
    if (result.error) {
      setError(result.error);
      return false;
    }
    notify('Customer email draft saved locally. Not sent.');
    return true;
  }
  return (
    <>
      <section className="section-card form-section invoice-actions">
        <span className="micro-label">
          {invoice.lifecycle === 'Draft'
            ? 'DRAFT TOTAL'
            : invoice.lifecycle === 'Void'
              ? 'INVOICE VOIDED'
              : 'BALANCE DUE'}
        </span>
        <strong className="invoice-balance">
          {pounds(invoice.lifecycle === 'Void' ? 0 : totals.balance)}
        </strong>
        <InvoiceStatus invoice={invoice} now={now} />
        {invoice.lifecycle === 'Issued' && (
          <>
            <progress
              className="payment-progress"
              aria-label="Invoice payment progress"
              value={totals.paid}
              max={totals.total}
            />
            <p className="muted">
              {pounds(totals.paid)} of {pounds(totals.total)} recorded
            </p>
          </>
        )}
        {invoice.lifecycle === 'Draft' ? (
          <Button
            className="btn btn-primary full-width"
            disabled={!ready}
            onClick={() => open('issue')}
          >
            <ShieldCheck size={17} /> Review & issue
          </Button>
        ) : (
          invoice.lifecycle === 'Issued' && (
            <>
              <Button
                className="btn btn-primary full-width"
                disabled={!ready || status === 'Paid'}
                onClick={() => open('payment')}
              >
                <CreditCard size={17} />{' '}
                {status === 'Paid' ? 'Paid in full' : 'Record payment'}
              </Button>
              <Button
                variant="outline"
                className="btn full-width"
                onClick={() => open('email')}
              >
                <Mail size={17} /> Email customer
              </Button>
            </>
          )
        )}
        {invoice.lifecycle !== 'Void' && (
          <Button
            variant="ghost"
            className="btn full-width subtle-danger"
            disabled={invoice.payments.length > 0}
            onClick={() => open('void')}
          >
            <XCircle size={15} /> Void invoice
          </Button>
        )}
        {invoice.payments.length > 0 && (
          <p className="form-footnote">
            Paid invoices cannot be voided. Credit notes and refunds require a
            separate accounting workflow.
          </p>
        )}
        <div className="soft-notice">
          <ShieldCheck size={16} />
          <span>
            {invoice.emailDraft ? 'Email draft saved · not sent. ' : ''}Local
            preview. No email service or payment provider is connected.
          </span>
        </div>
      </section>
      <Dialog
        open={mode !== null}
        onOpenChange={(value) => {
          if (!value) setMode(null);
        }}
      >
        <DialogContent
          className={
            'commerce-dialog ' + (mode === 'email' ? 'email-dialog' : '')
          }
        >
          <DialogTitle>
            {mode === 'issue'
              ? 'Issue this invoice?'
              : mode === 'payment'
                ? 'Record a payment'
                : mode === 'void'
                  ? 'Void this invoice?'
                  : 'Email your customer'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'issue'
              ? 'Issuing locks the customer details and financial lines. This records the invoice locally; it does not send an email.'
              : mode === 'payment'
                ? 'Only record money you have already received and verified. This updates the invoice and its linked order.'
                : mode === 'void'
                  ? 'The invoice stays in the activity history, but its amount is no longer due.'
                  : 'Review the message, then open it in your email app. Automatic sending will be connected with the backend.'}
          </DialogDescription>
          {mode === 'issue' && (
            <div className="issue-summary">
              <strong>{invoice.id}</strong>
              <span>{customerName}</span>
              <strong>{pounds(totals.total)}</strong>
              <span>Due {invoice.dueDate}</span>
              <p>
                Local preview only. Verify your company details and tax
                treatment before using invoices commercially.
              </p>
            </div>
          )}
          {mode === 'payment' && (
            <>
              <div className="soft-notice">
                Remaining balance: <strong>{pounds(totals.balance)}</strong>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="payment-amount">Amount received (£)</label>
                  <input
                    id="payment-amount"
                    inputMode="decimal"
                    className="commerce-input"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="payment-method">Method</label>
                  <select
                    id="payment-method"
                    className="commerce-input"
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                  >
                    {[
                      'Bank transfer',
                      'Card',
                      'Cash',
                      'Marketplace payout',
                      'Other',
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div className="field span-2">
                  <label htmlFor="payment-reference">
                    Payment / bank reference
                  </label>
                  <input
                    id="payment-reference"
                    className="commerce-input"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="Unique reference from the received payment"
                  />
                </div>
              </div>
            </>
          )}
          {mode === 'void' && (
            <div className="field">
              <label htmlFor="void-reason">Reason for voiding</label>
              <textarea
                id="void-reason"
                rows={3}
                className="commerce-input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          )}
          {mode === 'email' && (
            <>
              <div className="field">
                <label htmlFor="email-to">To</label>
                <input
                  id="email-to"
                  type="email"
                  className="commerce-input"
                  value={email.to}
                  onChange={(event) =>
                    setEmail({ ...email, to: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="email-subject">Subject</label>
                <input
                  id="email-subject"
                  className="commerce-input"
                  value={email.subject}
                  onChange={(event) =>
                    setEmail({ ...email, subject: event.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="email-body">Message</label>
                <textarea
                  id="email-body"
                  rows={9}
                  className="commerce-input"
                  value={email.body}
                  onChange={(event) =>
                    setEmail({ ...email, body: event.target.value })
                  }
                />
              </div>
              <p className="soft-notice">
                Use “Print / Save PDF” first, then attach that PDF in your email
                app. Opening your email app does not send the message or attach
                a file automatically.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="action-row justify-end">
            <Button
              variant="outline"
              className="btn"
              onClick={() => setMode(null)}
            >
              Cancel
            </Button>
            {mode === 'email' ? (
              <>
                <Button variant="outline" className="btn" onClick={saveEmail}>
                  Save draft
                </Button>
                <Button
                  className="btn btn-primary"
                  onClick={async () => {
                    if (await saveEmail())
                      window.location.href =
                        'mailto:' +
                        encodeURIComponent(email.to) +
                        '?subject=' +
                        encodeURIComponent(email.subject) +
                        '&body=' +
                        encodeURIComponent(email.body);
                  }}
                >
                  <Send size={15} /> Open email app
                </Button>
              </>
            ) : (
              <Button
                className="btn btn-primary"
                disabled={!ready}
                onClick={async () => {
                  const result =
                    mode === 'issue'
                      ? await mutate({
                          type: 'issue-invoice',
                          id: invoice.id,
                          now: Date.now(),
                        })
                      : mode === 'void'
                        ? await mutate({
                            type: 'void-invoice',
                            id: invoice.id,
                            reason,
                            now: Date.now(),
                          })
                        : await mutate({
                            type: 'pay-invoice',
                            id: invoice.id,
                            payment: {
                              id: crypto.randomUUID(),
                              amountPence: parsePounds(amount),
                              reference,
                              method,
                              at: Date.now(),
                            },
                          });
                  if (result.error) {
                    setError(result.error);
                    return;
                  }
                  notify(
                    mode === 'payment'
                      ? 'Payment recorded locally. Linked order balance updated.'
                      : mode === 'issue'
                        ? 'Invoice issued locally. No email sent.'
                        : 'Invoice voided. History preserved.',
                  );
                  setMode(null);
                }}
              >
                {mode === 'issue'
                  ? 'Issue locally'
                  : mode === 'void'
                    ? 'Void invoice'
                    : 'Record verified payment'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
