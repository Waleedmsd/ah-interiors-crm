'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RecordActivity } from '@/components/record-activity';
import { RecordAttachments } from '@/components/record-attachments';
import { apiRequest } from '@/lib/api-client';
import { BusinessFormPanel } from '@/components/business-form-panel';
import { PageIntro, Panel, StatusPill } from '@/components/page-ui';
import { purchaseStatuses, supplierStatuses } from '@/lib/supplier-workflow';
type Lookup = { id: string; name: string };
type Purchase = {
  id: string;
  number: string;
  status: string;
  version: number;
  supplierId: string;
  orderId: string | null;
  customerId: string | null;
  date: string;
  expectedDate: string | null;
  currency: string;
  accountReference: string;
  notes: string;
  totalPence: number;
  items: {
    productId: string;
    description: string;
    quantity: number;
    unitCostPence: number;
    customerId: string | null;
  }[];
};
type Tracking = {
  id: string;
  number: string;
  status: string;
  version: number;
  purchaseOrderId: string;
  ownerId: string;
  supplierId: string;
  details: Record<string, string | boolean>;
  flags: Record<string, boolean>;
};
type Lookups = {
  customers: Lookup[];
  orders: Lookup[];
  suppliers: Lookup[];
  products: Lookup[];
  staff: Lookup[];
};
export function PurchasingWorkspace({
  tracking = false,
}: {
  tracking?: boolean;
}) {
  const [rows, setRows] = useState<(Purchase | Tracking)[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [lookups, setLookups] = useState<Lookups>({
    customers: [],
    orders: [],
    suppliers: [],
    products: [],
    staff: [],
  });
  const [view, setView] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | Tracking | null>(null);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const params = useSearchParams();
  const incoming = params.get('record');
  const handled = useRef('');
  useEffect(() => {
    if (incoming && rows.length && handled.current !== incoming) {
      const row = rows.find((v) => v.id === incoming);
      handled.current = incoming;
      if (row) {
        setSelected(row);
        if (tracking || row.status === 'Draft') edit(row);
      } else setError('Purchase record not found.');
    }
  }, [incoming, rows]);
  const endpoint = tracking ? 'supplier-orders' : 'purchase-orders';
  const statuses = tracking ? supplierStatuses : purchaseStatuses;
  async function load() {
    try {
      const [records, lookup] = await Promise.all([
        apiRequest<(Purchase | Tracking)[]>('/api/' + endpoint),
        apiRequest<Lookups>('/api/lookups'),
      ]);
      setRows(records);
      setLookups(lookup);
      if (tracking)
        setPurchases(await apiRequest<Purchase[]>('/api/purchase-orders'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [tracking]);
  function change(key: string, value: unknown) {
    setForm((v) => ({ ...v, [key]: value }));
  }
  function blank() {
    setSelected(null);
    setForm(
      tracking
        ? {
            purchaseOrderId: '',
            ownerId: '',
            details: {
              supplierOrderNumber: '',
              confirmationNumber: '',
              orderedDate: '',
              confirmationDate: '',
              expectedArrival: '',
              collectionRequired: false,
              collectionCompany: '',
              collectionReference: '',
              collectionDate: '',
              lastContacted: '',
              nextChaseDate: '',
              deliveryBooked: false,
              notes: '',
            },
          }
        : {
            supplierId: '',
            orderId: '',
            customerId: '',
            date: new Date().toISOString().slice(0, 10),
            expectedDate: '',
            currency: 'GBP',
            accountReference: '',
            notes: '',
            items: [
              {
                productId: '',
                description: '',
                quantity: 1,
                unitCostPence: 0,
                customerId: '',
              },
            ],
          },
    );
  }
  function edit(row: Purchase | Tracking) {
    setSelected(row);
    if (tracking) {
      const v = row as Tracking;
      setForm({
        purchaseOrderId: v.purchaseOrderId,
        ownerId: v.ownerId,
        details: v.details,
      });
    } else {
      const v = row as Purchase;
      setForm({
        supplierId: v.supplierId,
        orderId: v.orderId ?? '',
        customerId: v.customerId ?? '',
        date: v.date,
        expectedDate: v.expectedDate ?? '',
        currency: v.currency,
        accountReference: v.accountReference,
        notes: v.notes,
        items: v.items.map(
          ({
            productId,
            description,
            quantity,
            unitCostPence,
            customerId,
          }) => ({
            productId,
            description,
            quantity,
            unitCostPence,
            customerId: customerId ?? '',
          }),
        ),
      });
    }
  }
  function select(key: string, label: string, values: Lookup[]) {
    return (
      <label>
        {label}
        <select
          className="input"
          style={{ width: '100%' }}
          value={String(form?.[key] ?? '')}
          onChange={(e) => change(key, e.target.value)}
        >
          <option value="">Choose…</option>
          {values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="page business-page">
      <PageIntro
        title={tracking ? 'Supplier tracking' : 'Purchase orders'}
        description={
          tracking
            ? 'Confirmations, expected arrivals, collections and chase dates.'
            : 'Supplier purchases linked to your existing customers and sales orders.'
        }
        action={
          <button className="btn btn-primary" onClick={blank}>
            Create {tracking ? 'supplier order' : 'purchase order'}
          </button>
        }
      />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link
          className="btn"
          href={tracking ? '/purchasing' : '/supplier-tracking'}
        >
          {tracking ? 'Purchase orders' : 'Supplier tracking'}
        </Link>
        <Link className="btn" href="/suppliers">
          Suppliers
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
      <Panel>
        <div
          style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}
        >
          <input
            className="input"
            aria-label="Search purchases"
            placeholder="Search reference or supplier"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input"
            aria-label="Purchasing view"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            {[
              'All',
              ...statuses,
              ...(tracking
                ? [
                    'Confirmation Overdue',
                    'ETA Overdue',
                    'Chase Overdue',
                    'Incoming This Week',
                  ]
                : []),
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Supplier</th>
                <th>Status</th>
                <th>{tracking ? 'Flags' : 'Total'}</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((row) => {
                  const supplier =
                    lookups.suppliers.find((v) => v.id === row.supplierId)
                      ?.name ?? '';
                  if (
                    ![row.number, supplier]
                      .join(' ')
                      .toLowerCase()
                      .includes(search.toLowerCase().trim())
                  )
                    return false;
                  if (view === 'All' || view === row.status) return true;
                  if (!tracking) return false;
                  const t = row as Tracking;
                  if (view === 'Incoming This Week') {
                    const eta = Date.parse(String(t.details.expectedArrival));
                    return (
                      eta >= Date.now() && eta <= Date.now() + 7 * 86400000
                    );
                  }
                  return t.flags[
                    view === 'Confirmation Overdue'
                      ? 'confirmationOverdue'
                      : view === 'ETA Overdue'
                        ? 'etaOverdue'
                        : 'chaseOverdue'
                  ];
                })
                .map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        className="ops-record-link"
                        onClick={() => setSelected(row)}
                      >
                        {row.number}
                      </button>
                    </td>
                    <td>
                      {
                        lookups.suppliers.find((v) => v.id === row.supplierId)
                          ?.name
                      }
                    </td>
                    <td>
                      <StatusPill>{row.status}</StatusPill>
                    </td>
                    <td>
                      {tracking
                        ? Object.entries((row as Tracking).flags)
                            .filter(([, v]) => v)
                            .map(([key]) => (
                              <StatusPill key={key} tone="red">
                                {key.replace(/([A-Z])/g, ' $1')}
                              </StatusPill>
                            ))
                        : '£' + ((row as Purchase).totalPence / 100).toFixed(2)}
                    </td>
                    <td>
                      <div
                        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                      >
                        {(tracking || row.status === 'Draft') && (
                          <button className="btn" onClick={() => edit(row)}>
                            Edit
                          </button>
                        )}
                        <select
                          className="input"
                          aria-label={'Update ' + row.number}
                          value={row.status}
                          onChange={async (e) => {
                            setBusy(true);
                            try {
                              await apiRequest(
                                '/api/' + endpoint + '/' + row.id,
                                {
                                  method: 'PATCH',
                                  body: JSON.stringify({
                                    version: row.version,
                                    status: e.target.value,
                                  }),
                                },
                              );
                              await load();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                          disabled={busy}
                        >
                          {statuses.map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                        {!tracking && (
                          <Link
                            className="btn"
                            href={'/purchasing/' + row.id + '/print'}
                          >
                            Print / Save PDF
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <p style={{ padding: 20 }}>
            No {tracking ? 'supplier orders' : 'purchase orders'} yet.
          </p>
        )}
      </Panel>
      {selected && (
        <>
          <RecordAttachments
            entity={tracking ? 'supplier-order' : 'purchase-order'}
            entityId={selected.id}
          />
          <RecordActivity
            entity={tracking ? 'supplier-order' : 'purchase-order'}
            entityId={selected.id}
          />
        </>
      )}{' '}
      {form && (
        <BusinessFormPanel
          title={
            (selected ? 'Edit ' : 'Create ') +
            (tracking ? 'supplier order' : 'purchase order')
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          {error && (
            <p role="alert" className="ops-error">
              {error}
            </p>
          )}
          <form
            style={{ padding: 24 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await apiRequest(
                  '/api/' + endpoint + (selected ? '/' + selected.id : ''),
                  {
                    method: selected ? 'PUT' : 'POST',
                    body: JSON.stringify({
                      ...form,
                      ...(selected ? { version: selected.version } : {}),
                    }),
                  },
                );
                setForm(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>
              {selected ? 'Edit' : 'Create'}{' '}
              {tracking ? 'supplier order' : 'purchase order'}
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
                gap: 16,
              }}
            >
              {tracking ? (
                <>
                  {select(
                    'purchaseOrderId',
                    'Purchase order',
                    purchases.map((v) => ({ id: v.id, name: v.number })),
                  )}
                  {select('ownerId', 'Internal owner', lookups.staff)}
                  {Object.entries(
                    form.details as Record<string, string | boolean>,
                  ).map(([key, value]) => (
                    <label key={key}>
                      {key.replace(/([A-Z])/g, ' $1')}
                      {typeof value === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={value}
                          onChange={(e) =>
                            change('details', {
                              ...(form.details as object),
                              [key]: e.target.checked,
                            })
                          }
                        />
                      ) : (
                        <input
                          className="input"
                          type={
                            /Date$|Arrival$|Contacted$/.test(key)
                              ? 'date'
                              : 'text'
                          }
                          style={{ width: '100%' }}
                          value={value}
                          onChange={(e) =>
                            change('details', {
                              ...(form.details as object),
                              [key]: e.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  ))}
                </>
              ) : (
                <>
                  {select('supplierId', 'Supplier', lookups.suppliers)}
                  {select('orderId', 'Linked sales order', lookups.orders)}
                  {select('customerId', 'Linked customer', lookups.customers)}
                  {[
                    'date',
                    'expectedDate',
                    'currency',
                    'accountReference',
                    'notes',
                  ].map((key) => (
                    <label key={key}>
                      {key.replace(/([A-Z])/g, ' $1')}
                      <input
                        className="input"
                        style={{ width: '100%' }}
                        type={/date/i.test(key) ? 'date' : 'text'}
                        value={String(form[key] ?? '')}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </label>
                  ))}
                </>
              )}
            </div>
            {!tracking && (
              <>
                <h3>Purchase items</h3>
                {(form.items as Purchase['items']).map((item, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                      marginBottom: 12,
                    }}
                  >
                    <select
                      className="input"
                      aria-label={'Product ' + (index + 1)}
                      value={item.productId}
                      onChange={(e) =>
                        change(
                          'items',
                          (form.items as Purchase['items']).map((v, i) =>
                            i === index
                              ? { ...v, productId: e.target.value }
                              : v,
                          ),
                        )
                      }
                    >
                      <option value="">Choose product…</option>
                      {lookups.products.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    {(
                      ['description', 'quantity', 'unitCostPence'] as const
                    ).map((key) => (
                      <label key={key}>
                        {key === 'unitCostPence' ? 'Unit cost (£)' : key}
                        <input
                          className="input"
                          type={key === 'description' ? 'text' : 'number'}
                          step={key === 'unitCostPence' ? '0.01' : '0.001'}
                          min={0}
                          value={
                            key === 'unitCostPence'
                              ? item[key] / 100
                              : item[key]
                          }
                          onChange={(e) =>
                            change(
                              'items',
                              (form.items as Purchase['items']).map((v, i) =>
                                i === index
                                  ? {
                                      ...v,
                                      [key]:
                                        key === 'description'
                                          ? e.target.value
                                          : key === 'unitCostPence'
                                            ? Math.round(
                                                Number(e.target.value) * 100,
                                              )
                                            : Number(e.target.value),
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        change(
                          'items',
                          (form.items as Purchase['items']).filter(
                            (_, i) => i !== index,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    change('items', [
                      ...(form.items as Purchase['items']),
                      {
                        productId: '',
                        description: '',
                        quantity: 1,
                        unitCostPence: 0,
                        customerId: '',
                      },
                    ])
                  }
                >
                  Add item
                </button>
              </>
            )}
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button className="btn btn-primary" disabled={busy}>
                Save
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </BusinessFormPanel>
      )}
    </div>
  );
}
