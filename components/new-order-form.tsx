'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  ShieldCheck,
  PackagePlus,
} from 'lucide-react';
import { PageIntro } from '@/components/page-ui';
import { Button } from '@/components/ui/button';
import { CustomerPicker } from '@/components/customer-picker';
import { useWorkspace } from '@/components/workspace-provider';
import { parsePounds } from '@/lib/commerce';
import { money } from '@/lib/demo-data';
import { suppliers, routes, type Channel, type Route } from '@/lib/operations';
type FormLine = {
  id: number;
  name: string;
  supplier: string;
  article: string;
  quantity: string;
  price: string;
  options: string;
  route: Route;
};
const blankLine = (id: number): FormLine => ({
  id,
  name: '',
  supplier: '',
  article: '',
  quantity: '1',
  price: '',
  options: '',
  route: 'AH showroom → BStar',
});
export function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate, ready, notify } = useWorkspace();
  const [customerId, setCustomerId] = useState(params.get('customer') || '');
  const [channel, setChannel] = useState<Channel>('WhatsApp');
  const [sourceRef, setSourceRef] = useState('');
  const [lines, setLines] = useState<FormLine[]>([blankLine(1)]);
  const [delivery, setDelivery] = useState('0.00');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sequence = useRef(1);
  const request = useRef('');
  const subtotal = lines.reduce(
    (sum, line) =>
      sum + (parsePounds(line.price) || 0) * (Number(line.quantity) || 0),
    0,
  );
  const total = subtotal + (parsePounds(delivery) || 0);
  function update(id: number, values: Partial<FormLine>) {
    setLines((items) =>
      items.map((item) => (item.id === id ? { ...item, ...values } : item)),
    );
  }
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    request.current ||= crypto.randomUUID();
    const result = await mutate({
      type: 'create-order',
      input: {
        requestId: request.current,
        customerId,
        channel,
        sourceRef,
        lines: lines.map((line) => ({
          name: line.name,
          supplier: line.supplier,
          article: line.article,
          options: line.options,
          route: line.route,
          quantity: Number(line.quantity),
          unitPence: parsePounds(line.price),
        })),
        deliveryPence: parsePounds(delivery),
        note,
        now: Date.now(),
      },
    });
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    notify(
      'Order and invoice draft saved locally. Record payment before processing.',
    );
    router.push('/orders/' + result.id);
  }
  return (
    <div className="page commerce-page">
      <Link href="/orders" className="back-link">
        <ArrowLeft size={15} /> All orders
      </Link>
      <PageIntro
        eyebrow="SALES WORKSPACE"
        title="Create an order"
        description="A customer, their selection, and a clear path to fulfilment."
      />
      <form onSubmit={submit} className="commerce-layout">
        <div className="commerce-stack">
          <section className="section-card form-section">
            <div className="form-section-heading">
              <span className="step-dot">01</span>
              <div>
                <h2>Customer & source</h2>
                <p>Keep every order connected to the right customer.</p>
              </div>
            </div>
            <CustomerPicker value={customerId} onChange={setCustomerId} />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="order-channel">Sales channel</label>
                <select
                  id="order-channel"
                  className="commerce-input"
                  value={channel}
                  onChange={(event) =>
                    setChannel(event.target.value as Channel)
                  }
                >
                  {['WhatsApp', 'Shopify', 'Magento', 'Amazon', 'eBay'].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </div>
              <div className="field">
                <label htmlFor="source-reference">
                  Original order reference
                </label>
                <input
                  id="source-reference"
                  className="commerce-input"
                  required
                  placeholder="e.g. WA-1042"
                  value={sourceRef}
                  onChange={(event) => setSourceRef(event.target.value)}
                />
              </div>
            </div>
          </section>
          <section className="section-card form-section">
            <div className="form-section-heading">
              <span className="step-dot">02</span>
              <div>
                <h2>Products & fulfilment</h2>
                <p>Each supplier gets its own reviewed order pack.</p>
              </div>
            </div>
            {lines.map((line, index) => (
              <div className="order-form-line" key={line.id}>
                <div className="line-number-row">
                  <span>ITEM {String(index + 1).padStart(2, '0')}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="icon-btn"
                    disabled={lines.length === 1}
                    aria-label={'Remove item ' + (index + 1)}
                    onClick={() =>
                      setLines((items) =>
                        items.filter((item) => item.id !== line.id),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
                <div className="form-grid">
                  <div className="field span-2">
                    <label htmlFor={'product-' + line.id}>Product name</label>
                    <input
                      id={'product-' + line.id}
                      className="commerce-input"
                      placeholder="e.g. 3-door wardrobe"
                      required
                      value={line.name}
                      onChange={(event) =>
                        update(line.id, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={'supplier-' + line.id}>Supplier</label>
                    <input
                      id={'supplier-' + line.id}
                      list="supplier-suggestions"
                      className="commerce-input"
                      placeholder="Select or enter supplier"
                      required
                      value={line.supplier}
                      onChange={(event) =>
                        update(line.id, { supplier: event.target.value })
                      }
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={'article-' + line.id}>
                      Article code (if known)
                    </label>
                    <input
                      id={'article-' + line.id}
                      className="commerce-input"
                      value={line.article}
                      onChange={(event) =>
                        update(line.id, { article: event.target.value })
                      }
                      placeholder="Verified during catalogue review"
                    />
                  </div>
                  <div className="field span-2">
                    <label htmlFor={'options-' + line.id}>
                      Colour, size & accessories
                    </label>
                    <input
                      id={'options-' + line.id}
                      className="commerce-input"
                      value={line.options}
                      onChange={(event) =>
                        update(line.id, { options: event.target.value })
                      }
                      placeholder="Customer’s exact selection"
                    />
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={'quantity-' + line.id}>Quantity</label>
                      <input
                        id={'quantity-' + line.id}
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        required
                        className="commerce-input"
                        value={line.quantity}
                        onChange={(event) =>
                          update(line.id, { quantity: event.target.value })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={'price-' + line.id}>Unit price (£)</label>
                      <input
                        id={'price-' + line.id}
                        inputMode="decimal"
                        required
                        className="commerce-input"
                        value={line.price}
                        onChange={(event) =>
                          update(line.id, { price: event.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label htmlFor={'route-' + line.id}>Proposed route</label>
                    <select
                      id={'route-' + line.id}
                      className="commerce-input"
                      value={line.route}
                      onChange={(event) =>
                        update(line.id, { route: event.target.value as Route })
                      }
                    >
                      {routes.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
            <datalist id="supplier-suggestions">
              {suppliers.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </datalist>
            <Button
              type="button"
              variant="outline"
              className="btn"
              onClick={() =>
                setLines((items) => [...items, blankLine(++sequence.current)])
              }
            >
              <Plus size={16} /> Add another product
            </Button>
          </section>
          <section className="section-card form-section">
            <div className="form-section-heading">
              <span className="step-dot">03</span>
              <div>
                <h2>Finishing details</h2>
                <p>Charges and internal instructions for your team.</p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="delivery-fee">Delivery & services (£)</label>
              <input
                id="delivery-fee"
                className="commerce-input"
                inputMode="decimal"
                value={delivery}
                onChange={(event) => setDelivery(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="order-note">Internal note (optional)</label>
              <textarea
                id="order-note"
                className="commerce-input"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Access requirements, customer requests…"
              />
            </div>
          </section>
        </div>
        <aside className="commerce-stack">
          <section className="section-card form-section summary-card">
            <div className="summary-icon">
              <PackagePlus size={22} />
            </div>
            <h2>Order summary</h2>
            <p className="muted">A draft invoice is created automatically.</p>
            <dl className="totals-list">
              <div>
                <dt>Products · {lines.length}</dt>
                <dd>{money(subtotal / 100, 2)}</dd>
              </div>
              <div>
                <dt>Delivery & services</dt>
                <dd>{money((parsePounds(delivery) || 0) / 100, 2)}</dd>
              </div>
              <div className="total-row">
                <dt>Total payable</dt>
                <dd>{money(total / 100, 2)}</dd>
              </div>
            </dl>
            <div className="soft-notice">
              <ShieldCheck size={17} />
              <span>
                No supplier order is placed. Payment, catalogue matching and
                your approval come next.
              </span>
            </div>
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
              Create order & invoice <ArrowRight size={16} />
            </Button>
            <p className="form-footnote">
              Local workspace · no money collected
            </p>
          </section>
        </aside>
      </form>
    </div>
  );
}
