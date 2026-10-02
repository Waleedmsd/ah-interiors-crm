'use client';
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The scrollable navigation must remain keyboard-scrollable when its scrollbar is hidden. */
import { Layers2, Settings } from 'lucide-react';
import Link from 'next/link';
import { navigation, type Order } from './dashboard-data';
import { ProcessButton } from '@/components/process-button';
import { useWorkspace } from '@/components/workspace-provider';
import { invoiceTotals } from '@/lib/commerce';

export function Sidebar({
  onClose,
  currentPath,
}: {
  open?: boolean;
  onClose: () => void;
  currentPath: string;
}) {
  const { orders, cases, persistence, invoices } = useWorkspace();
  const items = navigation.map((item) =>
    item.href === '/orders'
      ? {
          ...item,
          count: orders.filter((order) => order.status === 'New').length,
        }
      : item.href === '/reviews'
        ? {
            ...item,
            count: cases.filter((order) => order.pack?.state === 'Draft')
              .length,
          }
        : item.href === '/invoices'
          ? {
              ...item,
              count: invoices.filter(
                (invoice) =>
                  invoice.lifecycle === 'Issued' &&
                  invoiceTotals(invoice).balance > 0,
              ).length,
            }
          : item,
  );
  return (
    <aside className="sidebar">
      <Link className="brand" href="/" onClick={onClose}>
        <span className="brand-symbol">
          <Layers2 />
        </span>
        amiro<span style={{ color: '#92809f', fontWeight: 400 }}>.</span>
      </Link>
      <div className="workspace-switch">
        <span className="workspace-monogram">AH</span>
        <div style={{ flex: 1 }}>
          <strong>AH Interiors</strong>
          <small>Operations workspace</small>
        </div>
      </div>
      <nav
        className="sidebar-nav"
        aria-label="Main navigation · scroll for more"
        tabIndex={0}
      >
        <p className="nav-heading">Workspace</p>
        <div className="nav-list">
          {items.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === '/'
                ? currentPath === '/'
                : item.href === '/reviews'
                  ? currentPath === '/reviews' ||
                    currentPath.endsWith('/review')
                  : (currentPath.startsWith(item.href) ||
                      (item.href === '/invoices' &&
                        currentPath === '/accounts')) &&
                    !currentPath.endsWith('/review');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={
                  'nav-link ' +
                  (item.href === '/assistant' ? 'assistant-nav' : '')
                }
                aria-current={active ? 'page' : undefined}
              >
                <Icon />
                <span>
                  {item.label === 'Overview' ? 'Overview' : item.label}
                </span>
                {item.href === '/assistant' ? (
                  <span className="nav-count">AI</span>
                ) : item.count ? (
                  <span className="nav-count">{item.count}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <p className="nav-heading sidebar-section-gap">Manage</p>
        <div className="nav-list">
          <Link
            href="/settings"
            className="nav-link"
            aria-current={currentPath === '/settings' ? 'page' : undefined}
            onClick={onClose}
          >
            <Settings />
            Settings
          </Link>
        </div>
      </nav>
      <div className="sidebar-preview">
        <strong>Local workspace</strong>Sample data · frontend preview.
        <br />
        {persistence === 'saved'
          ? 'Saved on this browser.'
          : persistence === 'loading'
            ? 'Loading local records…'
            : persistence === 'read-only'
              ? 'Read-only · another editing tab.'
              : 'Session only · storage unavailable.'}
      </div>
      <div className="profile-row">
        <span className="profile-avatar">AM</span>
        <div style={{ flex: 1 }}>
          <strong>Amir</strong>
          <small>Workspace owner</small>
        </div>
      </div>
    </aside>
  );
}

export function ProcessOrder({
  order,
}: {
  order: Order;
  processed: boolean;
  onProcess: () => void;
}) {
  return <ProcessButton id={order.id.replace(/^#/, '')} compact />;
}
