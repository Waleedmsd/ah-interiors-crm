'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import { StatusPill } from '@/components/page-ui';
import { useAuth } from '@/components/auth-context';
import { hasPermission } from '@/server/permissions';
import { stockUnits } from '@/lib/stock-units';
import { emptyCosts } from '@/lib/margin';
type Row = {
  id: string;
  name: string;
  sku?: string;
  supplierSku?: string;
  code?: string;
  version?: number;
  status?: string;
  active?: boolean;
  supplierId?: string;
  supplierCostPence?: number;
  sellingPricePence?: number;
  details: Record<string, unknown>;
  profitability?: {
    tier: string;
    grossProfitPence: number;
    contributionProfitPence: number;
    contributionMarginBps: number;
  };
};
type Field = {
  path: string;
  label: string;
  type?: 'money' | 'number' | 'boolean' | 'textarea' | 'select' | 'date';
  options?: { value: string; label: string }[];
};
const costs = Object.keys(emptyCosts).map((key) => ({
  path: 'details.costs.' + key,
  label: key.replace(/Pence$/, '').replace(/([A-Z])/g, ' $1') + ' (£)',
  type: 'money' as const,
}));
const supplierFields: Field[] = [
  { path: 'name', label: 'Supplier name' },
  { path: 'code', label: 'Supplier code' },
  { path: 'active', label: 'Active', type: 'boolean' },
  ...[
    'brands',
    'contact',
    'email',
    'phone',
    'address',
    'accountReference',
    'paymentTerms',
    'deliveryTerms',
    'notes',
  ].map((key) => ({
    path: 'details.' + key,
    label: key.replace(/([A-Z])/g, ' $1'),
  })),
  {
    path: 'details.leadTimeDays',
    label: 'Standard lead time (days)',
    type: 'number',
  },
  {
    path: 'details.collectionRequired',
    label: 'Collection required',
    type: 'boolean',
  },
];
const productFields: Field[] = [
  {
    path: 'details.stockUnit',
    label: 'Stock / purchase unit',
    type: 'select',
    options: stockUnits.map((v) => ({ value: v, label: v })),
  },
  { path: 'name', label: 'Product name' },
  { path: 'sku', label: 'AH SKU' },
  { path: 'supplierId', label: 'Supplier', type: 'select' },
  { path: 'supplierSku', label: 'Supplier SKU' },
  { path: 'category', label: 'Category' },
  {
    path: 'status',
    label: 'Product status',
    type: 'select',
    options: ['Active', 'Inactive', 'Discontinued'].map((v) => ({
      value: v,
      label: v,
    })),
  },
  ...[
    'brand',
    'subcategory',
    'article',
    'barcode',
    'websiteUrl',
    'shopifyProductId',
    'shopifyVariantId',
    'ebayListingId',
    'packDimensions',
    'notes',
  ].map((key) => ({
    path: 'details.' + key,
    label: key.replace(/([A-Z])/g, ' $1'),
  })),
  {
    path: 'details.websiteStatus',
    label: 'Website status',
    type: 'select',
    options: ['Draft', 'Published', 'Hidden'].map((v) => ({
      value: v,
      label: v,
    })),
  },
  ...['widthMm', 'heightMm', 'depthMm', 'weightKg', 'packQuantity'].map(
    (key) => ({
      path: 'details.' + key,
      label: key.replace(/([A-Z])/g, ' $1'),
      type: 'number' as const,
    }),
  ),
  {
    path: 'supplierCostPence',
    label: 'Supplier cost (£, excluding reclaimable VAT)',
    type: 'money',
  },
  {
    path: 'sellingPricePence',
    label: 'Selling price (£, VAT inclusive for Standard)',
    type: 'money',
  },
  {
    path: 'details.vatTreatment',
    label: 'VAT treatment',
    type: 'select',
    options: ['Standard', 'Zero rated', 'Exempt'].map((v) => ({
      value: v,
      label: v,
    })),
  },
  {
    path: 'details.discountPence',
    label: 'Discount (£, deducted once)',
    type: 'money',
  },
  ...costs,
];
function blank(module: 'products' | 'suppliers') {
  return module === 'suppliers'
    ? {
        name: '',
        code: '',
        active: true,
        details: {
          brands: '',
          contact: '',
          email: '',
          phone: '',
          address: '',
          accountReference: '',
          paymentTerms: '',
          leadTimeDays: 0,
          deliveryTerms: '',
          collectionRequired: false,
          notes: '',
        },
      }
    : {
        name: '',
        sku: '',
        supplierId: '',
        supplierSku: '',
        category: 'Furniture',
        status: 'Active',
        supplierCostPence: 0,
        sellingPricePence: 0,
        details: {
          stockUnit: 'Each',
          brand: '',
          subcategory: '',
          article: '',
          barcode: '',
          notes: '',
          websiteUrl: '',
          shopifyProductId: '',
          shopifyVariantId: '',
          ebayListingId: '',
          websiteStatus: 'Draft',
          widthMm: 0,
          heightMm: 0,
          depthMm: 0,
          weightKg: 0,
          packQuantity: 1,
          packDimensions: '',
          vatTreatment: 'Standard',
          discountPence: 0,
          costs: { ...emptyCosts },
        },
      };
}
const displayValue = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';
function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value as Record<string, unknown>)?.[key],
      record,
    );
}

import {
  Package,
  Truck,
  Plus,
  Search,
  ArrowUpRight,
  Check,
} from 'lucide-react';
import { BusinessFormPanel } from '@/components/business-form-panel';
export function CatalogueWorkspace({
  module,
}: {
  module: 'products' | 'suppliers';
}) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]),
    [suppliers, setSuppliers] = useState<Row[]>([]),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('All');
  const [form, setForm] = useState<Record<string, unknown> | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState('');
  const [history, setHistory] = useState<
    {
      id: number;
      supplierCostPence: number;
      sellingPricePence: number;
      at: string;
    }[]
  >([]);
  const editable = !!user && hasPermission(user, 'catalogue.write'),
    isProduct = module === 'products',
    Icon = isProduct ? Package : Truck;
  const financial =
    !!user && ['Management', 'Team Lead', 'Accounts'].includes(user.role);
  const label = isProduct ? 'product' : 'supplier',
    fields = isProduct
      ? productFields.filter(
          (field) =>
            (user?.role !== 'Warehouse' ||
              [
                'name',
                'sku',
                'supplierId',
                'supplierSku',
                'category',
                'status',
                'details.packQuantity',
                'details.packDimensions',
                'details.stockUnit',
              ].includes(field.path)) &&
            (financial ||
              (![
                'supplierCostPence',
                'details.vatTreatment',
                'details.discountPence',
              ].includes(field.path) &&
                !field.path.startsWith('details.costs.'))),
        )
      : supplierFields;
  const load = useCallback(async () => {
    setRows(await apiRequest<Row[]>('/api/' + module));
    if (isProduct && editable)
      setSuppliers(await apiRequest<Row[]>('/api/suppliers'));
  }, [module, isProduct, editable]);
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<Row[]>('/api/' + module),
      isProduct && editable
        ? apiRequest<Row[]>('/api/suppliers')
        : Promise.resolve([] as Row[]),
    ])
      .then(([records, partners]) => {
        if (active) {
          setRows(records);
          setSuppliers(partners);
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
  }, [module, isProduct, editable]);
  function change(path: string, value: unknown) {
    setForm((current) => {
      const next = structuredClone(current!);
      const keys = path.split('.');
      let node = next;
      for (const key of keys.slice(0, -1))
        node = node[key] as Record<string, unknown>;
      node[keys.at(-1)!] = value;
      return next;
    });
  }
  const filtered = rows.filter(
    (row) =>
      [row.name, row.sku, row.code, row.details.article, row.supplierSku]
        .join(' ')
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (status === 'All' ||
        status === (row.status ?? (row.active ? 'Active' : 'Inactive')) ||
        status === row.profitability?.tier),
  );
  const metrics = isProduct
    ? [
        {
          name: 'Products in catalogue',
          value: rows.length,
          caption: 'Your shared product master',
        },
        {
          name: 'Active products',
          value: rows.filter((r) => r.status === 'Active').length,
          caption: 'Available to your sales team',
        },
        {
          name: 'Connected suppliers',
          value: new Set(rows.map((r) => r.supplierId).filter(Boolean)).size,
          caption: 'Across your product range',
        },
        {
          name: financial ? 'Margin review' : 'Published online',
          value: rows.filter((r) =>
            financial
              ? r.profitability?.tier === 'Approval Required'
              : r.details.websiteStatus === 'Published',
          ).length,
          caption: financial
            ? 'Products below your threshold'
            : 'Products marked as published',
        },
      ]
    : [
        {
          name: 'Supplier partners',
          value: rows.length,
          caption: 'All supplier relationships',
        },
        {
          name: 'Active accounts',
          value: rows.filter((r) => r.active).length,
          caption: 'Available for new purchases',
        },
        {
          name: 'Collection required',
          value: rows.filter((r) => r.details.collectionRequired).length,
          caption: 'Plan your collection runs',
        },
        {
          name: 'Inactive accounts',
          value: rows.filter((r) => !r.active).length,
          caption: 'Retained for reference',
        },
      ];
  function section(field: Field) {
    if (!isProduct) {
      if (['name', 'code', 'active', 'details.brands'].includes(field.path))
        return 'Supplier profile';
      if (
        [
          'details.contact',
          'details.email',
          'details.phone',
          'details.address',
        ].includes(field.path)
      )
        return 'Contact information';
      return 'Trading terms & notes';
    }
    if (
      [
        'supplierCostPence',
        'sellingPricePence',
        'details.vatTreatment',
        'details.discountPence',
      ].includes(field.path) ||
      field.path.startsWith('details.costs.')
    )
      return 'Pricing & profitability';
    if (
      /widthMm|heightMm|depthMm|weightKg|packQuantity|packDimensions/.test(
        field.path,
      )
    )
      return 'Dimensions & packaging';
    if (/website|shopify|ebay/.test(field.path))
      return 'Website & marketplaces';
    return 'Product identity';
  }
  const sections = [...new Set(fields.map(section))];
  const params = useSearchParams();
  const incoming = params.get('record');
  const handledLink = useRef('');
  useEffect(() => {
    if (!loading && incoming && handledLink.current !== incoming) {
      handledLink.current = incoming;
      const row = rows.find((v) => v.id === incoming);
      if (row) void open(row);
      else setError('This record is unavailable or you do not have access.');
    }
  }, [incoming, loading, rows]);
  async function open(row: Row) {
    setError('');
    setSelected(row);
    const base = blank(module);
    if (isProduct && !financial) {
      delete (base as Record<string, unknown>).supplierCostPence;
      for (const key of ['vatTreatment', 'discountPence', 'costs'])
        delete (base.details as Record<string, unknown>)[key];
    }
    setForm(
      Object.fromEntries(
        Object.keys(base).map((key) => [
          key,
          (row as unknown as Record<string, unknown>)[key] ??
            (base as Record<string, unknown>)[key],
        ]),
      ),
    );
    try {
      setHistory(
        isProduct && financial && editable
          ? await apiRequest('/api/products/' + row.id + '/history')
          : [],
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const create = () => {
    setSelected(null);
    setForm(blank(module));
    setHistory([]);
    setError('');
  };
  return (
    <div className="page ops-page catalogue-page">
      <header className="ops-page-header">
        <div>
          <div className="ops-eyebrow">
            <Icon size={15} />
            {isProduct ? 'Catalogue' : 'Supply chain'}
            <span>/</span>AH Interiors
          </div>
          <h1>{isProduct ? 'Product Master' : 'Suppliers'}</h1>
          <p>
            {isProduct
              ? 'Your range, pricing and product knowledge. All in one place.'
              : 'Stronger supplier relationships. Clearer purchasing decisions.'}
          </p>
        </div>
        {editable && (!isProduct || financial) && (
          <button className="btn btn-primary ops-primary" onClick={create}>
            <Plus size={16} />
            Add {label}
          </button>
        )}
      </header>
      <div className="ops-stats">
        {metrics.map((metric, i) => (
          <div
            className={'ops-stat ' + ['blue', 'green', 'violet', 'amber'][i]}
            key={metric.name}
          >
            <span className="ops-stat-heading">
              {metric.name}
              <span className="ops-stat-icon">
                <Icon size={17} />
              </span>
            </span>
            <strong>{loading ? '—' : metric.value}</strong>
            <span className="ops-stat-caption">{metric.caption}</span>
          </div>
        ))}
      </div>
      {notice && (
        <output className="catalogue-notice">
          <Check size={15} />
          {notice}
        </output>
      )}
      {error && !form && (
        <p role="alert" className="ops-error">
          {error}
        </p>
      )}
      <section className="ops-collection">
        <div className="ops-collection-heading">
          <div>
            <h2>
              {isProduct ? 'Your product catalogue' : 'Your supplier network'}
              <span className="ops-total">{rows.length}</span>
            </h2>
            <p>
              {isProduct
                ? 'Consistent product details, from enquiry to fulfilment.'
                : 'Contacts, terms and trading relationships for your team.'}
            </p>
          </div>
        </div>
        <div className="ops-tabs">
          {[
            'All',
            'Active',
            'Inactive',
            ...(isProduct
              ? ['Discontinued', ...(financial ? ['Approval Required'] : [])]
              : []),
          ].map((tab) => (
            <button
              key={tab}
              aria-pressed={status === tab}
              onClick={() => setStatus(tab)}
            >
              {tab === 'All' ? 'All ' + module : tab}
            </button>
          ))}
        </div>
        <div className="ops-toolbar">
          <label className="ops-search">
            <Search size={17} />
            <input
              aria-label="Search catalogue"
              placeholder={
                isProduct
                  ? 'Search product name, SKU or article number…'
                  : 'Search supplier name or account code…'
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <span className="catalogue-count">
            {filtered.length} {module}
          </span>
        </div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>{isProduct ? 'Product' : 'Supplier'}</th>
                <th>{isProduct ? 'AH SKU' : 'Account code'}</th>
                <th>Status</th>
                {isProduct ? (
                  <>
                    <th>Selling price</th>
                    {financial && (
                      <>
                        <th>Contribution</th>
                        <th>Margin</th>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <th>Contact</th>
                    <th>Lead time</th>
                  </>
                )}
                <th aria-label="Edit">
                  <span className="sr-only">Edit</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="ops-record-link" aria-label={row.name}>
                      <span className="catalogue-product-icon">
                        <Icon size={22} strokeWidth={1.4} />
                      </span>
                      <div>
                        {true ? (
                          <button onClick={() => void open(row)}>
                            <strong>{row.name}</strong>
                          </button>
                        ) : (
                          <strong>{row.name}</strong>
                        )}
                        <small>
                          {displayValue(
                            row.details.brand ?? row.details.brands,
                          ) || 'AH Interiors partner'}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="ops-reference">{row.sku ?? row.code}</span>
                  </td>
                  <td>
                    <StatusPill>
                      {row.status ?? (row.active ? 'Active' : 'Inactive')}
                    </StatusPill>
                  </td>
                  {isProduct ? (
                    <>
                      <td className="catalogue-money">
                        {row.sellingPricePence !== undefined
                          ? '£' + (row.sellingPricePence / 100).toFixed(2)
                          : '—'}
                      </td>
                      {financial && (
                        <>
                          <td>
                            {row.profitability
                              ? '£' +
                                (
                                  row.profitability.contributionProfitPence /
                                  100
                                ).toFixed(2)
                              : '—'}
                          </td>
                          <td>
                            {row.profitability ? (
                              <span
                                className={
                                  'catalogue-margin ' +
                                  (row.profitability.tier ===
                                  'Approval Required'
                                    ? 'needs-review'
                                    : '')
                                }
                              >
                                {(
                                  row.profitability.contributionMarginBps / 100
                                ).toFixed(1)}
                                %<small>{row.profitability.tier}</small>
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <td>
                        <span className="catalogue-contact">
                          {displayValue(row.details.contact) || 'Not provided'}
                          <small>{displayValue(row.details.email)}</small>
                        </span>
                      </td>
                      <td>{Number(row.details.leadTimeDays ?? 0)} days</td>
                    </>
                  )}
                  <td>
                    {editable && (
                      <button
                        className="ops-open"
                        aria-label={'Edit ' + row.name}
                        onClick={() => void open(row)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading ? (
          <output className="ops-loading">
            Loading {module}…<div className="ops-skeleton" />
          </output>
        ) : (
          !filtered.length && (
            <div className="ops-empty">
              <span className="ops-art-card">
                <Icon size={33} />
              </span>
              <h3>
                {rows.length
                  ? 'No matching ' + module
                  : 'Start building your ' +
                    (isProduct ? 'catalogue' : 'supplier network')}
              </h3>
              <p>
                {rows.length
                  ? 'Try another search or view.'
                  : 'Add your first ' +
                    label +
                    ' to keep your team’s information together.'}
              </p>
              {editable && (!isProduct || financial) && (
                <button
                  className="btn btn-primary ops-primary"
                  onClick={create}
                >
                  <Plus size={15} />
                  Add {label}
                </button>
              )}
            </div>
          )
        )}
        <footer className="ops-table-footer">
          <span>
            {filtered.length} of {rows.length} records
          </span>
          <span>
            <span className="ops-connected-dot" />
            Shared product knowledge
          </span>
        </footer>
      </section>
      {form && (
        <BusinessFormPanel
          title={(selected ? (editable ? 'Edit ' : 'View ') : 'Add ') + label}
          description={
            selected?.name ??
            (isProduct
              ? 'Build a complete product record for sales, purchasing and fulfilment.'
              : 'Keep the people, terms and details behind a reliable supply chain together.')
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              setError('');
              try {
                await apiRequest(
                  '/api/' + module + (selected ? '/' + selected.id : ''),
                  {
                    method: selected ? 'PUT' : 'POST',
                    body: JSON.stringify({
                      ...form,
                      ...(selected && isProduct
                        ? { version: selected.version }
                        : {}),
                    }),
                  },
                );
                setForm(null);
                setNotice(
                  (isProduct ? 'Product' : 'Supplier') +
                    ' saved to your workspace.',
                );
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && (
              <p role="alert" className="ops-error">
                {error}
              </p>
            )}
            <fieldset
              disabled={!editable}
              style={{ border: 0, padding: 0, minWidth: 0 }}
            >
              {sections.map((name, index) => (
                <section className="ops-form-section" key={name}>
                  <div className="ops-section-label">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <h3>{name}</h3>
                  </div>
                  <div className="ops-form-grid">
                    {fields
                      .filter((f) => section(f) === name)
                      .map((field) => {
                        const value = valueAt(form, field.path);
                        return (
                          <label
                            className={
                              'ops-field ' +
                              (field.type === 'boolean' ? 'ops-toggle' : '')
                            }
                            key={field.path}
                          >
                            <span>
                              {field.label.replace(/^./, (c) =>
                                c.toUpperCase(),
                              )}
                            </span>
                            {field.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                checked={!!value}
                                onChange={(e) =>
                                  change(field.path, e.target.checked)
                                }
                              />
                            ) : field.type === 'select' ? (
                              <select
                                className="input"
                                required={field.path === 'supplierId'}
                                value={displayValue(value)}
                                onChange={(e) =>
                                  change(field.path, e.target.value)
                                }
                              >
                                <option value="">Select…</option>
                                {(field.path === 'supplierId'
                                  ? suppliers.map((v) => ({
                                      value: v.id,
                                      label: v.name,
                                    }))
                                  : (field.options ?? [])
                                ).map((v) => (
                                  <option key={v.value} value={v.value}>
                                    {v.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="input"
                                type={
                                  field.type === 'money' ||
                                  field.type === 'number'
                                    ? 'number'
                                    : field.path === 'details.email'
                                      ? 'email'
                                      : 'text'
                                }
                                required={['name', 'sku', 'code'].includes(
                                  field.path,
                                )}
                                step={field.type === 'money' ? '0.01' : 'any'}
                                min={
                                  field.type === 'money' ||
                                  field.type === 'number'
                                    ? 0
                                    : undefined
                                }
                                value={
                                  field.type === 'money'
                                    ? Number(value ?? 0) / 100
                                    : displayValue(value)
                                }
                                onChange={(e) =>
                                  change(
                                    field.path,
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
                      })}
                  </div>
                </section>
              ))}
            </fieldset>
            {!!history.length && (
              <section className="ops-form-section">
                <h3>Price history</h3>
                <div className="catalogue-history">
                  {history.map((v) => (
                    <div key={v.id}>
                      <span>{new Date(v.at).toLocaleDateString('en-GB')}</span>
                      <span>
                        Cost £{(v.supplierCostPence / 100).toFixed(2)}
                      </span>
                      <strong>
                        Price £{(v.sellingPricePence / 100).toFixed(2)}
                      </strong>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="business-save-bar">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              {editable && (
                <button className="btn btn-primary ops-primary" disabled={busy}>
                  <Check size={15} />
                  {busy ? 'Saving…' : 'Save ' + label}
                </button>
              )}
            </div>
          </form>
        </BusinessFormPanel>
      )}
    </div>
  );
}
