'use client';
import { useEffect, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CalendarDays,
  ClipboardCheck,
  Package,
  Phone,
  MapPin,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { RecordAttachments } from '@/components/record-attachments';
import { StatusPill } from '@/components/page-ui';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { flooringTotal, type FlooringQuote } from '@/lib/flooring-workflow';
import { useAuth } from '@/components/auth-context';
import { useSearchParams } from 'next/navigation';
import './flooring-fulfilment.css';
type Project = NonNullable<
  Awaited<
    ReturnType<typeof import('@/server/services/flooring').flooringProject>
  >
>;
const gbp = (p: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    p / 100,
  );
const date = (d: string) =>
  d
    ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'Not booked';
export function FlooringJourney({
  lead,
  onChange,
}: {
  lead: {
    id: string;
    version: number;
    status: string;
    orderId: string | null;
    details: Record<string, unknown>;
  };
  onChange: () => Promise<void>;
}) {
  const [project, setProject] = useState<Project | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [accept, setAccept] = useState(false),
    [evidence, setEvidence] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setProject(
      await apiRequest<Project | null>(
        '/api/flooring/' + lead.id + '/fulfilment',
      ),
    );
  };
  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [lead.id, lead.version]);
  const quote = lead.details.quote as FlooringQuote;
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest('/api/flooring/' + lead.id + '/accept', {
        method: 'POST',
        body: JSON.stringify({ version: lead.version, evidence }),
      });
      setAccept(false);
      await load();
      await onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="floor-loading">
        <Loader2 className="ops-spinner" size={18} /> Loading connected
        workflow…
      </div>
    );
  return (
    <>
      <section className="floor-journey">
        <div className="floor-eyebrow">CONNECTED WORKFLOW</div>
        <h3>
          {project
            ? 'Accepted quote → materials → fitting'
            : 'Turn this quote into a booked job'}
        </h3>
        {error && (
          <p role="alert" className="ops-error">
            {error}
          </p>
        )}
        {project ? (
          <>
            <p>
              The accepted quote is locked. Continue with its linked order,
              materials and fitting record.
            </p>
            <div className="floor-inline-links">
              <Link className="btn" href={'/orders/' + project.orderId}>
                Sales order <ExternalLink size={14} />
              </Link>
              <Link
                className="btn btn-primary"
                href={'/flooring/fitting?record=' + lead.id}
              >
                Materials & fitting <ArrowRight size={15} />
              </Link>
            </div>
            <div className="floor-checklist">
              <span>
                <CheckCircle2 size={16} /> Quote accepted
              </span>
              <span>
                <Package size={16} />
                {project.ready ? 'Materials allocated' : 'Materials to prepare'}
              </span>
              <span>
                <CalendarDays size={16} />
                {date(project.scheduledDate)}
              </span>
            </div>
          </>
        ) : (
          <>
            <p>
              Acceptance freezes the agreed prices and creates one sales order,
              an invoice draft, material requirements and a fitting record.
            </p>
            <ol className="floor-mini-steps">
              <li>Review quote</li>
              <li>Prepare materials</li>
              <li>Book & complete fitting</li>
            </ol>
            {['Quote', 'Follow-up', 'Won'].includes(lead.status) ? (
              <button
                className="btn btn-primary"
                onClick={() => setAccept(true)}
              >
                Accept quote · {gbp(flooringTotal(quote))}
                <ArrowRight size={15} />
              </button>
            ) : (
              <small>
                Complete the measure and move the lead to Quote to accept it.
              </small>
            )}
          </>
        )}
      </section>
      <Dialog
        open={accept}
        onOpenChange={(v) => {
          if (!busy) setAccept(v);
        }}
      >
        <DialogContent className="ops-status-dialog">
          <DialogTitle>Accept this flooring quote</DialogTitle>
          <DialogDescription>
            Confirm the customer's agreement. This locks the quote and creates
            its linked order. No supplier order is sent and no payment is
            recorded.
          </DialogDescription>
          <form onSubmit={submit}>
            <div className="floor-accept-total">
              <span>Customer total</span>
              <strong>{gbp(flooringTotal(quote))}</strong>
            </div>
            <label className="ops-field">
              <span>Acceptance evidence / manager approval reason</span>
              <textarea
                aria-label="Acceptance evidence"
                className="input"
                required
                rows={4}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="Customer agreed by phone on… / signed quote reference…"
              />
            </label>
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <div className="ops-dialog-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setAccept(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Creating order…' : 'Accept & create order'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function FittingDetail({
  project,
  onChange,
}: {
  project: Project;
  onChange: (v: Project) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [booking, setBooking] = useState(false),
    [action, setAction] = useState<'start' | 'complete' | 'issue' | null>(null),
    [evidence, setEvidence] = useState('');
  const [schedule, setSchedule] = useState({
    fitterId: project.fitterId ?? '',
    scheduledDate: project.scheduledDate,
    timeSlot: project.timeSlot || 'AM',
    customerConfirmed: project.customerConfirmed,
    notes: project.notes,
  });
  const { user } = useAuth();
  const fieldUser = user?.role === 'Installer';
  async function run(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const next = await apiRequest<Project>(
        '/api/flooring/' + project.leadId + '/fulfilment',
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, version: project.version }),
        },
      );
      onChange(next);
      setBooking(false);
      setAction(null);
      setEvidence('');
      setNotice(
        payload.action === 'prepare'
          ? 'Available stock allocated. Any shortages have draft purchase orders ready for review.'
          : 'Fitting record updated.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="floor-job">
      <header className="floor-job-header">
        <div>
          <div className="floor-eyebrow">FITTING JOB · {project.orderId}</div>
          <h2>{project.customerName}</h2>
          <p>
            {project.address} · {project.postcode}
          </p>
        </div>
        <StatusPill>{project.status}</StatusPill>
      </header>
      <div className="floor-job-body">
        {error && (
          <p role="alert" className="ops-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="floor-success">
            <CheckCircle2 size={18} />
            {notice}
          </p>
        )}
        <div className="floor-contact-actions">
          {project.phone && (
            <a className="btn" href={'tel:' + project.phone}>
              <Phone size={16} />
              Call customer
            </a>
          )}
          <a
            className="btn"
            target="_blank"
            rel="noreferrer"
            href={
              'https://www.google.com/maps/search/?api=1&query=' +
              encodeURIComponent(project.address + ' ' + project.postcode)
            }
          >
            <MapPin size={16} />
            Directions
          </a>
          {!fieldUser && (
            <Link className="btn" href={'/flooring?record=' + project.leadId}>
              View quote
            </Link>
          )}
          {!fieldUser && (
            <Link className="btn" href={'/orders/' + project.orderId}>
              Sales order <ExternalLink size={14} />
            </Link>
          )}
        </div>
        <div className="floor-readiness">
          <div className={project.ready ? 'is-ready' : ''}>
            <Package size={20} />
            <span>
              Materials
              <strong>
                {project.ready
                  ? 'Allocated / dispatched'
                  : 'Allocation required'}
              </strong>
            </span>
          </div>
          <div className={project.paid ? 'is-ready' : ''}>
            <ClipboardCheck size={20} />
            <span>
              Payment clearance
              <strong>
                {project.paid ? 'Cleared' : 'Accounts action required'}
              </strong>
            </span>
          </div>
          <div className={project.customerConfirmed ? 'is-ready' : ''}>
            <CalendarDays size={20} />
            <span>
              Fitting appointment
              <strong>
                {date(project.scheduledDate)}
                {project.scheduledDate ? ' · ' + project.timeSlot : ''}
              </strong>
            </span>
          </div>
        </div>
        {!project.paid && project.status !== 'Completed' && (
          <p className="floor-note">
            Materials can be prepared and fitting booked; dispatch remains
            blocked until the linked invoice is issued and fully paid.
            {!fieldUser && project.invoiceId && (
              <>
                {' '}
                <Link href={'/invoices/' + project.invoiceId}>
                  Open invoice
                </Link>
              </>
            )}
          </p>
        )}
        <section className="floor-section">
          <div className="floor-section-title">
            <div>
              <h3>Material requirements</h3>
              <p>
                Accepted quantities, with current stock and purchasing coverage.
              </p>
            </div>
            {project.canPrepare &&
              !['In Progress', 'Issue', 'Completed'].includes(
                project.status,
              ) && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => run({ action: 'prepare' })}
                >
                  <Package size={15} />
                  {busy ? 'Preparing…' : 'Allocate & prepare purchases'}
                </button>
              )}
          </div>
          <div className="floor-material-list">
            {project.materials.map((m) => (
              <div className="floor-material" key={m.productId}>
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {m.sku} · {m.unit}
                  </small>
                </div>
                <div>
                  <span>Required</span>
                  <strong>
                    {m.quantity} {m.unit}
                  </strong>
                </div>
                <div>
                  <span>Allocated / dispatched</span>
                  <strong>{m.allocated}</strong>
                </div>
                <div>
                  <span>On purchase orders</span>
                  <strong>{m.incoming}</strong>
                </div>
                <div className={m.ready ? 'floor-good' : 'floor-pending'}>
                  {m.ready ? (
                    <>
                      <Check size={15} />
                      Ready
                    </>
                  ) : m.shortage > 0 ? (
                    <>{m.shortage} to source</>
                  ) : (
                    <>Awaiting receipt</>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="floor-helper">
            Only product lines create material requirements. Underlay or
            accessories charged as extras must also be listed as material
            products when stock is needed. Draft purchases require review and
            sending from Purchasing; receive goods and run allocation again.
          </p>
          {project.purchases.length > 0 && (
            <div className="floor-po-links">
              {project.purchases.map((p) => (
                <Link
                  className="btn"
                  key={p.id}
                  href={'/purchasing?record=' + p.id}
                >
                  {p.number}
                  <StatusPill>{p.status}</StatusPill>
                  <ExternalLink size={13} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="floor-section">
          <div className="floor-section-title">
            <div>
              <h3>Fitting appointment</h3>
              <p>
                {project.scheduledDate
                  ? date(project.scheduledDate) + ' · ' + project.timeSlot
                  : 'Assign a fitter and confirm a time with the customer.'}
              </p>
            </div>
            {project.canSchedule &&
              !['Completed', 'In Progress'].includes(project.status) && (
                <button
                  className="btn"
                  disabled={!project.ready || busy}
                  onClick={() => setBooking((v) => !v)}
                >
                  <CalendarDays size={15} />
                  {project.scheduledDate
                    ? 'Reschedule / change fitter'
                    : 'Book fitting'}
                </button>
              )}
          </div>
          {project.fitterId && (
            <p>
              <strong>
                {project.fitters.find((f) => f.id === project.fitterId)?.name ??
                  (fieldUser ? 'Assigned to you' : 'Assigned fitter')}
              </strong>
              {project.customerConfirmed ? ' · Customer confirmed' : ''}
            </p>
          )}
          {project.notes && <p>{project.notes}</p>}
          {booking && (
            <form
              className="floor-booking"
              onSubmit={(e) => {
                e.preventDefault();
                void run({ action: 'book', ...schedule });
              }}
            >
              <label className="ops-field">
                <span>Fitter</span>
                <select
                  aria-label="Fitter"
                  className="input"
                  required
                  value={schedule.fitterId}
                  onChange={(e) =>
                    setSchedule({ ...schedule, fitterId: e.target.value })
                  }
                >
                  <option value="">Select fitter</option>
                  {project.fitters.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ops-field">
                <span>Fitting date</span>
                <input
                  aria-label="Fitting date"
                  className="input"
                  required
                  type="date"
                  value={schedule.scheduledDate}
                  onChange={(e) =>
                    setSchedule({ ...schedule, scheduledDate: e.target.value })
                  }
                />
              </label>
              <label className="ops-field">
                <span>Time window</span>
                <input
                  aria-label="Time window"
                  className="input"
                  required
                  placeholder="09:00–12:00, AM or PM"
                  value={schedule.timeSlot}
                  onChange={(e) =>
                    setSchedule({ ...schedule, timeSlot: e.target.value })
                  }
                />
              </label>
              <label className="ops-field">
                <span>Site instructions</span>
                <input
                  aria-label="Site instructions"
                  className="input"
                  value={schedule.notes}
                  onChange={(e) =>
                    setSchedule({ ...schedule, notes: e.target.value })
                  }
                />
              </label>
              <label className="floor-checkbox">
                <input
                  type="checkbox"
                  required
                  checked={schedule.customerConfirmed}
                  onChange={(e) =>
                    setSchedule({
                      ...schedule,
                      customerConfirmed: e.target.checked,
                    })
                  }
                />
                Customer confirmed this appointment
              </label>
              <div className="floor-inline-links">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setBooking(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Confirm booking'}
                </button>
              </div>
            </form>
          )}
        </section>
        <section className="floor-section">
          <h3>Measured rooms</h3>
          <div className="floor-room-list">
            {project.rooms.map((r, i) => (
              <div key={i}>
                <strong>{r.name}</strong>
                <span>
                  {r.length} × {r.width} m · {r.wastePercent}% waste
                </span>
                {r.notes && <small>{r.notes}</small>}
              </div>
            ))}
          </div>
        </section>
        {project.status !== 'Completed' && (
          <RecordAttachments
            entity="flooring-fitting"
            entityId={project.leadId}
          />
        )}{' '}
        {project.status === 'Completed' && (
          <>
            <p className="floor-success">
              <CheckCircle2 size={18} />
              Customer sign-off: {project.signoff}
            </p>
            <RecordAttachments
              entity="flooring-fitting"
              entityId={project.leadId}
              readOnly
            />
          </>
        )}
        {project.caseId && (
          <p className="floor-note">
            <AlertTriangle size={16} /> A service case records the fitting
            issue.{' '}
            {!fieldUser && (
              <Link href={'/service-cases?record=' + project.caseId}>
                Open service case
              </Link>
            )}
          </p>
        )}
        {!fieldUser && (
          <div className="floor-accepted-summary">
            <span>
              Accepted {date(project.acceptedAt.slice(0, 10))} ·{' '}
              {project.acceptedBy}
            </span>
            <strong>
              {project.totalPence !== undefined ? gbp(project.totalPence) : ''}
            </strong>
            <small>{project.evidence}</small>
            {project.profit && (
              <small>
                Accepted estimated contribution:{' '}
                {gbp(project.profit.contributionProfitPence)} ·{' '}
                {(project.profit.contributionMarginBps / 100).toFixed(1)}%.
                Review actual costs on the sales order.
              </small>
            )}
          </div>
        )}
      </div>
      {project.canWork &&
        ['Booked', 'Issue', 'In Progress'].includes(project.status) && (
          <footer className="floor-job-footer">
            {['Booked', 'Issue'].includes(project.status) && (
              <button
                className="btn btn-primary"
                disabled={busy || !project.ready || !project.paid}
                onClick={() => {
                  setAction('start');
                  setEvidence('');
                }}
              >
                Start / resume fitting <ArrowRight size={16} />
              </button>
            )}
            {project.status === 'In Progress' && (
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  setAction('complete');
                  setEvidence('');
                }}
              >
                <CheckCircle2 size={16} />
                Complete & sign off
              </button>
            )}
            {['Booked', 'In Progress'].includes(project.status) && (
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setAction('issue');
                  setEvidence('');
                }}
              >
                <AlertTriangle size={16} />
                Report issue
              </button>
            )}
          </footer>
        )}
      <Dialog
        open={!!action}
        onOpenChange={(v) => {
          if (!v && !busy) setAction(null);
        }}
      >
        <DialogContent className="ops-status-dialog">
          <DialogTitle>
            {action === 'start'
              ? 'Dispatch materials & start fitting'
              : action === 'complete'
                ? 'Complete fitting'
                : 'Report a fitting issue'}
          </DialogTitle>
          <DialogDescription>
            {action === 'start'
              ? 'Starting dispatches the allocated materials from warehouse stock to this fitting team. Resume will not deduct them again.'
              : action === 'complete'
                ? 'Attach a completion photo, then record the customer name and sign-off evidence.'
                : 'This creates a service case linked to the customer and order, and pauses the fitting job.'}
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run({ action, evidence });
            }}
          >
            <label className="ops-field">
              <span>
                {action === 'complete'
                  ? 'Customer sign-off'
                  : 'Progress notes / issue details'}
              </span>
              <textarea
                aria-label="Fitting evidence"
                className="input"
                rows={4}
                required={action !== 'start'}
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <div className="ops-dialog-actions">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : 'Confirm ' +
                    (action === 'start'
                      ? 'dispatch'
                      : action === 'complete'
                        ? 'completion'
                        : 'issue')}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
export function FlooringFittingWorkspace() {
  const params = useSearchParams();
  const [rows, setRows] = useState<Project[]>([]),
    [selected, setSelected] = useState(params.get('record') ?? ''),
    [filter, setFilter] = useState('Active'),
    [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const { user } = useAuth();
  useEffect(() => {
    apiRequest<Project[]>('/api/flooring/fittings')
      .then((r) => {
        setRows(r);
        setSelected(
          (v) =>
            v ||
            r.find((p) => p.status !== 'Completed')?.leadId ||
            r[0]?.leadId ||
            '',
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const visible = rows.filter(
    (p) =>
      (filter === 'All' ||
        (filter === 'Completed'
          ? p.status === 'Completed'
          : p.status !== 'Completed')) &&
      [p.customerName, p.postcode, p.orderId]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const project = rows.find((p) => p.leadId === selected);
  return (
    <div className="floor-workspace">
      <header className="ops-page-header">
        <div>
          <div className="floor-eyebrow">FLOORING · FULFILMENT</div>
          <h1>Materials & fitting</h1>
          <p>From accepted quote to the final customer sign-off.</p>
        </div>
        {user?.role !== 'Installer' && (
          <Link className="btn" href="/flooring">
            Back to flooring pipeline
          </Link>
        )}
      </header>
      {error && (
        <p className="ops-error" role="alert">
          {error}
        </p>
      )}
      <div className="floor-workspace-layout">
        <aside className="floor-queue">
          <div className="floor-queue-controls">
            <input
              className="input"
              aria-label="Search fitting jobs"
              placeholder="Customer, postcode or order…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="floor-tabs">
              {['Active', 'Completed', 'All'].map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'active' : ''}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="floor-loading">
              <Loader2 className="ops-spinner" size={18} />
              Loading fitting jobs…
            </div>
          ) : (
            visible.map((p) => (
              <button
                className={
                  'floor-queue-item ' +
                  (selected === p.leadId ? 'selected' : '')
                }
                key={p.leadId}
                onClick={() => setSelected(p.leadId)}
              >
                <div>
                  <strong>{p.customerName}</strong>
                  <ArrowRight size={16} />
                </div>
                <small>
                  {p.postcode} · {p.orderId}
                </small>
                <span>
                  <CalendarDays size={14} />
                  {date(p.scheduledDate)}
                </span>
                <StatusPill>{p.status}</StatusPill>
              </button>
            ))
          )}
          {!loading && !visible.length && (
            <div className="floor-queue-empty">
              <Package size={28} />
              <strong>No matching fitting jobs</strong>
              <p>
                Accepted flooring quotes appear here with their materials and
                fitting requirements.
              </p>
            </div>
          )}
        </aside>
        {project ? (
          <FittingDetail
            key={project.leadId + ':' + project.version}
            project={project}
            onChange={(p) =>
              setRows((v) => v.map((r) => (r.leadId === p.leadId ? p : r)))
            }
          />
        ) : (
          <div className="floor-start">
            <ClipboardCheck size={42} />
            <h2>A clear path from quote to fitting</h2>
            <p>
              Accept a quote from the flooring pipeline to create its linked
              order, material requirements and fitting job.
            </p>
            {user?.role !== 'Installer' && (
              <Link className="btn btn-primary" href="/flooring">
                Open flooring pipeline <ArrowRight size={15} />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
