'use client';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { Plus } from 'lucide-react';
import { BusinessFormPanel } from '@/components/business-form-panel';
import { PageIntro, Panel, Stat, StatusPill } from '@/components/page-ui';
import { useAuth } from '@/components/auth-context';
import { hasPermission } from '@/server/permissions';

type Item = { id: string; name: string; details?: { stockUnit?: string }; groups?: { id: string; name: string }[] };
type Reservation = { id: string; productId: string; locationId: string; orderId: string; quantity: number; status: string };
type Stock = {
  locations: (Item & { type: string })[];
  balances: { id: string; productId: string; locationId: string; physical: number; available: number; reserved: number; display: number }[];
  reservations: Reservation[];
  incoming: { productId: string; purchaseOrderId: string; quantity: number }[];
  movements: { id: string; type: string; quantity: number; productId: string; locationId: string; reason: string; createdAt: string }[];
};
const types = ['Goods Received', 'Transfer', 'Reservation', 'Unreservation', 'Customer Delivery', 'Return', 'Adjustment', 'Damage', 'Display Stock'];
export function InventoryWorkspace() {
  const [movementOpen, setMovementOpen] = useState(false);
  const { user } = useAuth();
  const [stock, setStock] = useState<Stock | null>(null);
  const [products, setProducts] = useState<Item[]>([]);
  const [orders, setOrders] = useState<Item[]>([]);
  const [purchases, setPurchases] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ type: 'Goods Received', productId: '', locationId: '', targetLocationId: '', orderId: '', purchaseOrderId: '', reservationId: '', groupId: '', quantity: 1, reason: '' });
  const requestId = useRef('');
  const saving = useRef(false);
  async function load() {
    setLoading(true);
    try {
      const [s, p, o, po] = await Promise.all([
        apiRequest<Stock>('/api/inventory'), apiRequest<Item[]>('/api/products'),
        apiRequest<Item[]>('/api/inventory/orders'), apiRequest<Item[]>('/api/inventory/purchases'),
      ]);
      setStock(s); setProducts(p); setOrders(o); setPurchases(po); setError('');
    } catch (failure) { setError((failure as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function select(key: 'productId' | 'locationId' | 'targetLocationId' | 'orderId' | 'purchaseOrderId' | 'groupId', label: string, items: Item[]) {
    return <label>{label}<select className="input" style={{ width: '100%' }} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })}><option value="">Choose…</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  }
  const visible = stock?.balances.filter(balance => [products.find(product => product.id === balance.productId)?.name, stock.locations.find(location => location.id === balance.locationId)?.name].join(' ').toLowerCase().includes(filter.toLowerCase().trim())) ?? [];
  return (
    <div className="page business-page">
      <PageIntro eyebrow="AH INTERIORS / SUPPLY CHAIN" title="Inventory & stock" description="Know what is available, where it belongs and what is on its way."
        action={<button className="btn btn-primary ops-primary" disabled={!stock || loading} onClick={() => { setError(''); setMovementOpen(true); }}><Plus size={16} aria-hidden="true" />Record movement</button>} />
      {error && <div role="alert" className="ops-error">{error} <button type="button" className="btn" disabled={loading} onClick={() => void load()}>Retry loading</button></div>}
      {loading && <p role="status">Loading inventory…</p>}
      <div className="metric-grid" aria-busy={loading}>
        <Stat label="Stocked products" value={stock ? String(new Set(stock.balances.map(value => value.productId)).size) : '—'} note="Across your stock locations" />
        <Stat label="Physical locations" value={stock ? String(stock.locations.filter(value => value.type === 'Physical').length) : '—'} note="Places that hold stock" />
        <Stat label="Active reservations" value={stock ? String(stock.reservations.filter(value => value.status === 'Active').length) : '—'} note="Allocated to customer orders" />
        <Stat label="Incoming purchases" value={stock ? String(new Set(stock.incoming.map(value => value.purchaseOrderId)).size) : '—'} note="Purchase orders awaiting goods" />
      </div>
      <Panel title="Stock by product and location">
        <input className="input" aria-label="Filter stock" placeholder="Search product or location" value={filter} onChange={event => setFilter(event.target.value)} style={{ margin: 20 }} />
        <div className="table-wrap" role="region" aria-label="Stock by product and location; scroll horizontally for all quantities" tabIndex={0}>
          <table><thead><tr>{['Product', 'Location', 'Unit', 'Physical', 'Available', 'Reserved', 'Display'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
            <tbody>{visible.map(value => <tr key={value.id}><td>{products.find(product => product.id === value.productId)?.name ?? value.productId}</td><td>{stock?.locations.find(location => location.id === value.locationId)?.name ?? value.locationId}</td><td>{products.find(product => product.id === value.productId)?.details?.stockUnit ?? 'Each'}</td><td>{value.physical}</td><td>{value.available}</td><td>{value.reserved}</td><td>{value.display}</td></tr>)}</tbody>
          </table>
        </div>
        {!loading && stock && !visible.length && <p style={{ padding: 20 }}>{filter.trim() ? 'No stock matches this search.' : 'No stock balances have been recorded yet.'}</p>}
      </Panel>
      {movementOpen && <BusinessFormPanel title="Record stock movement" description="Receive goods, allocate stock or record a transfer. Every movement keeps a complete audit trail." onClose={() => { if (!busy) setMovementOpen(false); }}>
        {error && <p role="alert" className="ops-error">{error}</p>}
        <form style={{ padding: 24 }} aria-busy={busy} onSubmit={async event => {
          event.preventDefault();
          if (saving.current) return;
          saving.current = true; setBusy(true);
          requestId.current ||= crypto.randomUUID();
          const payload = Object.fromEntries(Object.entries({ ...form, requestId: requestId.current }).filter(([, value]) => value !== ''));
          try {
            await apiRequest('/api/inventory/movements', { method: 'POST', body: JSON.stringify(payload) });
            requestId.current = ''; setForm({ ...form, reason: '' }); setMovementOpen(false); await load();
          } catch (failure) { setError((failure as Error).message); }
          finally { saving.current = false; setBusy(false); }
        }}>
          <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="sr-only">Stock movement details</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
              <label>Movement type<select className="input" style={{ width: '100%' }} value={form.type} onChange={event => setForm({ ...form, type: event.target.value, purchaseOrderId: '', reservationId: '', targetLocationId: '', orderId: '', groupId: '' })}>{types.filter(value => value !== 'Adjustment' || (user && hasPermission(user, 'approvals.write'))).map(value => <option key={value}>{value}</option>)}</select></label>
              {select('productId', 'Product', products)}
              {select('locationId', 'Location', stock?.locations.filter(value => value.type === 'Physical') ?? [])}
              {form.type === 'Transfer' && select('targetLocationId', 'Destination', stock?.locations.filter(value => value.type === 'Physical') ?? [])}
              {['Reservation', 'Unreservation', 'Customer Delivery', 'Return'].includes(form.type) && select('orderId', 'Sales order', orders)}
              {form.type === 'Reservation' && select('groupId', 'Fulfilment group', orders.find(value => value.id === form.orderId)?.groups ?? [])}
              {form.type === 'Goods Received' && select('purchaseOrderId', 'Confirmed purchase order', purchases)}
              {['Unreservation', 'Customer Delivery', 'Return'].includes(form.type) && <label>Reservation<select className="input" value={form.reservationId} onChange={event => {
                const reservation = stock?.reservations.find(value => value.id === event.target.value);
                if (reservation) setForm({ ...form, reservationId: reservation.id, orderId: reservation.orderId, productId: reservation.productId, locationId: reservation.locationId, quantity: reservation.quantity });
              }}><option value="">Choose…</option>{stock?.reservations.filter(value => value.status === (form.type === 'Return' ? 'Delivered' : 'Active')).map(value => <option key={value.id} value={value.id}>#{value.orderId} · {products.find(product => product.id === value.productId)?.name} · {value.quantity}</option>)}</select></label>}
              <label>Quantity<input className="input" type="number" step={['m²', 'Metre'].includes(products.find(value => value.id === form.productId)?.details?.stockUnit ?? 'Each') ? 0.001 : 1} min={['Adjustment', 'Display Stock'].includes(form.type) ? -10000 : 0.001} required value={form.quantity} onChange={event => setForm({ ...form, quantity: Number(event.target.value) })} /></label>
              <label>Reason / receiving reference<input className="input" required value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
            </div>
          </fieldset>
          <div className="business-save-bar"><button type="button" className="btn" disabled={busy} onClick={() => setMovementOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Record movement'}</button></div>
        </form>
      </BusinessFormPanel>}
      <Panel title="Movement history">
        <div className="table-wrap" role="region" aria-label="Stock movement history; scroll horizontally for all details" tabIndex={0}>
          <table><thead><tr>{['Date', 'Movement', 'Product', 'Quantity', 'Reason'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{stock?.movements.map(value => <tr key={value.id}><td>{new Date(value.createdAt).toLocaleString()}</td><td><StatusPill>{value.type}</StatusPill></td><td>{products.find(product => product.id === value.productId)?.name ?? value.productId}</td><td>{value.quantity}</td><td>{value.reason}</td></tr>)}</tbody></table>
        </div>
        {!loading && stock && !stock.movements.length && <p style={{ padding: 20 }}>No stock movements have been recorded yet.</p>}
      </Panel>
      {user && hasPermission(user, 'settings.write') && <Panel title="Add stock location"><form style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }} onSubmit={async event => {
        event.preventDefault();
        if (saving.current) return;
        saving.current = true; setBusy(true);
        const element = event.currentTarget;
        const data = new FormData(element);
        try { await apiRequest('/api/inventory/locations', { method: 'POST', body: JSON.stringify(Object.fromEntries(data)) }); element.reset(); await load(); }
        catch (failure) { setError((failure as Error).message); }
        finally { saving.current = false; setBusy(false); }
      }}><input name="name" className="input" aria-label="Location name" required placeholder="Location name" /><select name="type" className="input" aria-label="Location type">{['Physical', 'Incoming', 'In Transit', 'Reserved'].map(value => <option key={value}>{value}</option>)}</select><button className="btn" disabled={busy}>Add location</button></form></Panel>}
    </div>
  );
}
