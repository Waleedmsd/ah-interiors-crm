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
  id: string; number: string; status: string; version: number; supplierId: string;
  orderId: string | null; customerId: string | null; date: string; expectedDate: string | null;
  currency: string; accountReference: string; notes: string; totalPence: number;
  items: { productId: string; description: string; quantity: number; unitCostPence: number; customerId: string | null }[];
};
type Tracking = { id: string; number: string; status: string; version: number; purchaseOrderId: string; ownerId: string; supplierId: string; details: Record<string, string | boolean>; flags: Record<string, boolean> };
type Lookups = { customers: Lookup[]; orders: Lookup[]; suppliers: Lookup[]; products: Lookup[]; staff: Lookup[] };
const readable = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase());
const money = (pence: number, currency = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(pence / 100);
export function PurchasingWorkspace({ tracking = false }: { tracking?: boolean }) {
  const [rows, setRows] = useState<(Purchase | Tracking)[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ customers: [], orders: [], suppliers: [], products: [], staff: [] });
  const [view, setView] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Purchase | Tracking | null>(null);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const params = useSearchParams();
  const incoming = params.get('record');
  const handled = useRef('');
  const saving = useRef(false);
  const endpoint = tracking ? 'supplier-orders' : 'purchase-orders';
  const statuses = tracking ? supplierStatuses : purchaseStatuses;
  async function load() {
    setLoading(true);
    try {
      const [records, lookup, purchaseRows] = await Promise.all([
        apiRequest<(Purchase | Tracking)[]>('/api/' + endpoint),
        apiRequest<Lookups>('/api/lookups'),
        tracking ? apiRequest<Purchase[]>('/api/purchase-orders') : Promise.resolve([] as Purchase[]),
      ]);
      setRows(records); setLookups(lookup); setPurchases(purchaseRows);
      setSelected(previous => previous ? records.find(record => record.id === previous.id) ?? null : null);
      setError('');
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { setSelected(null); setForm(null); handled.current = ''; void load(); }, [tracking]);
  useEffect(() => {
    if (incoming && !loading && !error && handled.current !== incoming) {
      const row = rows.find(value => value.id === incoming);
      handled.current = incoming;
      if (row) { setSelected(row); if (tracking || row.status === 'Draft') edit(row); }
      else setError('Purchase record not found.');
    }
  }, [incoming, rows, loading, error]);
  function change(key: string, value: unknown) { setForm(previous => ({ ...previous, [key]: value })); }
  function blank() {
    setSelected(null); setError('');
    setForm(tracking ? {
      purchaseOrderId: '', ownerId: '', details: {
        supplierOrderNumber: '', confirmationNumber: '', orderedDate: '', confirmationDate: '', expectedArrival: '', collectionRequired: false,
        collectionCompany: '', collectionReference: '', collectionDate: '', lastContacted: '', nextChaseDate: '', deliveryBooked: false, notes: '',
      },
    } : {
      supplierId: '', orderId: '', customerId: '', date: new Date().toISOString().slice(0, 10), expectedDate: '', currency: 'GBP', accountReference: '', notes: '',
      items: [{ productId: '', description: '', quantity: 1, unitCostPence: 0, customerId: '' }],
    });
  }
  function edit(row: Purchase | Tracking) {
    setSelected(row); setError('');
    if (tracking) {
      const value = row as Tracking;
      setForm({ purchaseOrderId: value.purchaseOrderId, ownerId: value.ownerId, details: { ...value.details } });
    } else {
      const value = row as Purchase;
      setForm({ supplierId: value.supplierId, orderId: value.orderId ?? '', customerId: value.customerId ?? '', date: value.date, expectedDate: value.expectedDate ?? '', currency: value.currency, accountReference: value.accountReference, notes: value.notes,
        items: value.items.map(({ productId, description, quantity, unitCostPence, customerId }) => ({ productId, description, quantity, unitCostPence, customerId: customerId ?? '' })),
      });
    }
  }
  function select(key: string, label: string, values: Lookup[]) {
    return <label>{label}<select className="input" style={{ width: '100%' }} value={String(form?.[key] ?? '')} onChange={event => change(key, event.target.value)}><option value="">Choose…</option>{values.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>;
  }
  const visible = rows.filter(row => {
    const supplier = lookups.suppliers.find(value => value.id === row.supplierId)?.name ?? '';
    if (![row.number, supplier].join(' ').toLowerCase().includes(search.toLowerCase().trim())) return false;
    if (view === 'All' || view === row.status) return true;
    if (!tracking) return false;
    const value = row as Tracking;
    if (view === 'Incoming This Week') {
      const eta = Date.parse(String(value.details.expectedArrival));
      return eta >= Date.now() && eta <= Date.now() + 7 * 86400000;
    }
    return value.flags[view === 'Confirmation Overdue' ? 'confirmationOverdue' : view === 'ETA Overdue' ? 'etaOverdue' : 'chaseOverdue'];
  });
  return (
    <div className="page business-page">
      <PageIntro title={tracking ? 'Supplier tracking' : 'Purchase orders'} description={tracking ? 'Confirmations, expected arrivals, collections and chase dates.' : 'Supplier purchases linked to your existing customers and sales orders.'} action={<button className="btn btn-primary" disabled={loading} onClick={blank}>Create {tracking ? 'supplier order' : 'purchase order'}</button>} />
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}><Link className="btn" href={tracking ? '/purchasing' : '/supplier-tracking'}>{tracking ? 'Purchase orders' : 'Supplier tracking'}</Link><Link className="btn" href="/suppliers">Suppliers</Link></div>
      {error && <div role="alert" className="ops-error">{error} <button type="button" className="btn" disabled={loading} onClick={() => void load()}>Retry loading</button></div>}
      {loading && <p role="status">Loading {tracking ? 'supplier tracking' : 'purchase orders'}…</p>}
      <Panel>
        <div style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input className="input" aria-label="Search purchases" placeholder="Search reference or supplier" value={search} onChange={event => setSearch(event.target.value)} />
          <select className="input" aria-label="Purchasing view" value={view} onChange={event => setView(event.target.value)}>{['All', ...statuses, ...(tracking ? ['Confirmation Overdue', 'ETA Overdue', 'Chase Overdue', 'Incoming This Week'] : [])].map(value => <option key={value}>{value}</option>)}</select>
        </div>
        <div className="table-wrap" role="region" tabIndex={0} aria-label={tracking ? 'Supplier tracking records; scroll horizontally for actions' : 'Purchase orders; scroll horizontally for actions'} aria-busy={loading}>
          <table><thead><tr><th scope="col">Reference</th><th scope="col">Supplier</th><th scope="col">Status</th><th scope="col">{tracking ? 'Flags' : 'Total'}</th><th scope="col">Actions</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.id}>
              <td><button className="ops-record-link" onClick={() => setSelected(row)}>{row.number}</button></td>
              <td>{lookups.suppliers.find(value => value.id === row.supplierId)?.name ?? row.supplierId}</td>
              <td><StatusPill>{row.status}</StatusPill></td>
              <td>{tracking ? Object.entries((row as Tracking).flags).filter(([, value]) => value).map(([key]) => <StatusPill key={key} tone="red">{readable(key)}</StatusPill>) : money((row as Purchase).totalPence, (row as Purchase).currency)}</td>
              <td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(tracking || row.status === 'Draft') && <button className="btn" disabled={busy} onClick={() => edit(row)}>Edit</button>}
                <select className="input" aria-label={'Update ' + row.number} value={row.status} disabled={busy} onChange={async event => {
                  if (saving.current) return;
                  const status = event.target.value;
                  saving.current = true; setBusy(true);
                  try { await apiRequest('/api/' + endpoint + '/' + row.id, { method: 'PATCH', body: JSON.stringify({ version: row.version, status }) }); await load(); }
                  catch (failure) { setError((failure as Error).message); }
                  finally { saving.current = false; setBusy(false); }
                }}>{statuses.map(value => <option key={value}>{value}</option>)}</select>
                {!tracking && <Link className="btn" href={'/purchasing/' + row.id + '/print'}>Print / Save PDF</Link>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {!loading && !error && !visible.length && <p style={{ padding: 20 }}>{rows.length ? 'No records match this search and view.' : `No ${tracking ? 'supplier orders' : 'purchase orders'} yet.`}</p>}
      </Panel>
      {selected && <>
        <Panel title={selected.number} description={lookups.suppliers.find(value => value.id === selected.supplierId)?.name} action={<button type="button" className="btn" onClick={() => setSelected(null)}>Close details</button>}>
          <div style={{ padding: 20 }}><StatusPill>{selected.status}</StatusPill>
            {tracking ? <dl className="purchase-record-details">{Object.entries((selected as Tracking).details).map(([key, value]) => <div key={key}><dt>{readable(key)}</dt><dd>{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || 'Not recorded'}</dd></div>)}</dl> : <>
              <p>Ordered {(selected as Purchase).date} · Expected {(selected as Purchase).expectedDate || 'not confirmed'} · {money((selected as Purchase).totalPence, (selected as Purchase).currency)}</p>
              <p>{(selected as Purchase).notes || 'No purchase notes.'}</p>
              <div className="table-wrap" role="region" tabIndex={0} aria-label="Selected purchase line items"><table><thead><tr><th scope="col">Item</th><th scope="col">Quantity</th><th scope="col">Unit cost</th></tr></thead><tbody>{(selected as Purchase).items.map((item, index) => <tr key={index}><td>{item.description || lookups.products.find(value => value.id === item.productId)?.name || item.productId}</td><td>{item.quantity}</td><td>{money(item.unitCostPence, (selected as Purchase).currency)}</td></tr>)}</tbody></table></div>
            </>}
          </div>
        </Panel>
        <RecordAttachments entity={tracking ? 'supplier-order' : 'purchase-order'} entityId={selected.id} />
        <RecordActivity entity={tracking ? 'supplier-order' : 'purchase-order'} entityId={selected.id} />
      </>}
      {form && <BusinessFormPanel title={(selected ? 'Edit ' : 'Create ') + (tracking ? 'supplier order' : 'purchase order')} onClose={() => { if (!busy) setForm(null); }}>
        {error && <p role="alert" className="ops-error">{error}</p>}
        <form style={{ padding: 24 }} aria-busy={busy} onSubmit={async event => {
          event.preventDefault(); if (saving.current) return;
          saving.current = true; setBusy(true);
          try { await apiRequest('/api/' + endpoint + (selected ? '/' + selected.id : ''), { method: selected ? 'PUT' : 'POST', body: JSON.stringify({ ...form, ...(selected ? { version: selected.version } : {}) }) }); setForm(null); await load(); }
          catch (failure) { setError((failure as Error).message); }
          finally { saving.current = false; setBusy(false); }
        }}>
          <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}><legend className="sr-only">{tracking ? 'Supplier tracking details' : 'Purchase details'}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 16 }}>
              {tracking ? <>
                {select('purchaseOrderId', 'Purchase order', purchases.map(value => ({ id: value.id, name: value.number })))}
                {select('ownerId', 'Internal owner', lookups.staff)}
                {Object.entries(form.details as Record<string, string | boolean>).map(([key, value]) => <label key={key}>{readable(key)}{typeof value === 'boolean' ? <input type="checkbox" checked={value} onChange={event => change('details', { ...(form.details as object), [key]: event.target.checked })} /> : <input className="input" type={/Date$|Arrival$|Contacted$/.test(key) ? 'date' : 'text'} style={{ width: '100%' }} value={value} onChange={event => change('details', { ...(form.details as object), [key]: event.target.value })} />}</label>)}
              </> : <>
                {select('supplierId', 'Supplier', lookups.suppliers)}{select('orderId', 'Linked sales order', lookups.orders)}{select('customerId', 'Linked customer', lookups.customers)}
                {['date', 'expectedDate', 'currency', 'accountReference', 'notes'].map(key => <label key={key}>{readable(key)}<input className="input" style={{ width: '100%' }} type={/date/i.test(key) ? 'date' : 'text'} value={String(form[key] ?? '')} onChange={event => change(key, event.target.value)} /></label>)}
              </>}
            </div>
            {!tracking && <><h3>Purchase items</h3>{(form.items as Purchase['items']).map((item, index) => <div key={index} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <select className="input" aria-label={'Product ' + (index + 1)} value={item.productId} onChange={event => change('items', (form.items as Purchase['items']).map((value, itemIndex) => itemIndex === index ? { ...value, productId: event.target.value } : value))}><option value="">Choose product…</option>{lookups.products.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select>
              {(['description', 'quantity', 'unitCostPence'] as const).map(key => <label key={key}>{key === 'unitCostPence' ? 'Unit cost (£)' : readable(key)}<input className="input" type={key === 'description' ? 'text' : 'number'} step={key === 'unitCostPence' ? '0.01' : '0.001'} min={0} value={key === 'unitCostPence' ? item[key] / 100 : item[key]} onChange={event => change('items', (form.items as Purchase['items']).map((value, itemIndex) => itemIndex === index ? { ...value, [key]: key === 'description' ? event.target.value : key === 'unitCostPence' ? Math.round(Number(event.target.value) * 100) : Number(event.target.value) } : value))} /></label>)}
              <button type="button" className="btn" aria-label={'Remove purchase item ' + (index + 1)} onClick={() => change('items', (form.items as Purchase['items']).filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
            </div>)}<button type="button" className="btn" onClick={() => change('items', [...(form.items as Purchase['items']), { productId: '', description: '', quantity: 1, unitCostPence: 0, customerId: '' }])}>Add item</button></>}
          </fieldset>
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="btn" type="button" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      </BusinessFormPanel>}
    </div>
  );
}
