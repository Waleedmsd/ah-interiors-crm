'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import Link from 'next/link';
import { AfterSalesWorkflow } from '@/components/after-sales-workflow';
import { FlooringJourney } from '@/components/flooring-fulfilment';
import { businessDate } from '@/lib/business-date';
import { useSearchParams } from 'next/navigation';
import { RecordActivity } from '@/components/record-activity';
import { recordEntity } from '@/lib/record-links';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  LayoutList,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  X,
  Pencil,
  Paperclip,
} from 'lucide-react';
import { apiRequest } from '@/lib/api-client';
import { StatusPill } from '@/components/page-ui';
import { RecordAttachments } from '@/components/record-attachments';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  businessModules,
  blankDetails,
  canUseModule,
  type BusinessModule,
  type BusinessField,
} from '@/lib/business-modules';
import { operationalTransitions } from '@/lib/operational-transitions';
import { operationalDesign } from '@/components/operational-design';
import { useAuth } from '@/components/auth-context';
import { flooringRoom, type FlooringRoom } from '@/lib/flooring';
type Lookup = {
  id: string;
  name: string;
  role?: string;
  unit?: string;
  sellingPricePence?: number;
};
type OrderLookup = Lookup & {
  customerId?: string;
  address?: string;
  postcode?: string;
  phone?: string;
  groups?: Lookup[];
};
type Lookups = {
  timeZone?: string;
  customers: Lookup[];
  orders: OrderLookup[];
  suppliers: Lookup[];
  products: Lookup[];
  staff: Lookup[];
};
type RecordRow = {
  afterSalesAttention?: {
    customerNextDate: string;
    supplierNextDate: string;
    replacementDate: string;
  };
  id: string;
  number: string;
  title: string;
  status: string;
  version: number;
  customerId: string | null;
  orderId: string | null;
  supplierId: string | null;
  productId: string | null;
  assignedUserId: string | null;
  createdBy: string;
  details: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  profitability?: {
    contributionProfitPence: number;
    contributionMarginBps: number;
    tier: string;
  };
};
type Form = {
  title: string;
  customerId: string;
  orderId: string;
  supplierId: string;
  productId: string;
  assignedUserId: string;
  details: Record<string, unknown>;
};
const dateLabel = (value: string) =>
  value
    ? new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : 'Unscheduled';
const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const closed = (status: string) =>
  [
    'Completed',
    'Closed',
    'Resolved',
    'Cancelled',
    'Paid',
    'Approved',
    'Rejected',
    'Lost',
  ].includes(status);
const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    value / 100,
  );
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const emptyLookups: Lookups = {
  customers: [],
  orders: [],
  suppliers: [],
  products: [],
  staff: [],
};
export function OperationalWorkspace({ module }: { module: BusinessModule }) {
  return <OperationalWorkspaceContent key={module} module={module} />;
}
function OperationalWorkspaceContent({ module }: { module: BusinessModule }) {
  const definition = businessModules[module],
    design = operationalDesign[module],
    Icon = design.icon;
  const { user } = useAuth();
  const [rows, setRows] = useState<RecordRow[]>([]),
    [lookups, setLookups] = useState<Lookups>(emptyLookups);
  const day = (offset = 0) =>
    businessDate(Date.now(), lookups.timeZone, offset);
  const [view, setView] = useState('All'),
    [search, setSearch] = useState(''),
    [sort, setSort] = useState('Updated');
  const [layout, setLayout] = useState<'list' | 'board' | 'calendar'>('list'),
    [week, setWeek] = useState(0);
  const [selected, setSelected] = useState<RecordRow | null>(null),
    [form, setForm] = useState<Form | null>(null);
  const [progress, setProgress] = useState<{
    row: RecordRow;
    status: string;
    evidence: string;
  } | null>(null);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const params = useSearchParams();
  const incoming = params.get('record'),
    createFor = params.get('create') === '1' ? params.get('order') : null;
  const handledLink = useRef('');
  const [relatedChoices, setRelatedChoices] = useState<
    { id: string; entity: string; name: string }[]
  >([]);
  useEffect(() => {
    if (['tasks', 'approvals'].includes(module))
      apiRequest<typeof relatedChoices>('/api/records/choices')
        .then(setRelatedChoices)
        .catch((e) => setError(e.message));
  }, [module]);
  useEffect(() => {
    if (loading) return;
    const key = incoming ?? createFor ?? '';
    if (!key || handledLink.current === key) return;
    handledLink.current = key;
    if (incoming) {
      const record = rows.find((v) => v.id === incoming);
      if (record) openRecord(record);
      else setError('This record is unavailable or you do not have access.');
    } else if (createFor && writable) {
      create();
      changeOrder(createFor);
    }
  }, [incoming, createFor, loading, rows, lookups]);
  const saving = useRef(false);
  const writable = !!user && canUseModule(user.role, module, true),
    url = '/api/operations/' + module;
  const load = useCallback(async () => {
    const [records, lookup] = await Promise.all([
      apiRequest<RecordRow[]>(url),
      apiRequest<Lookups>('/api/lookups'),
    ]);
    setRows(records);
    setLookups(lookup);
  }, [url]);
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<RecordRow[]>(url),
      apiRequest<Lookups>('/api/lookups'),
    ])
      .then(([records, lookup]) => {
        if (active) {
          setRows(records);
          setLookups(lookup);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [url]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const due = (row: RecordRow) =>
    module === 'service-cases'
      ? ([
          row.afterSalesAttention?.customerNextDate,
          row.afterSalesAttention?.supplierNextDate,
          row.afterSalesAttention?.replacementDate,
          text(row.details.nextChaseDate),
        ]
          .filter((v): v is string => !!v)
          .sort()[0] ?? '')
      : design.dateKey
        ? text(row.details[design.dateKey])
        : row.createdAt.slice(0, 10);
  const overdue = (row: RecordRow) =>
    !!due(row) &&
    due(row) < day() &&
    !closed(row.status) &&
    !['expenses', 'approvals'].includes(module);
  const attention = (row: RecordRow) =>
    overdue(row) ||
    ['Failed', 'Issue Reported', 'Rejected'].includes(row.status);
  const finished = (row: RecordRow) =>
    [
      'Completed',
      'Delivered',
      'Closed',
      'Resolved',
      'Paid',
      ...(module === 'approvals' ? ['Approved'] : []),
    ].includes(row.status);
  const matches = (row: RecordRow, target: string) =>
    target === 'All' ||
    (target === 'Active' && !closed(row.status)) ||
    (target === 'Needs attention' && attention(row)) ||
    (target === 'Finished' && finished(row)) ||
    target === row.status ||
    (target === 'My work' && row.assignedUserId === user?.id) ||
    (target === 'Due today' && due(row) === day() && !closed(row.status)) ||
    (target === 'Due tomorrow' && due(row) === day(1) && !closed(row.status)) ||
    (target === 'Overdue' && overdue(row)) ||
    (target === 'Customer update due' &&
      !!row.afterSalesAttention?.customerNextDate &&
      row.afterSalesAttention.customerNextDate <= day() &&
      !closed(row.status)) ||
    (target === 'Supplier chase due' &&
      !!row.afterSalesAttention?.supplierNextDate &&
      row.afterSalesAttention.supplierNextDate <= day() &&
      !closed(row.status)) ||
    (target === 'Replacement overdue' &&
      !!row.afterSalesAttention?.replacementDate &&
      row.afterSalesAttention.replacementDate < day() &&
      !closed(row.status)) ||
    (target === 'Replacement overdue' &&
      !!text(row.details.expectedReplacementDate) &&
      text(row.details.expectedReplacementDate) < day() &&
      !closed(row.status));
  const filtered = rows
    .filter(
      (row) =>
        matches(row, view) &&
        [
          row.number,
          row.title,
          lookups.customers.find((v) => v.id === row.customerId)?.name,
          JSON.stringify(row.details),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'Title'
        ? a.title.localeCompare(b.title)
        : sort === 'Due'
          ? (due(a) || '9999').localeCompare(due(b) || '9999')
          : b.updatedAt.localeCompare(a.updatedAt),
    );
  const schedulable = [
    'deliveries',
    'assembly-jobs',
    'flooring',
    'tasks',
  ].includes(module);
  const scheduleKey = module === 'flooring' ? 'measureDate' : design.dateKey;
  const days = useMemo(() => {
    const monday =
      -((new Date(day() + 'T12:00:00').getDay() + 6) % 7) + week * 7;
    return Array.from({ length: 7 }, (_, i) => day(monday + i));
  }, [week, lookups.timeZone]);
  const stats = [
    {
      label:
        'Active ' +
        (module === 'deliveries'
          ? 'deliveries'
          : module === 'service-cases'
            ? 'cases'
            : 'records'),
      count: rows.filter((r) => !closed(r.status)).length,
      detail: 'Work in progress',
      icon: Package,
      view: 'Active',
      tone: 'blue',
    },
    {
      label:
        module === 'approvals'
          ? 'Awaiting decision'
          : module === 'expenses'
            ? 'Awaiting review'
            : 'Due today',
      count: rows.filter((r) =>
        module === 'approvals'
          ? r.status === 'Requested'
          : module === 'expenses'
            ? r.status === 'Submitted'
            : matches(r, 'Due today'),
      ).length,
      detail:
        module === 'approvals' || module === 'expenses'
          ? 'Ready for your review'
          : 'On today’s agenda',
      icon: CalendarDays,
      view:
        module === 'approvals'
          ? 'Requested'
          : module === 'expenses'
            ? 'Submitted'
            : 'Due today',
      tone: 'violet',
    },
    {
      label: module === 'deliveries' ? 'Ready to book' : 'Needs attention',
      count: rows.filter((r) =>
        module === 'deliveries' ? r.status === 'Ready to Book' : attention(r),
      ).length,
      detail:
        module === 'deliveries'
          ? 'Ready for a delivery date'
          : 'Follow-up recommended',
      icon: module === 'deliveries' ? Clock3 : TriangleAlert,
      view: module === 'deliveries' ? 'Ready to Book' : 'Needs attention',
      tone: 'amber',
    },
    {
      label:
        module === 'approvals'
          ? 'Approved'
          : module === 'deliveries'
            ? 'Delivered'
            : 'Completed',
      count: rows.filter(finished).length,
      detail: 'Across all records',
      icon: CheckCheck,
      view: 'Finished',
      tone: 'green',
    },
  ];
  function create(date?: string) {
    setError('');
    setSelected(null);
    setForm({
      title: '',
      customerId: '',
      orderId: '',
      supplierId: '',
      productId: '',
      assignedUserId: user && canUseModule(user.role, module) ? user.id : '',
      details: {
        ...blankDetails(module),
        ...(module === 'service-cases'
          ? { reportedDate: day(), priority: 'Normal' }
          : {}),
        ...(date && scheduleKey ? { [scheduleKey]: date } : {}),
      },
    });
  }
  function openRecord(row: RecordRow) {
    setError('');
    setSelected(row);
    setForm(null);
  }
  function edit(row: RecordRow) {
    setError('');
    setForm({
      title: row.title,
      customerId: row.customerId ?? '',
      orderId: row.orderId ?? '',
      supplierId: row.supplierId ?? '',
      productId: row.productId ?? '',
      assignedUserId: row.assignedUserId ?? '',
      details: Object.fromEntries(
        definition.fields.map((field) => [
          field.key,
          row.details[field.key] ?? blankDetails(module)[field.key],
        ]),
      ),
    });
  }
  function updateField(key: string, value: unknown) {
    setForm((current) =>
      current
        ? { ...current, details: { ...current.details, [key]: value } }
        : current,
    );
  }
  function changeOrder(id: string) {
    const order = lookups.orders.find((o) => o.id === id);
    setForm((current) =>
      current
        ? {
            ...current,
            orderId: id,
            customerId: order?.customerId ?? current.customerId,
            title:
              current.title ||
              `${module === 'assembly-jobs' ? 'Assembly' : module === 'service-cases' ? 'Case' : 'Delivery'} · ${order?.name ?? id}`,
            details: {
              ...current.details,
              ...(['deliveries', 'assembly-jobs'].includes(module)
                ? {
                    groupId:
                      order?.groups?.length === 1 ? order.groups[0].id : '',
                    ...(order?.address ? { address: order.address } : {}),
                  }
                : {}),
              ...(module === 'deliveries'
                ? { postcode: order?.postcode ?? '', phone: order?.phone ?? '' }
                : {}),
            },
          }
        : current,
    );
  }
  function relationship(
    key:
      | 'customerId'
      | 'orderId'
      | 'supplierId'
      | 'productId'
      | 'assignedUserId',
    label: string,
    values: Lookup[],
    required = false,
  ) {
    return (
      <label className="ops-field">
        <span>
          {label}
          {required && <span className="required-mark"> *</span>}
        </span>
        <select
          aria-label={label}
          className="input"
          required={required}
          disabled={
            !!selected &&
            (key === 'customerId' ||
              (key === 'orderId' &&
                !(module === 'service-cases' && !selected.orderId)))
          }
          value={form?.[key] ?? ''}
          onChange={(e) =>
            key === 'orderId'
              ? changeOrder(e.target.value)
              : setForm((v) => (v ? { ...v, [key]: e.target.value } : v))
          }
        >
          <option value="">Select {label.toLowerCase()}…</option>
          {values.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.role ? ' · ' + v.role : ''}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function fieldControl(field: BusinessField) {
    if (field.key === 'linkedId')
      return (
        <label className="ops-field" key={field.key}>
          <span>Related record</span>
          <select
            className="input"
            required={field.required || !!form?.details.linkedType}
            value={text(form?.details.linkedId)}
            onChange={(e) => updateField('linkedId', e.target.value)}
          >
            <option value="">Choose a record…</option>
            {relatedChoices
              .filter(
                (v) =>
                  v.entity === recordEntity(text(form?.details.linkedType)),
              )
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
        </label>
      );
    const value = form?.details[field.key],
      change = (next: unknown) => {
        updateField(field.key, next);
        if (field.key === 'linkedType') updateField('linkedId', '');
      };
    if (field.type === 'rooms')
      return (
        <RoomEditor
          key={field.key}
          value={value as FlooringRoom[]}
          onChange={change}
        />
      );
    if (field.type === 'quote')
      return (
        <QuoteEditor
          key={field.key}
          value={value as Quote}
          products={lookups.products}
          canViewCosts={
            !!user &&
            ['Management', 'Team Lead', 'Accounts'].includes(user.role)
          }
          measuredQuantity={(
            (form?.details.rooms ?? []) as FlooringRoom[]
          ).reduce((n, r) => {
            try {
              return n + flooringRoom(r).requiredQuantity;
            } catch {
              return n;
            }
          }, 0)}
          onChange={change}
        />
      );
    const options =
      field.key === 'groupId'
        ? lookups.orders.find((o) => o.id === form?.orderId)?.groups
        : undefined;
    return (
      <label
        key={field.key}
        className={
          'ops-field ' +
          (field.type === 'textarea' ? 'ops-field-wide ' : '') +
          (field.type === 'boolean' ? 'ops-toggle' : '')
        }
      >
        <span>
          {field.label}
          {field.required && <span className="required-mark"> *</span>}
        </span>
        {field.type === 'boolean' ? (
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => change(e.target.checked)}
          />
        ) : field.key === 'groupId' ? (
          <select
            aria-label={field.label}
            className="input"
            required
            value={text(value)}
            onChange={(e) => change(e.target.value)}
          >
            <option value="">
              {form?.orderId
                ? 'Select fulfilment group…'
                : 'Choose a sales order first'}
            </option>
            {text(value).startsWith('case:') && (
              <option value={text(value)}>Case replacement shipment</option>
            )}
            {options?.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        ) : field.type === 'select' ? (
          <select
            aria-label={field.label}
            className="input"
            value={text(value)}
            required={field.required}
            onChange={(e) => change(e.target.value)}
          >
            {field.options?.map((v) => (
              <option key={v} value={v}>
                {v || 'Select…'}
              </option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            aria-label={field.label}
            className="input"
            rows={3}
            required={field.required}
            placeholder={
              field.key === 'notes' ? 'Add context for your team…' : undefined
            }
            value={text(value)}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <input
            className="input"
            type={
              field.type === 'money' || field.type === 'number'
                ? 'number'
                : field.type === 'datetime'
                  ? 'datetime-local'
                  : field.type === 'date'
                    ? 'date'
                    : 'text'
            }
            required={field.required}
            min={
              field.type === 'money' || field.type === 'number' ? 0 : undefined
            }
            step={
              field.type === 'money'
                ? '0.01'
                : field.type === 'number'
                  ? 'any'
                  : undefined
            }
            value={
              field.type === 'money' ? Number(value ?? 0) / 100 : text(value)
            }
            onChange={(e) =>
              change(
                field.type === 'money'
                  ? Math.round(Number(e.target.value) * 100)
                  : field.type === 'number'
                    ? Number(e.target.value)
                    : e.target.value,
              )
            }
          />
        )}
      </label>
    );
  }
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      await apiRequest(url + (selected ? '/' + selected.id : ''), {
        method: selected ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form,
          ...(selected ? { version: selected.version } : {}),
        }),
      });
      setForm(null);
      setSelected(null);
      setNotice(
        `${definition.singular[0].toUpperCase() + definition.singular.slice(1)} saved.`,
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function nextStatuses(row: RecordRow) {
    if (module === 'flooring' && row.orderId) return [];
    const next = operationalTransitions[module][row.status] ?? [];
    return next.filter((status) => {
      if (module === 'flooring' && status === 'Won') return false;
      if (module === 'service-cases' && status === 'Resolved') return false;
      if (
        ['approvals', 'expenses'].includes(module) &&
        ['Approved', 'Rejected'].includes(status)
      )
        return user?.role === 'Management';
      if (user?.role === 'Delivery')
        return ['Out for Delivery', 'Delivered', 'Failed'].includes(status);
      if (user?.role === 'Installer')
        return ['In Progress', 'Completed', 'Issue Reported'].includes(status);
      return (
        writable || (module === 'tasks' && row.assignedUserId === user?.id)
      );
    });
  }
  async function saveProgress(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!progress || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const updated = await apiRequest<RecordRow>(url + '/' + progress.row.id, {
        method: 'PATCH',
        body: JSON.stringify({
          version: progress.row.version,
          status: progress.status,
          evidence: progress.evidence,
        }),
      });
      setSelected(updated);
      setProgress(null);
      setNotice('Status updated to ' + updated.status + '.');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const owner = (row: RecordRow) =>
    lookups.staff.find((v) => v.id === row.assignedUserId)?.name ??
    (row.assignedUserId === user?.id ? user?.name : 'Unassigned');
  function recordCard(row: RecordRow) {
    return (
      <button
        key={row.id}
        className="ops-work-card"
        onClick={() => openRecord(row)}
      >
        <span className="ops-card-top">
          <span>{row.number}</span>
          <ArrowUpRight size={14} />
        </span>
        <strong>{row.title}</strong>
        <span>
          {lookups.customers.find((c) => c.id === row.customerId)?.name ??
            text(row.details.payee)}
        </span>
        <span className="ops-card-bottom">
          <span>
            <CalendarDays size={13} />
            {dateLabel(due(row))}
          </span>
          <span className="ops-avatar" title={owner(row)}>
            {initials(owner(row) || '?')}
          </span>
        </span>
      </button>
    );
  }
  const newButton = (label = 'Create ' + definition.singular) => (
    <button className="btn btn-primary ops-primary" onClick={() => create()}>
      <Plus size={16} />
      {label}
    </button>
  );
  return (
    <div className="page ops-page">
      <header className="ops-page-header">
        <div>
          <div className="ops-eyebrow">
            <Icon size={15} />
            {design.category}
            <span>/</span>AH Interiors
          </div>
          <h1>{definition.title}</h1>
          <p>{design.description}</p>
        </div>
        <div className="ops-header-actions">
          {module === 'flooring' && (
            <Link className="btn" href="/flooring/fitting">
              <CalendarDays size={16} />
              Materials & fitting
            </Link>
          )}
          {writable && newButton()}
        </div>
      </header>
      <div className="ops-stats">
        {stats.map((stat) => (
          <button
            key={stat.label}
            className={'ops-stat ' + stat.tone}
            aria-pressed={view === stat.view}
            onClick={() => setView(stat.view)}
          >
            <span className="ops-stat-heading">
              {stat.label}
              <span className="ops-stat-icon">
                <stat.icon size={17} />
              </span>
            </span>
            <strong>{loading ? '—' : stat.count}</strong>
            <span className="ops-stat-caption">
              {stat.detail}
              <ArrowUpRight size={13} />
            </span>
          </button>
        ))}
      </div>
      {notice && (
        <output className="ops-toast">
          <Check size={16} />
          {notice}
        </output>
      )}
      {error && !form && !selected && (
        <div role="alert" className="ops-error">
          <TriangleAlert size={17} />
          {error}
          <button
            className="btn"
            onClick={() => {
              setError('');
              setLoading(true);
              void load()
                .catch((e) => setError((e as Error).message))
                .finally(() => setLoading(false));
            }}
          >
            Retry
          </button>
        </div>
      )}
      <section
        className="ops-collection"
        aria-label={definition.title + ' records'}
      >
        <div className="ops-collection-heading">
          <div>
            <h2>
              {module === 'flooring'
                ? 'Lead pipeline'
                : module === 'deliveries'
                  ? 'Delivery workspace'
                  : module === 'assembly-jobs'
                    ? 'Assembly schedule'
                    : module === 'service-cases'
                      ? 'Case workspace'
                      : definition.title}
              <span className="ops-total">{rows.length}</span>
            </h2>
            <p>
              {module === 'deliveries'
                ? 'A single view of bookings, teams and delivery progress.'
                : 'Keep your team aligned on what needs to happen next.'}
            </p>
          </div>
          <div className="ops-view-switch" aria-label="Display records">
            {[
              { id: 'list', label: 'List', icon: LayoutList },
              { id: 'board', label: 'Board', icon: Columns3 },
              ...(schedulable
                ? [{ id: 'calendar', label: 'Schedule', icon: CalendarDays }]
                : []),
            ].map((item) => (
              <button
                key={item.id}
                aria-pressed={layout === item.id}
                onClick={() => setLayout(item.id as typeof layout)}
              >
                <item.icon size={15} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ops-tabs" aria-label="Quick filters">
          {design.tabs.map((tab) => (
            <button
              key={tab}
              aria-pressed={view === tab}
              onClick={() => setView(tab)}
            >
              {tab === 'All'
                ? 'All ' +
                  (module === 'deliveries'
                    ? 'deliveries'
                    : module === 'service-cases'
                      ? 'cases'
                      : 'records')
                : tab}
              <span>{rows.filter((r) => matches(r, tab)).length}</span>
            </button>
          ))}
        </div>
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={17} />
            <input
              aria-label="Search operational records"
              placeholder={
                module === 'deliveries'
                  ? 'Search customer, postcode or job reference…'
                  : 'Search name, customer or reference…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </label>
          <div className="ops-toolbar-right">
            <label className="ops-filter">
              <SlidersHorizontal size={14} />
              <select
                aria-label="Operational view"
                value={view}
                onChange={(e) => setView(e.target.value)}
              >
                {[
                  ...new Set([
                    'All',
                    'Active',
                    'Needs attention',
                    'Finished',
                    'My work',
                    'Due today',
                    'Due tomorrow',
                    'Overdue',
                    ...definition.statuses,
                    ...design.tabs,
                  ]),
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <select
              className="ops-sort"
              aria-label="Sort operational records"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="Updated">Last updated</option>
              <option value="Due">Date: earliest first</option>
              <option value="Title">Name: A–Z</option>
            </select>
          </div>
        </div>
        {loading ? (
          <output className="ops-loading">
            <Loader2 className="ops-spinner" size={20} />
            <span>Loading your workspace…</span>
            {[1, 2, 3].map((n) => (
              <div className="ops-skeleton" key={n} />
            ))}
          </output>
        ) : layout === 'list' ? (
          <>
            <div className="table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>
                      {module === 'deliveries'
                        ? 'Delivery job'
                        : module === 'flooring'
                          ? 'Lead / customer'
                          : 'Record / customer'}
                    </th>
                    <th>Status</th>
                    <th>Assigned to</th>
                    <th>{design.dateLabel}</th>
                    <th>
                      {module === 'flooring'
                        ? 'Quote margin'
                        : module === 'expenses'
                          ? 'Total'
                          : module === 'deliveries'
                            ? 'Destination'
                            : 'Reference'}
                    </th>
                    <th aria-label="Open record">
                      <span className="sr-only">Open record</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          className="ops-record-link"
                          aria-label={row.title}
                          onClick={() => openRecord(row)}
                        >
                          <span className="ops-record-symbol">
                            <Icon size={18} />
                          </span>
                          <span>
                            <strong>{row.title}</strong>
                            <small>
                              {lookups.customers.find(
                                (v) => v.id === row.customerId,
                              )?.name ?? row.number}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <StatusPill>{row.status}</StatusPill>
                      </td>
                      <td>
                        <span className="ops-owner">
                          <span
                            className={
                              'ops-avatar ' +
                              (!row.assignedUserId ? 'is-unassigned' : '')
                            }
                          >
                            {row.assignedUserId ? (
                              initials(owner(row) || '?')
                            ) : (
                              <UserRound size={13} />
                            )}
                          </span>
                          {owner(row)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            'ops-date ' + (overdue(row) ? 'is-overdue' : '')
                          }
                        >
                          <CalendarDays size={14} />
                          {dateLabel(due(row))}
                        </span>
                        {text(row.details.timeSlot) && (
                          <small className="ops-cell-note">
                            {text(row.details.timeSlot)}
                          </small>
                        )}
                      </td>
                      <td>
                        {module === 'flooring' ? (
                          row.profitability ? (
                            <span className="ops-margin">
                              {(
                                row.profitability.contributionMarginBps / 100
                              ).toFixed(1)}
                              %
                            </span>
                          ) : (
                            'No quote yet'
                          )
                        ) : module === 'expenses' ? (
                          money(
                            Number(row.details.amountPence ?? 0) +
                              Number(row.details.vatPence ?? 0),
                          )
                        ) : module === 'deliveries' ? (
                          <span className="ops-destination">
                            <MapPin size={14} />
                            {text(row.details.postcode) || 'Not set'}
                          </span>
                        ) : (
                          <span className="ops-reference">{row.number}</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="ops-open"
                          aria-label={'Open ' + row.number}
                          onClick={() => openRecord(row)}
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!filtered.length && renderEmptyState()}
          </>
        ) : layout === 'board' ? (
          <div className="ops-board">
            {definition.statuses.map((status) => (
              <section className="ops-board-column" key={status}>
                <h3>
                  <span
                    className={
                      'ops-stage-dot ' + (closed(status) ? 'is-complete' : '')
                    }
                  />
                  {status}
                  <span>
                    {filtered.filter((r) => r.status === status).length}
                  </span>
                </h3>
                {filtered.filter((r) => r.status === status).map(recordCard)}
                {!filtered.some((r) => r.status === status) && (
                  <p className="ops-lane-empty">No records in this stage</p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="ops-schedule">
            <div className="ops-week-nav">
              <div>
                <CalendarDays size={17} />
                <strong>
                  {dateLabel(days[0])} – {dateLabel(days[6])}
                </strong>
              </div>
              <div>
                <button className="btn" onClick={() => setWeek(0)}>
                  This week
                </button>
                <button
                  className="ops-open"
                  aria-label="Previous week"
                  onClick={() => setWeek((v) => v - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="ops-open"
                  aria-label="Next week"
                  onClick={() => setWeek((v) => v + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
            <div className="ops-week-grid">
              {days.map((date) => (
                <section
                  key={date}
                  className={'ops-day ' + (date === day() ? 'is-today' : '')}
                >
                  <header>
                    <span>
                      {new Date(date + 'T12:00:00').toLocaleDateString(
                        'en-GB',
                        { weekday: 'short' },
                      )}
                    </span>
                    <strong>{Number(date.slice(-2))}</strong>
                    {writable && (
                      <button
                        aria-label={'Schedule for ' + date}
                        onClick={() => create(date)}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </header>
                  {filtered
                    .filter((r) => text(r.details[scheduleKey]) === date)
                    .map(recordCard)}
                  {!filtered.some(
                    (r) => text(r.details[scheduleKey]) === date,
                  ) && <span className="ops-day-empty">No bookings</span>}
                </section>
              ))}
            </div>
            <div className="ops-unscheduled">
              <h3>
                Not yet scheduled{' '}
                <span>
                  {filtered.filter((r) => !r.details[scheduleKey]).length}
                </span>
              </h3>
              <div>
                {filtered
                  .filter((r) => !r.details[scheduleKey])
                  .map(recordCard)}
              </div>
            </div>
          </div>
        )}
        <footer className="ops-table-footer">
          <span>
            {filtered.length} of {rows.length} records
            {view !== 'All' ? ' · ' + view : ''}
          </span>
          <span>
            <span className="ops-connected-dot" />
            Shared with your team
          </span>
        </footer>
      </section>
      <div className="ops-workflow">
        <div>
          <h3>
            <Icon size={17} />
            {module === 'deliveries'
              ? 'From warehouse to doorstep'
              : 'A clear path from start to finish'}
          </h3>
          <p>Open a record to manage its next step.</p>
        </div>
        <div className="ops-workflow-stages">
          {design.stages.map((stage, index) => (
            <button key={stage} onClick={() => setView(stage)}>
              <span>{index + 1}</span>
              {stage}
              {index < design.stages.length - 1 && <ChevronRight size={13} />}
            </button>
          ))}
        </div>
      </div>
      <Sheet
        open={!!form || !!selected}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setForm(null);
            setSelected(null);
            setError('');
          }
        }}
      >
        <SheetContent className="ops-drawer" showCloseButton={!busy}>
          <div className="ops-drawer-header">
            <div className="ops-eyebrow">
              <Icon size={15} />
              {selected?.number ?? 'New record'}
            </div>
            <SheetTitle>
              {form
                ? (selected ? 'Edit ' : 'Create ') + definition.singular
                : selected?.title}
            </SheetTitle>
            <SheetDescription>
              {form
                ? 'Keep the essentials clear. You can add more detail as the work progresses.'
                : 'Details, progress and supporting documents in one place.'}
            </SheetDescription>
          </div>
          {form ? (
            <form className="ops-drawer-form" onSubmit={save}>
              <div className="ops-drawer-body">
                {error && (
                  <div role="alert" className="ops-error">
                    {error}
                  </div>
                )}
                <section className="ops-form-section">
                  <div className="ops-section-label">
                    <span>01</span>
                    <div>
                      <h3>The essentials</h3>
                      <p>Give this work a clear name and owner.</p>
                    </div>
                  </div>
                  <div className="ops-form-grid">
                    <label className="ops-field ops-field-wide">
                      <span>
                        {module === 'tasks' ? 'Task name' : 'Title'}{' '}
                        <span className="required-mark">*</span>
                      </span>
                      <input
                        className="input"
                        required
                        maxLength={200}
                        placeholder={
                          module === 'deliveries'
                            ? 'e.g. Wardrobe delivery · customer name'
                            : 'Give this record a descriptive name'
                        }
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                      />
                    </label>
                    {(definition.order || definition.optionalOrder) &&
                      relationship(
                        'orderId',
                        'Sales order',
                        lookups.orders,
                        !!definition.order,
                      )}
                    {definition.customer &&
                      relationship(
                        'customerId',
                        'Customer',
                        lookups.customers,
                        true,
                      )}
                    {relationship(
                      'assignedUserId',
                      'Assigned staff',
                      lookups.staff.filter(
                        (v) => !v.role || canUseModule(v.role, module),
                      ),
                      module === 'tasks' || module === 'flooring',
                    )}
                    {module === 'service-cases' && (
                      <>
                        {relationship(
                          'supplierId',
                          'Supplier',
                          lookups.suppliers,
                        )}
                        {relationship('productId', 'Product', lookups.products)}
                      </>
                    )}
                  </div>
                </section>
                {design.sections.map(([name, ...keys], index) => (
                  <section className="ops-form-section" key={name}>
                    <div className="ops-section-label">
                      <span>{String(index + 2).padStart(2, '0')}</span>
                      <h3>{name}</h3>
                    </div>
                    <div className="ops-form-grid">
                      {keys
                        .map((key) =>
                          definition.fields.find((f) => f.key === key),
                        )
                        .filter((field): field is BusinessField => !!field)
                        .map(fieldControl)}
                    </div>
                  </section>
                ))}
              </div>
              <footer className="ops-drawer-footer">
                <span>
                  <span className="required-mark">*</span> Required fields
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    selected
                      ? setForm(null)
                      : (setForm(null), setSelected(null))
                  }
                >
                  Cancel
                </button>
                <button className="btn btn-primary ops-primary" disabled={busy}>
                  {busy ? (
                    <Loader2 size={16} className="ops-spinner" />
                  ) : (
                    <Check size={16} />
                  )}
                  Save {definition.singular}
                </button>
              </footer>
            </form>
          ) : (
            selected && (
              <>
                <div className="ops-drawer-body">
                  <div className="ops-detail-status">
                    <StatusPill>{selected.status}</StatusPill>
                    <span>Updated {dateLabel(selected.updatedAt)}</span>
                  </div>
                  {error && (
                    <div role="alert" className="ops-error">
                      {error}
                    </div>
                  )}
                  <div className="ops-detail-summary">
                    <div>
                      <span>Customer</span>
                      <strong>
                        {lookups.customers.find(
                          (v) => v.id === selected.customerId,
                        )?.name ?? '—'}
                      </strong>
                      {selected.orderId && (
                        <Link href={'/orders/' + selected.orderId}>
                          View order #{selected.orderId}
                          <ArrowUpRight size={13} />
                        </Link>
                      )}
                    </div>
                    <div>
                      <span>Assigned to</span>
                      <strong>{owner(selected)}</strong>
                    </div>
                  </div>
                  {module === 'service-cases' && (
                    <AfterSalesWorkflow
                      caseId={selected.id}
                      version={selected.version}
                      onChange={async () => {
                        await load();
                        const fresh = await apiRequest<RecordRow[]>(url);
                        setSelected(
                          fresh.find((r) => r.id === selected.id) ?? null,
                        );
                      }}
                    />
                  )}
                  {module === 'flooring' && (
                    <FlooringJourney
                      key={selected.id}
                      lead={selected}
                      onChange={async () => {
                        await load();
                        const fresh = await apiRequest<RecordRow[]>(url);
                        setSelected(
                          fresh.find((r) => r.id === selected.id) ?? null,
                        );
                      }}
                    />
                  )}
                  {nextStatuses(selected).length > 0 && (
                    <section className="ops-next-step">
                      <h3>Move this forward</h3>
                      <p>
                        Choose the next step. Supporting evidence can be
                        recorded before you confirm.
                      </p>
                      <div>
                        {nextStatuses(selected).map((status) => (
                          <button
                            key={status}
                            className="btn"
                            onClick={() => {
                              setError('');
                              setProgress({
                                row: selected,
                                status,
                                evidence: '',
                              });
                            }}
                          >
                            {status}
                            <ArrowRight size={14} />
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                  {design.sections.map(([name, ...keys]) => {
                    const fields = keys
                      .map((key) =>
                        definition.fields.find((f) => f.key === key),
                      )
                      .filter((f): f is BusinessField => !!f);
                    return (
                      <section className="ops-detail-section" key={name}>
                        <h3>{name}</h3>
                        <dl>
                          {fields.map((field) => {
                            const value = selected.details[field.key];
                            if (field.type === 'rooms')
                              return (
                                <div className="ops-field-wide" key={field.key}>
                                  <dt>Rooms</dt>
                                  <dd>
                                    {((value as FlooringRoom[]) ?? []).map(
                                      (room) => (
                                        <p key={room.name}>
                                          {room.name} · {room.length} ×{' '}
                                          {room.width} m
                                        </p>
                                      ),
                                    )}
                                    {!((value as FlooringRoom[]) ?? [])
                                      .length && 'No rooms measured yet'}
                                  </dd>
                                </div>
                              );
                            if (field.type === 'quote')
                              return (
                                <div key={field.key}>
                                  <dt>Quote</dt>
                                  <dd>
                                    {(value as Quote)?.lines?.length ?? 0} line
                                    items
                                    {selected.profitability &&
                                      ' · ' +
                                        (
                                          selected.profitability
                                            .contributionMarginBps / 100
                                        ).toFixed(1) +
                                        '% contribution margin'}
                                  </dd>
                                </div>
                              );
                            return (
                              <div key={field.key}>
                                <dt>{field.label}</dt>
                                <dd>
                                  {field.type === 'boolean'
                                    ? value
                                      ? 'Yes'
                                      : 'No'
                                    : field.type === 'money'
                                      ? money(Number(value ?? 0))
                                      : field.key === 'groupId'
                                        ? (lookups.orders
                                            .find(
                                              (v) => v.id === selected.orderId,
                                            )
                                            ?.groups?.find(
                                              (g) => g.id === value,
                                            )?.name ?? text(value))
                                        : text(value) || 'Not provided'}
                                </dd>
                              </div>
                            );
                          })}
                        </dl>
                      </section>
                    );
                  })}
                  <div className="ops-attachment-heading">
                    <Paperclip size={16} />
                    Supporting documents
                  </div>
                  <RecordAttachments entity={module} entityId={selected.id} />
                  <RecordActivity entity={module} entityId={selected.id} />
                </div>
                <footer className="ops-drawer-footer">
                  <span>{selected.number}</span>
                  {writable &&
                    !(module === 'flooring' && selected.orderId) &&
                    ![
                      'Completed',
                      'Closed',
                      'Cancelled',
                      'Paid',
                      'Approved',
                      'Rejected',
                    ].includes(selected.status) && (
                      <button
                        className="btn btn-primary ops-primary"
                        onClick={() => edit(selected)}
                      >
                        <Pencil size={15} />
                        Edit details
                      </button>
                    )}
                </footer>
              </>
            )
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={!!progress}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setProgress(null);
            setError('');
          }
        }}
      >
        <DialogContent className="ops-status-dialog">
          <DialogTitle>Update {progress?.row.number}</DialogTitle>
          <DialogDescription>
            Confirm the next step and record anything your team needs to know.
          </DialogDescription>
          {progress && (
            <form onSubmit={saveProgress}>
              <div className="ops-status-change">
                <StatusPill>{progress.row.status}</StatusPill>
                <ArrowRight size={18} />
                <StatusPill>{progress.status}</StatusPill>
              </div>
              <label className="ops-field">
                Evidence, sign-off or reason
                <textarea
                  className="input"
                  rows={4}
                  placeholder="Add a delivery signature, completion reference or reason…"
                  value={progress.evidence}
                  onChange={(e) =>
                    setProgress({ ...progress, evidence: e.target.value })
                  }
                />
              </label>
              {error && (
                <p role="alert" className="ops-error">
                  {error}
                </p>
              )}
              <div className="ops-dialog-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => setProgress(null)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary ops-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Confirm update'}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
  function renderEmptyState() {
    const narrowed = !!search || view !== 'All';
    return (
      <div className="ops-empty">
        <div className="ops-empty-art">
          <span className="ops-art-orbit" />
          <span className="ops-art-card">
            <Icon size={37} strokeWidth={1.4} />
          </span>
          <span className="ops-art-check">
            <Check size={15} />
          </span>
          <span className="ops-art-mini">
            <Package size={17} />
          </span>
        </div>
        <h3>{narrowed ? 'Nothing here just yet.' : design.empty}</h3>
        <p>
          {narrowed
            ? 'No records match this view. Try a different filter or search term.'
            : design.hint}
        </p>
        <div>
          {narrowed ? (
            <button
              className="btn"
              onClick={() => {
                setSearch('');
                setView('All');
              }}
            >
              Clear filters
            </button>
          ) : (
            writable && newButton()
          )}
          {!narrowed && definition.order && (
            <Link className="ops-text-link" href="/orders">
              View sales orders
              <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        <span className="ops-empty-note">
          {narrowed
            ? 'Your other records are still available in All records.'
            : 'Your records will appear here as your team creates them.'}
        </span>
      </div>
    );
  }
}
function RoomEditor({
  value,
  onChange,
}: {
  value: FlooringRoom[];
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="ops-line-editor">
      {value.map((room, index) => {
        let calculated = { area: 0, requiredQuantity: 0 };
        try {
          calculated = flooringRoom(room);
        } catch {}
        return (
          <div className="ops-room" key={index}>
            <div className="ops-line-heading">
              <strong>Room {index + 1}</strong>
              <button
                type="button"
                className="ops-remove"
                aria-label={'Remove room ' + (index + 1)}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X size={15} />
              </button>
            </div>
            <div className="ops-form-grid">
              {(
                [
                  'name',
                  'length',
                  'width',
                  'wastePercent',
                  'underlay',
                  'accessories',
                  'notes',
                ] as const
              ).map((key) => (
                <label className="ops-field" key={key}>
                  {
                    {
                      name: 'Room name',
                      length: 'Length (m)',
                      width: 'Width (m)',
                      wastePercent: 'Waste (%)',
                      underlay: 'Underlay',
                      accessories: 'Accessories',
                      notes: 'Fitting notes',
                    }[key]
                  }
                  <input
                    className="input"
                    type={
                      ['length', 'width', 'wastePercent'].includes(key)
                        ? 'number'
                        : 'text'
                    }
                    min={0}
                    step="any"
                    value={room[key]}
                    onChange={(e) =>
                      onChange(
                        value.map((v, i) =>
                          i === index
                            ? {
                                ...v,
                                [key]: [
                                  'length',
                                  'width',
                                  'wastePercent',
                                ].includes(key)
                                  ? Number(e.target.value)
                                  : e.target.value,
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
              {(['stairs', 'landing'] as const).map((key) => (
                <label className="ops-field ops-toggle" key={key}>
                  {key === 'stairs' ? 'Includes stairs' : 'Includes landing'}
                  <input
                    type="checkbox"
                    checked={room[key]}
                    onChange={(e) =>
                      onChange(
                        value.map((v, i) =>
                          i === index ? { ...v, [key]: e.target.checked } : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="ops-calculated">
              <span>
                Measured area <strong>{calculated.area.toFixed(2)} m²</strong>
              </span>
              <span>
                Quantity with waste{' '}
                <strong>{calculated.requiredQuantity.toFixed(2)} m²</strong>
              </span>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="btn ops-add-line"
        onClick={() =>
          onChange([
            ...value,
            {
              name: '',
              length: 0,
              width: 0,
              wastePercent: 10,
              stairs: false,
              landing: false,
              underlay: '',
              accessories: '',
              notes: '',
            },
          ])
        }
      >
        <Plus size={15} />
        Add a room
      </button>
    </div>
  );
}
type Quote = {
  lines: { productId: string; quantity: number; unitPricePence: number }[];
  underlayPence: number;
  accessoriesPence: number;
  fittingPence: number;
  removalPence: number;
  deliveryPence: number;
  discountPence: number;
  costPence: number;
};
function QuoteEditor({
  value,
  onChange,
  products,
  measuredQuantity,
  canViewCosts,
}: {
  canViewCosts: boolean;
  measuredQuantity: number;
  value: Quote;
  onChange: (value: unknown) => void;
  products: Lookup[];
}) {
  const total =
    value.lines.reduce(
      (sum, v) => sum + Math.round(v.quantity * v.unitPricePence),
      0,
    ) +
    value.underlayPence +
    value.accessoriesPence +
    value.fittingPence +
    value.removalPence +
    value.deliveryPence -
    value.discountPence;
  return (
    <div className="ops-line-editor">
      {value.lines.map((line, index) => (
        <div key={index} className="ops-quote-line">
          <label className="ops-field ops-field-wide">
            Product {index + 1}
            <select
              className="input"
              required
              value={line.productId}
              onChange={(e) =>
                onChange({
                  ...value,
                  lines: value.lines.map((v, i) =>
                    i === index
                      ? {
                          ...v,
                          productId: e.target.value,
                          unitPricePence:
                            products.find((p) => p.id === e.target.value)
                              ?.sellingPricePence ?? v.unitPricePence,
                        }
                      : v,
                  ),
                })
              }
            >
              <option value="">Select a product…</option>
              {products.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ops-field">
            Quantity ·{' '}
            {products.find((p) => p.id === line.productId)?.unit ??
              'select product'}
            <input
              className="input"
              type="number"
              step={
                products.find((p) => p.id === line.productId)?.unit ===
                  'Each' ||
                products.find((p) => p.id === line.productId)?.unit === 'Pack'
                  ? 1
                  : 0.001
              }
              min={0.001}
              aria-label={'Quantity for product ' + (index + 1)}
              value={line.quantity}
              onChange={(e) =>
                onChange({
                  ...value,
                  lines: value.lines.map((v, i) =>
                    i === index
                      ? { ...v, quantity: Number(e.target.value) }
                      : v,
                  ),
                })
              }
            />
          </label>
          {products.find((p) => p.id === line.productId)?.unit === 'm²' &&
            measuredQuantity > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() =>
                  onChange({
                    ...value,
                    lines: value.lines.map((v, i) =>
                      i === index
                        ? {
                            ...v,
                            quantity:
                              Math.round(measuredQuantity * 1000) / 1000,
                          }
                        : v,
                    ),
                  })
                }
              >
                Use measured area · {measuredQuantity.toFixed(2)} m²
              </button>
            )}
          <label className="ops-field">
            Unit price (£)
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              value={line.unitPricePence / 100}
              onChange={(e) =>
                onChange({
                  ...value,
                  lines: value.lines.map((v, i) =>
                    i === index
                      ? {
                          ...v,
                          unitPricePence: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        }
                      : v,
                  ),
                })
              }
            />
          </label>
          <button
            type="button"
            className="ops-remove"
            aria-label={'Remove quote line ' + (index + 1)}
            onClick={() =>
              onChange({
                ...value,
                lines: value.lines.filter((_, i) => i !== index),
              })
            }
          >
            <X size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn ops-add-line"
        onClick={() =>
          onChange({
            ...value,
            lines: [
              ...value.lines,
              { productId: '', quantity: 1, unitPricePence: 0 },
            ],
          })
        }
      >
        <Plus size={15} />
        Add quote product
      </button>
      <p className="floor-helper">
        Add flooring, underlay and accessories as product lines whenever stock
        must be purchased or allocated. Extra charges below affect price only.
      </p>
      <div className="ops-form-grid ops-quote-costs">
        {(
          [
            'underlayPence',
            'accessoriesPence',
            'fittingPence',
            'removalPence',
            'deliveryPence',
            'discountPence',
            'costPence',
          ] as const
        )
          .filter((key) => key !== 'costPence' || canViewCosts)
          .map((key) => (
            <label className="ops-field" key={key}>
              {key === 'costPence'
                ? 'Estimated total cost'
                : key
                    .replace('Pence', '')
                    .replace(/^./, (c) => c.toUpperCase())}{' '}
              (£)
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                value={value[key] / 100}
                onChange={(e) =>
                  onChange({
                    ...value,
                    [key]: Math.round(Number(e.target.value) * 100),
                  })
                }
              />
            </label>
          ))}
      </div>
      <div className="ops-quote-total">
        <span>Quote total</span>
        <strong>{money(total)}</strong>
      </div>
    </div>
  );
}
