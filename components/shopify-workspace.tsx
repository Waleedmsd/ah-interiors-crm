'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShoppingBag,
  RefreshCw,
  Link2,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/components/auth-context';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { BusinessFormPanel } from '@/components/business-form-panel';
type Remote = {
  id: string;
  name: string;
  status: string;
  orderId: string | null;
  error: string | null;
  payment: string;
  email: string;
  address: {
    name: string;
    address1: string;
    address2: string;
    city: string;
    zip: string;
  } | null;
  total: { amount: string; currencyCode: string };
  issues: string[];
  lines: {
    id: string;
    name: string;
    sku: string;
    quantity: number;
    total: { amount: string; currencyCode: string };
    productId: string;
  }[];
};
type State = {
  shop: string;
  configured: boolean;
  apiVersion: string;
  state: { cursor?: string; lastSuccess?: string; error?: string } | null;
  canImport: boolean;
  products: { id: string; name: string; sku: string }[];
  orders: Remote[];
};
export function ShopifyWorkspace() {
  const { user } = useAuth();
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Remote | null>(null),
    [search, setSearch] = useState(''),
    [view, setView] = useState('Needs review'),
    [setup, setSetup] = useState(false),
    [shop, setShop] = useState(''),
    [token, setToken] = useState(''),
    [mappings, setMappings] = useState<
      { lineId: string; productId: string; route: string }[]
    >([]);
  async function load() {
    try {
      const value = await apiRequest<State>('/api/integrations/shopify');
      setData(value);
      setShop(value.shop);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const filtered =
    data?.orders.filter(
      (v) =>
        (view === 'All' || v.status === view) &&
        [v.name, v.email, v.address?.name]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <div className="page ops-page">
      <PageIntro
        title="Shopify"
        description="Bring store orders into the same customer, product and fulfilment workflows your team uses."
        action={
          <div style={{ display: 'flex', gap: 12 }}>
            {user?.role === 'Management' && (
              <button className="btn" onClick={() => setSetup(true)}>
                <Link2 size={16} />
                {data?.configured ? 'Connection settings' : 'Connect store'}
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={!data?.configured || busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  setData(
                    await apiRequest<State>('/api/integrations/shopify/sync', {
                      method: 'POST',
                    }),
                  );
                  setNotice(
                    'Shopify orders refreshed. Review matching before importing.',
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw size={16} />
              {busy
                ? 'Syncing…'
                : data?.state?.cursor
                  ? 'Continue sync'
                  : 'Sync orders'}
            </button>
          </div>
        }
      />
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <section className="shopify-connection">
        <div className="shopify-logo">
          <ShoppingBag size={30} />
        </div>
        <div>
          <h2>{data?.shop || 'Your Shopify store'}</h2>
          <p>
            {data?.state?.lastSuccess
              ? 'Last successful sync: ' +
                new Date(data.state.lastSuccess).toLocaleString('en-GB')
              : data?.configured
                ? 'Credentials saved. Run a sync to verify access.'
                : 'Add your store’s Admin API token to connect.'}
          </p>
        </div>
        <StatusPill
          tone={
            data?.state?.error
              ? 'red'
              : data?.state?.lastSuccess
                ? 'green'
                : 'gold'
          }
        >
          {data?.state?.error
            ? 'Sync needs attention'
            : data?.state?.lastSuccess
              ? 'Connected'
              : data?.configured
                ? 'Awaiting first sync'
                : 'Not connected'}
        </StatusPill>
      </section>
      {data?.state?.error && <p className="ops-error">{data.state.error}</p>}
      <div className="cost-summary">
        <span>
          Awaiting review
          <strong>
            {data?.orders.filter((v) => v.status === 'Needs review').length ??
              '—'}
          </strong>
        </span>
        <span>
          Imported orders
          <strong>
            {data?.orders.filter((v) => v.status === 'Imported').length ?? '—'}
          </strong>
        </span>
        <span>
          Changed in Shopify
          <strong>
            {data?.orders.filter((v) => v.status === 'Update needs review')
              .length ?? '—'}
          </strong>
        </span>
      </div>
      <Panel>
        <div className="record-toolbar">
          <input
            className="input"
            aria-label="Search Shopify orders"
            placeholder="Search order or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            aria-label="Shopify import status"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {['Needs review', 'Imported', 'Update needs review', 'All'].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
        </div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Shopify order</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Payment in Shopify</th>
                <th>Import status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.address?.name || row.email}</td>
                  <td>
                    {row.total.currencyCode} {row.total.amount}
                  </td>
                  <td>{row.payment.replaceAll('_', ' ')}</td>
                  <td>
                    <StatusPill>{row.status}</StatusPill>
                  </td>
                  <td>
                    <button
                      className="btn"
                      onClick={() => {
                        setSelected(row);
                        setMappings(
                          row.lines.map((l) => ({
                            lineId: l.id,
                            productId: l.productId,
                            route: 'AH showroom → BStar',
                          })),
                        );
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="ops-empty">
            <ShoppingBag size={34} />
            <h3>
              {data?.configured
                ? 'No orders in this view'
                : 'Connect your store to begin'}
            </h3>
            <p>
              Orders appear here after a successful sync. The first sync reads
              up to 59 days of accessible orders in pages.
            </p>
          </div>
        )}
      </Panel>
      <p className="integration-footnote">
        Imports create an order and draft invoice. Accounts must reconcile
        payments and VAT before fulfilment. Shopify changes to already imported
        orders are flagged for review. This connection currently reads orders;
        stock, refunds and fulfilment are not pushed to Shopify.
      </p>
      {setup && (
        <BusinessFormPanel
          title="Connect Shopify"
          onClose={() => {
            if (!busy) {
              setSetup(false);
              setToken('');
            }
          }}
        >
          <form
            className="integration-setup"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                await apiRequest('/api/integrations/shopify/configure', {
                  method: 'POST',
                  body: JSON.stringify({ shop, token }),
                });
                setToken('');
                setSetup(false);
                await load();
                setNotice(
                  'Credentials saved securely. Select Sync orders to test the connection.',
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Use a Shopify Admin API access token with{' '}
              <strong>read_orders</strong>, <strong>read_products</strong> and
              access to the customer fields required for delivery.
            </p>
            <label className="ops-field">
              <span>Store domain</span>
              <input
                className="input"
                required
                placeholder="your-store.myshopify.com"
                value={shop}
                onChange={(e) => setShop(e.target.value)}
              />
            </label>
            <label className="ops-field">
              <span>Admin API access token</span>
              <input
                className="input"
                required
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={500}
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <p>
              The token is encrypted on the server and is never returned to the
              browser.
            </p>
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save connection'}
            </button>
          </form>
        </BusinessFormPanel>
      )}
      {selected && (
        <BusinessFormPanel
          title={'Review ' + selected.name}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div className="integration-setup">
            <h3>{selected.address?.name}</h3>
            <p>
              {selected.email}
              <br />
              {[
                selected.address?.address1,
                selected.address?.address2,
                selected.address?.city,
                selected.address?.zip,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
            {selected.issues.map((issue) => (
              <p className="ops-error" key={issue}>
                <TriangleAlert size={14} /> {issue}
              </p>
            ))}
            {selected.orderId && (
              <p>
                <Link
                  className="btn btn-primary"
                  href={'/orders/' + encodeURIComponent(selected.orderId)}
                >
                  Open CRM order {selected.orderId}
                </Link>
              </p>
            )}
            {selected.lines.map((line, index) => (
              <section className="import-line" key={line.id}>
                <h4>{line.name}</h4>
                <p>
                  {line.sku || 'No SKU'} · Quantity {line.quantity} ·{' '}
                  {line.total.currencyCode} {line.total.amount}
                </p>
                <label className="ops-field">
                  <span>CRM product</span>
                  <select
                    className="input"
                    disabled={!!selected.orderId || !data?.canImport}
                    value={mappings[index]?.productId ?? ''}
                    onChange={(e) =>
                      setMappings((v) =>
                        v.map((m, i) =>
                          i === index ? { ...m, productId: e.target.value } : m,
                        ),
                      )
                    }
                  >
                    <option value="">Match an existing product…</option>
                    {data?.products.map((v) => (
                      <option value={v.id} key={v.id}>
                        {v.sku} · {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ops-field">
                  <span>Fulfilment route</span>
                  <select
                    className="input"
                    disabled={!!selected.orderId || !data?.canImport}
                    value={mappings[index]?.route}
                    onChange={(e) =>
                      setMappings((v) =>
                        v.map((m, i) =>
                          i === index ? { ...m, route: e.target.value } : m,
                        ),
                      )
                    }
                  >
                    {[
                      'AH showroom → BStar',
                      'Supplier → BStar',
                      'ProBuild',
                      'Flat Pack Pro',
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </section>
            ))}
            {error && (
              <p className="ops-error" role="alert">
                {error}
              </p>
            )}
            {!selected.orderId && data?.canImport && (
              <button
                className="btn btn-primary"
                disabled={
                  busy ||
                  !!selected.issues.length ||
                  mappings.some((v) => !v.productId)
                }
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    const result = await apiRequest<{ orderId: string }>(
                      '/api/integrations/shopify/orders/' + selected.id,
                      { method: 'POST', body: JSON.stringify({ mappings }) },
                    );
                    setSelected(null);
                    await load();
                    setNotice(
                      'Created CRM order ' +
                        result.orderId +
                        '. Payment reconciliation is required.',
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <CheckCircle2 size={16} />
                {busy ? 'Importing…' : 'Create CRM order'}
              </button>
            )}
            {!data?.canImport && (
              <p>A manager or team lead must approve the import.</p>
            )}
          </div>
        </BusinessFormPanel>
      )}
    </div>
  );
}
