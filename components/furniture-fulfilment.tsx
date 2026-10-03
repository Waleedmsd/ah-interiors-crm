'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  PackageCheck,
  Truck,
  RefreshCw,
  Scissors,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { useWorkspace } from '@/components/workspace-provider';
import { StatusPill } from '@/components/page-ui';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import './furniture-fulfilment.css';
type Project = Awaited<
  ReturnType<typeof import('@/server/services/furniture').furnitureProject>
>;
export function FurnitureFulfilment({ orderId }: { orderId: string }) {
  const { reload } = useWorkspace();
  const [project, setProject] = useState<Project | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  const [split, setSplit] = useState(''),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [reason, setReason] = useState('');
  const load = async () => {
    setError('');
    try {
      setProject(
        await apiRequest<Project>(
          '/api/orders/' + encodeURIComponent(orderId) + '/fulfilment',
        ),
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [orderId]);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!project || busy) return;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const next = await apiRequest<Project>(
        '/api/orders/' + encodeURIComponent(orderId) + '/fulfilment',
        {
          method: 'POST',
          body: JSON.stringify({ action, token: project.token, ...extra }),
        },
      );
      setProject(next);
      setSplit('');
      setNotice(
        action === 'prepare'
          ? 'Stock allocated and shortage purchases reviewed. Open each draft PO before sending.'
          : action === 'split'
            ? 'Shipment split saved. Order and invoice totals are unchanged.'
            : 'Delivery job created. Open the job to assign a team and confirm the booking.',
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (!project)
    return (
      <section className="furniture-workflow">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Loading stock and fulfilment…'}
        </p>
        {error && (
          <button className="btn" onClick={load}>
            Try again
          </button>
        )}
      </section>
    );
  const delivered = project.groups.filter((g) => g.delivered).length;
  const ready = project.groups.filter((g) => g.ready && !g.delivered).length;
  const complete =
    project.groups.length > 0 &&
    project.groups.every(
      (g) => g.delivered && (!g.assemblyRequired || g.assemblyComplete),
    );
  const title = !project.paid
    ? 'Payment verification needed'
    : complete
      ? 'Physical fulfilment complete'
      : delivered
        ? 'Partially delivered'
        : ready
          ? 'Ready shipments available'
          : 'Prepare stock & supply';
  return (
    <div className="furniture-workflow">
      <header className="furniture-hero">
        <div>
          <span className="furniture-eyebrow">ORDER TO DELIVERY</span>
          <h2>{title}</h2>
          <p>
            {complete
              ? 'Review completion evidence and actual costs to close the commercial handoff.'
              : 'Allocate available stock, purchase the shortfall and manage each shipment through delivery and assembly.'}
          </p>
        </div>
        <button
          className="btn btn-small"
          aria-label="Refresh fulfilment"
          disabled={!!busy}
          onClick={load}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      {error && (
        <div className="furniture-alert" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <p className="furniture-notice" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </p>
      )}
      <ol className="furniture-stages" aria-label="Order progress">
        <li data-done={project.paid}>
          <span>01</span>
          <strong>Payment</strong>
          <small>{project.paid ? 'Verified' : 'Awaiting payment'}</small>
        </li>
        <li data-done={project.groups.every((g) => g.ready || g.delivered)}>
          <span>02</span>
          <strong>Stock & supply</strong>
          <small>{ready} ready to deliver</small>
        </li>
        <li data-done={delivered === project.groups.length}>
          <span>03</span>
          <strong>Delivery</strong>
          <small>
            {delivered} of {project.groups.length} shipments
          </small>
        </li>
        <li data-done={complete}>
          <span>04</span>
          <strong>Assembly & evidence</strong>
          <small>{complete ? 'Recorded' : 'Tracked per shipment'}</small>
        </li>
      </ol>
      <section className="furniture-action">
        <div>
          <h3>
            <PackageCheck size={18} />
            Stock preparation
          </h3>
          <p>
            Reserves available warehouse stock and creates draft purchase orders
            only for uncovered shortages. Run again after goods arrive.
          </p>
        </div>
        {!project.paid ? (
          <Link
            className="btn btn-primary"
            href={'/invoices/' + project.invoiceId}
          >
            Open invoice
            <ArrowRight size={16} />
          </Link>
        ) : project.canPrepare && !complete ? (
          <button
            className="btn btn-primary"
            disabled={!!busy}
            onClick={() => act('prepare')}
          >
            {busy === 'prepare' ? (
              <Loader2 size={16} className="ops-spinner" />
            ) : (
              <PackageCheck size={16} />
            )}
            Allocate stock & draft shortages
          </button>
        ) : (
          <span className="furniture-hint">
            {complete
              ? 'All shipments fulfilled'
              : 'A manager or team lead prepares stock.'}
          </span>
        )}
      </section>
      <div className="furniture-section-heading">
        <h3>
          Shipments <span>{project.groups.length}</span>
        </h3>
        <p>Each shipment has its own stock, delivery and sign-off.</p>
      </div>
      {project.groups.map((g, index) => {
        const deliveries = project.deliveries.filter(
          (j) => j.groupId === g.id && j.status !== 'Cancelled',
        );
        const assemblies = project.assemblies.filter(
          (j) => j.groupId === g.id && j.status !== 'Cancelled',
        );
        const canSplit =
          project.canManage &&
          !g.delivered &&
          !deliveries.length &&
          !assemblies.length &&
          g.materials.reduce((n, m) => n + m.quantity, 0) > 1;
        return (
          <section className="furniture-shipment" key={g.id}>
            <header>
              <div>
                <span className="furniture-eyebrow">
                  SHIPMENT {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{g.supplier}</h3>
                <p>{g.route}</p>
              </div>
              <StatusPill
                tone={g.delivered ? 'green' : g.ready ? 'blue' : 'gold'}
              >
                {g.delivered
                  ? 'Delivered'
                  : g.ready
                    ? 'Stock allocated'
                    : 'Awaiting stock'}
              </StatusPill>
            </header>
            <div
              className="furniture-table-wrap"
              role="region"
              aria-label={'Shipment ' + (index + 1) + ' stock quantities'}
              tabIndex={0}
            >
              <table>
                <caption className="sr-only">
                  Stock requirements for shipment {index + 1}
                </caption>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Ordered</th>
                    <th>Allocated</th>
                    <th>Delivered</th>
                    <th>Incoming</th>
                    <th>To purchase</th>
                  </tr>
                </thead>
                <tbody>
                  {g.materials.map((m, i) => (
                    <tr key={m.productId + '-' + i}>
                      <td>
                        <strong>{m.name}</strong>
                        <small>
                          {m.sku || 'No SKU'}
                          {!m.productId ? ' · Catalogue link required' : ''}
                        </small>
                      </td>
                      <td>{m.quantity}</td>
                      <td>{m.allocated}</td>
                      <td>{m.delivered}</td>
                      <td>{m.incoming}</td>
                      <td>
                        <span
                          className={m.shortage ? 'furniture-shortage' : ''}
                        >
                          {m.shortage || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="furniture-job-list">
              {deliveries.map((j) => (
                <Link key={j.id} href={'/deliveries?record=' + j.id}>
                  <Truck size={18} />
                  <span>
                    <strong>
                      {j.number} · {j.status}
                    </strong>
                    <small>
                      {j.date
                        ? j.date + ' · ' + j.slot
                        : 'Assign a driver and delivery window'}
                      {j.evidence ? ' · Proof recorded' : ''}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
              {assemblies.map((j) => (
                <Link key={j.id} href={'/assembly-jobs?record=' + j.id}>
                  <CheckCircle2 size={18} />
                  <span>
                    <strong>
                      {j.number} · {j.status}
                    </strong>
                    <small>
                      {j.evidence
                        ? 'Customer sign-off recorded'
                        : j.date
                          ? j.date + ' · ' + j.slot
                          : 'Assembly required · book an installer'}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
            <footer>
              <p>
                {g.delivered
                  ? g.assemblyRequired && !g.assemblyComplete
                    ? 'Next: complete assembly and capture customer sign-off.'
                    : 'Delivery evidence is stored on the linked job.'
                  : g.ready
                    ? 'Next: assign the delivery team and confirm the customer’s window.'
                    : 'Receive and allocate the outstanding stock before releasing this shipment.'}
              </p>
              <div>
                {canSplit && (
                  <button
                    className="btn btn-small"
                    disabled={!!busy}
                    onClick={() => {
                      setSplit(g.id);
                      setQuantities({});
                      setReason('');
                      setError('');
                    }}
                  >
                    <Scissors size={15} />
                    Split shipment
                  </button>
                )}
                {project.canManage && !g.delivered && !deliveries.length && (
                  <button
                    className="btn btn-small btn-primary"
                    disabled={!!busy || !g.ready || !project.paid}
                    onClick={() => act('delivery', { groupId: g.id })}
                  >
                    <Truck size={15} />
                    Create delivery job
                  </button>
                )}
              </div>
            </footer>
          </section>
        );
      })}
      <section className="furniture-supply">
        <h3>Linked purchasing</h3>
        {project.purchases.length ? (
          <div className="furniture-job-list">
            {project.purchases.map((p) => (
              <Link key={p.id} href={'/purchasing?record=' + p.id}>
                <PackageCheck size={18} />
                <span>
                  <strong>
                    {p.number} · {p.status}
                  </strong>
                  <small>
                    {p.expectedDate
                      ? 'Expected ' + p.expectedDate
                      : p.status === 'Draft'
                        ? 'Review quantities, cost and supplier before sending'
                        : 'Supplier date not recorded'}
                  </small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <p>
            No purchase orders linked yet. Stock preparation creates drafts for
            uncovered demand.
          </p>
        )}
        <Link href="/inventory" className="furniture-text-link">
          Open inventory & goods receipt <ArrowRight size={14} />
        </Link>
      </section>
      {project.canSeeCosts && (
        <section className="furniture-action">
          <div>
            <h3>Final profitability</h3>
            <p>
              {project.costsReviewed
                ? 'Costs marked reviewed. Check the cost sheet for product-cost verification and the contribution result.'
                : 'Profit remains provisional until actual delivery, assembly and other costs have been reviewed.'}
            </p>
          </div>
          <Link className="btn" href={'/orders/' + orderId + '?tab=payment'}>
            Review actual costs
            <ArrowRight size={15} />
          </Link>
        </section>
      )}
      <Dialog
        open={!!split}
        onOpenChange={(v) => {
          if (!busy && !v) setSplit('');
        }}
      >
        <DialogContent className="furniture-split-dialog">
          <DialogTitle>Split into a separate shipment</DialogTitle>
          <DialogDescription>
            Choose quantities to move. Existing allocations stay with the
            original shipment first. Prices and invoice totals stay the same.
            Split before creating delivery jobs.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act('split', {
                groupId: split,
                reason,
                lines: project.lines
                  .filter((l) => l.groupId === split)
                  .map((l) => ({ id: l.id, quantity: quantities[l.id] ?? 0 })),
              });
            }}
          >
            {project.lines
              .filter((l) => l.groupId === split)
              .map((l) => (
                <label className="furniture-split-line" key={l.id}>
                  <span>
                    {l.name}
                    <small>{l.quantity} ordered</small>
                  </span>
                  <input
                    aria-label={'Move quantity: ' + l.name}
                    type="number"
                    min={0}
                    max={l.quantity}
                    step={1}
                    value={quantities[l.id] ?? 0}
                    onChange={(e) =>
                      setQuantities((v) => ({
                        ...v,
                        [l.id]: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            <label className="furniture-reason">
              Reason / customer arrangement
              <textarea
                required
                minLength={5}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="For example: customer agreed to receive the wardrobe first."
              />
            </label>
            {error && (
              <p role="alert" className="furniture-alert">
                {error}
              </p>
            )}
            <p className="furniture-hint">
              Both shipments must retain at least one item. Existing draft
              message packs will need review again.
            </p>
            <button type="submit" className="btn btn-primary" disabled={!!busy}>
              {busy === 'split' ? 'Saving…' : 'Save split shipment'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
