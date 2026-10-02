'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { stableIdentity } from '@/lib/ui-preferences';
import { ArrowUpRight, Search, Users } from 'lucide-react';
import { CustomerPicker } from '@/components/customer-picker';
import { StudioReveal } from '@/components/studio-motion';
import { StudioCustomerProfile } from '@/components/studio-customer-profile';
import { useWorkspace } from '@/components/workspace-provider';
import { accountTotals } from '@/lib/commerce';
import { pounds } from '@/components/invoice-list';
export function CustomerWorkspace() {
  const { customers, cases, invoices, ready, now } = useWorkspace();
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const selected = customers.find(
    (customer) => customer.id === params.get('customer'),
  );
  if (selected)
    return <StudioCustomerProfile key={selected.id} customer={selected} />;
  const filtered = customers.filter((customer) =>
    [customer.name, customer.email, customer.city, customer.postcode]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="page studio-customers">
      <StudioReveal className="studio-overview-head">
        <div className="studio-page-title">
          <span className="studio-kicker">AH INTERIORS / RELATIONSHIPS</span>
          <h1>Customer directory.</h1>
        </div>
        <div className="studio-customer-heading-actions">
          <span className="studio-directory-count">
            <Users size={17} />
            {customers.length} customers
          </span>
          <CustomerPicker
            createOnly
            value=""
            onChange={(id) => router.push('/customers?customer=' + id)}
          />
        </div>
      </StudioReveal>
      <StudioReveal className="glass-panel studio-directory-panel" delay={0.07}>
        <div className="studio-panel-heading">
          <div>
            <h2>All customers</h2>
            <p>Orders, invoices and conversations. Connected.</p>
          </div>
          <label className="studio-directory-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a customer…"
              aria-label="Search customers"
            />
          </label>
        </div>
        <div className="studio-customer-grid">
          {filtered.map((customer) => {
            const linked = invoices.filter(
              (invoice) => invoice.customerId === customer.id,
            );
            const totals = accountTotals(linked, now);
            const orderCount = cases.filter(
              (order) => order.customerId === customer.id,
            ).length;
            return (
              <div key={customer.id}>
                <Link
                  className={
                    'studio-customer-card identity-' +
                    stableIdentity(customer.id)
                  }
                  href={'/customers?customer=' + customer.id}
                >
                  <div className="studio-customer-card-top">
                    <span>{customer.id}</span>
                    <ArrowUpRight size={18} />
                  </div>
                  <div className="studio-customer-avatar">
                    {customer.name
                      .trim()
                      .split(/\s+/)
                      .map((word) => word[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <h2>{customer.name}</h2>
                  <p>
                    {customer.city} · {customer.postcode}
                  </p>
                  <span className="studio-customer-email">
                    {customer.email}
                  </span>
                  <div className="studio-customer-card-stats">
                    <div>
                      <span>Orders</span>
                      <strong>{orderCount.toString().padStart(2, '0')}</strong>
                    </div>
                    <div>
                      <span>Invoices</span>
                      <strong>
                        {linked.length.toString().padStart(2, '0')}
                      </strong>
                    </div>
                    <div>
                      <span>Outstanding</span>
                      <strong>{pounds(totals.outstanding)}</strong>
                    </div>
                  </div>
                  {totals.overdue > 0 && (
                    <span className="studio-customer-overdue">
                      {pounds(totals.overdue)} overdue
                    </span>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
        {!filtered.length && (
          <div className="studio-empty">
            <Users />
            <h3>{ready ? 'No matching customers' : 'Loading customers…'}</h3>
            <p>Try another name, email address or postcode.</p>
            {query && (
              <button className="text-link" onClick={() => setQuery('')}>
                Clear search
              </button>
            )}
          </div>
        )}
        <div className="studio-board-footer">
          <span>{filtered.length} customers in this view</span>
          <span>One shared record per customer</span>
        </div>
      </StudioReveal>
    </div>
  );
}
