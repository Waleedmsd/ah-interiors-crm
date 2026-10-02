'use client';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CreditCard,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  ShoppingBag,
  UserRound,
  Wallet,
} from 'lucide-react';
import { useWorkspace } from '@/components/workspace-provider';
import { StudioReveal } from '@/components/studio-motion';
import { InvoiceStatus, pounds } from '@/components/invoice-list';
import { accountTotals, invoiceTotals, type Customer } from '@/lib/commerce';
import { currentStatus } from '@/lib/operations';
import { money } from '@/lib/demo-data';
import { StatusPill } from '@/components/page-ui';
export function StudioCustomerProfile({ customer }: { customer: Customer }) {
  const { cases, invoices, now } = useWorkspace();
  const orders = cases.filter((order) => order.customerId === customer.id);
  const linked = invoices.filter(
    (invoice) => invoice.customerId === customer.id,
  );
  const totals = accountTotals(linked, now);
  const initials = customer.name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join('');
  const channels = [...new Set(orders.map((order) => order.channel))];
  return (
    <div className="page studio-customer-profile">
      <Link href="/customers" className="back-link">
        <ArrowLeft size={15} /> Customers
      </Link>
      <StudioReveal className="studio-overview-head">
        <div className="studio-page-title">
          <span className="studio-kicker">CUSTOMER / {customer.id}</span>
          <h1>{customer.name}</h1>
        </div>
        <div className="studio-kpi-strip">
          <div className="studio-kpi">
            <span className="studio-kpi-icon">
              <Wallet />
            </span>
            <div>
              <strong>{pounds(totals.invoiced)}</strong>
              <p>Total invoiced</p>
            </div>
          </div>
          <div className="studio-kpi">
            <span className="studio-kpi-icon">
              <ShoppingBag />
            </span>
            <div>
              <strong>
                {orders.length.toString().padStart(2, '0')}{' '}
                <span className="studio-mini-tag cobalt">Orders</span>
              </strong>
              <p>With AH Interiors</p>
            </div>
          </div>
          <div className="studio-kpi">
            <span className="studio-kpi-icon">
              <CreditCard />
            </span>
            <div>
              <strong>{pounds(totals.outstanding)}</strong>
              <p>Outstanding balance</p>
            </div>
          </div>
        </div>
      </StudioReveal>
      <div className="studio-dashboard-grid">
        <div className="studio-work-column">
          <StudioReveal className="glass-panel" delay={0.05}>
            <div className="studio-panel-heading">
              <div>
                <h2>
                  Invoice history <span>{linked.length}</span>
                </h2>
                <p>One account. Every payment.</p>
              </div>
              <Link
                className="studio-round"
                href={'/invoices/new?customer=' + customer.id}
                aria-label={'Create invoice for ' + customer.name}
              >
                <Plus />
              </Link>
            </div>
            <div className="studio-invoice-cards">
              {linked.map((invoice) => {
                const value = invoiceTotals(invoice);
                const colour =
                  invoice.lifecycle === 'Draft'
                    ? 'mist'
                    : value.balance > 0
                      ? 'lemon'
                      : 'teal';
                return (
                  <Link
                    className={'studio-invoice-tile card-' + colour}
                    href={'/invoices/' + invoice.id}
                    key={invoice.id}
                  >
                    <div className="studio-card-top">
                      <span>{invoice.issueDate}</span>
                      <span className="studio-card-open">
                        <ArrowUpRight size={16} />
                      </span>
                    </div>
                    <strong>{invoice.id}</strong>
                    <p>
                      {invoice.orderId
                        ? 'Order #' + invoice.orderId
                        : 'Standalone invoice'}
                    </p>
                    <div className="studio-invoice-tile-bottom">
                      <span>{pounds(value.total)}</span>
                      <InvoiceStatus invoice={invoice} now={now} />
                    </div>
                    <small>
                      {invoice.lifecycle === 'Issued'
                        ? pounds(value.balance) +
                          ' remaining · due ' +
                          invoice.dueDate
                        : invoice.lifecycle + ' · not due'}
                    </small>
                  </Link>
                );
              })}
              {!linked.length && (
                <div className="studio-empty">
                  <FileText />
                  <h3>No invoices yet</h3>
                  <p>Create the first invoice for this customer.</p>
                </div>
              )}
            </div>
          </StudioReveal>
          <StudioReveal className="glass-panel" delay={0.1}>
            <div className="studio-panel-heading">
              <div>
                <h2>
                  Order history <span>{orders.length}</span>
                </h2>
                <p>From selection to their front door.</p>
              </div>
              <Link
                className="studio-round"
                href={'/orders/new?customer=' + customer.id}
                aria-label={'Create order for ' + customer.name}
              >
                <Plus />
              </Link>
            </div>
            <div className="studio-customer-orders">
              {orders.map((order) => (
                <Link
                  className="studio-customer-order"
                  href={'/orders/' + order.id}
                  key={order.id}
                >
                  <span className="studio-order-item-icon">
                    <ShoppingBag size={22} />
                  </span>
                  <div>
                    <strong>{order.product}</strong>
                    <span>
                      #{order.id} · {order.channel} · {order.date}
                    </span>
                  </div>
                  <div className="studio-order-item-value">
                    <strong>{money(order.total, 2)}</strong>
                    <StatusPill
                      tone={
                        currentStatus(order) === 'Complete' ? 'green' : 'blue'
                      }
                    >
                      {currentStatus(order)}
                    </StatusPill>
                  </div>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
              {!orders.length && (
                <div className="studio-empty">
                  <ShoppingBag />
                  <h3>No orders yet</h3>
                  <p>Their next purchase starts here.</p>
                </div>
              )}
            </div>
          </StudioReveal>
          <StudioReveal
            className="glass-panel studio-account-summary"
            delay={0.15}
          >
            <div className="studio-panel-heading">
              <h2>Account overview</h2>
              <span className="studio-mini-tag">GBP</span>
            </div>
            <div className="studio-account-values">
              <div>
                <span>Payments recorded</span>
                <strong>{pounds(totals.paid)}</strong>
              </div>
              <div>
                <span>Open balance</span>
                <strong>{pounds(totals.outstanding)}</strong>
              </div>
              <div>
                <span>Overdue</span>
                <strong>{pounds(totals.overdue)}</strong>
              </div>
            </div>
            <div className="studio-account-progress">
              <progress
                max={Math.max(totals.invoiced, 1)}
                value={totals.paid}
                aria-label="Customer invoiced amount paid"
              />
              <span>
                {totals.invoiced
                  ? Math.round((totals.paid / totals.invoiced) * 100)
                  : 0}
                % of issued invoices paid
              </span>
            </div>
            <p className="studio-panel-note">
              Issued invoices keep their original billing details. Standalone
              payments do not change unrelated orders.
            </p>
          </StudioReveal>
        </div>
        <aside className="studio-context-column studio-profile-context">
          <StudioReveal className="glass-panel studio-owner-card" delay={0.08}>
            <div className="studio-owner-top">
              <span>
                <i /> CUSTOMER ACCOUNT
              </span>
              <span className="studio-mini-tag">{customer.id}</span>
            </div>
            <div className="studio-owner-monogram studio-customer-monogram">
              {initials}
            </div>
            <h2>{customer.name}</h2>
            <p>
              {customer.city} · {customer.postcode}
            </p>
            <div className="studio-owner-actions">
              <a
                className="studio-round"
                href={'mailto:' + customer.email}
                aria-label={'Email ' + customer.name}
              >
                <Mail />
              </a>
              {customer.phone && (
                <a
                  className="studio-round"
                  href={'tel:' + customer.phone.replace(/[^\d+]/g, '')}
                  aria-label={'Call ' + customer.name}
                >
                  <Phone />
                </a>
              )}
              <Link
                className="studio-round"
                href={'/orders/new?customer=' + customer.id}
                aria-label="Create customer order"
              >
                <Plus />
              </Link>
              <Link
                className="studio-round"
                href={'/invoices/new?customer=' + customer.id}
                aria-label="Create customer invoice"
              >
                <FileText />
              </Link>
            </div>
            <div className="studio-source-pills">
              {channels.map((channel) => (
                <span key={channel}>{channel}</span>
              ))}
            </div>
          </StudioReveal>
          <StudioReveal
            className="glass-panel studio-profile-details"
            delay={0.13}
          >
            <div className="studio-panel-heading">
              <h2>Detailed information</h2>
              <UserRound size={16} />
            </div>
            <dl>
              {[
                { label: 'Full name', value: customer.name, Icon: UserRound },
                { label: 'Email', value: customer.email, Icon: Mail },
                {
                  label: 'Phone number',
                  value: customer.phone || 'Not provided',
                  Icon: Phone,
                },
                {
                  label: 'Delivery address',
                  value:
                    customer.address +
                    ', ' +
                    customer.city +
                    ', ' +
                    customer.postcode,
                  Icon: MapPin,
                },
              ].map(({ label, value, Icon }) => (
                <div key={label}>
                  <dt>
                    <Icon size={16} />
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="studio-profile-cta">
              <Link
                className="btn btn-primary full-width"
                href={'/orders/new?customer=' + customer.id}
              >
                <Plus size={16} /> Create order
              </Link>
              <Link
                className="btn full-width"
                href={'/invoices/new?customer=' + customer.id}
              >
                Create invoice <ArrowUpRight size={16} />
              </Link>
            </div>
          </StudioReveal>
          <p className="studio-panel-note">
            Customer records are saved on this browser.
          </p>
        </aside>
      </div>
    </div>
  );
}
