'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, LogOut, ShieldCheck } from 'lucide-react';
import { FlooringFittingWorkspace } from '@/components/flooring-fulfilment';
import { NotificationCenter } from '@/components/notification-center';
import DocumentsPage from '@/app/documents/page';
import { OperationalWorkspace } from '@/components/operational-workspace';
import { InventoryWorkspace } from '@/components/inventory-workspace';
import { CatalogueWorkspace } from '@/components/catalogue-workspace';
import { ReportsWorkspace } from '@/components/reports-workspace';
import { businessModules, type BusinessModule } from '@/lib/business-modules';
import { canAccessWorkspace, staffWorkspaceLinks } from '@/lib/workspace-access';
import { useAuth } from '@/components/auth-context';
import '@/app/staff-work.css';

export function StaffWork() {
  const { user, logout } = useAuth();
  const path = (usePathname() || '/').replace(/\/+$/, '') || '/';
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const links = staffWorkspaceLinks.filter(link => canAccessWorkspace(user, link.href));
  const module = path.slice(1);
  const permitted = canAccessWorkspace(user, path);
  const overview = path === '/' || path === '/work' || path === '/login';
  const account = path === '/settings';
  const current = links.find(link => link.href === path)?.label || 'My workspace';
  let content;
  if (!permitted) {
    content = <section className="staff-work-welcome"><h1>This workspace is restricted</h1><p>Choose one of your permitted workspaces below.</p></section>;
  } else if (overview && user.role === 'Performance Marketing') {
    content = <ReportsWorkspace />;
  } else if (overview) {
    content = <section className="staff-work-welcome"><span className="staff-work-eyebrow">YOUR AH INTERIORS WORKSPACE</span><h1>Good to see you, {user.name.split(' ')[0]}.</h1><p>Open a workspace to see your current records and next actions. Access is based on your staff role; delivery and fitting records remain assignment-restricted on the server.</p><div className="staff-work-cards">{links.filter(link => link.href !== '/' && link.href !== '/settings').map(link => <Link key={link.href} href={link.href}><strong>{link.label}</strong><ArrowUpRight size={18} aria-hidden="true" /></Link>)}</div></section>;
  } else if (account) {
    content = <section className="staff-work-welcome"><ShieldCheck size={28} aria-hidden="true" /><h1>My account</h1><dl className="staff-work-details"><dt>Name</dt><dd>{user.name}</dd><dt>Email</dt><dd>{user.email}</dd><dt>Role</dt><dd>{user.role}</dd><dt>Department</dt><dd>{user.department || 'Not assigned'}</dd></dl><p>Contact your workspace manager to change your access or reset your password.</p></section>;
  } else if (path === '/flooring/fitting') {
    content = <FlooringFittingWorkspace />;
  } else if (path === '/notifications') {
    content = <NotificationCenter />;
  } else if (path === '/documents') {
    content = <DocumentsPage />;
  } else if (path === '/reports') {
    content = <ReportsWorkspace />;
  } else if (path === '/inventory') {
    content = <InventoryWorkspace />;
  } else if (path === '/products' || path === '/suppliers') {
    content = <CatalogueWorkspace module={path === '/products' ? 'products' : 'suppliers'} />;
  } else if (path === '/integrations/shopify') {
    content = <section className="staff-work-welcome"><h1>Shopify is deferred</h1><p>Shopify connection work is outside the current release. No connection is made from this workspace.</p></section>;
  } else if (Object.hasOwn(businessModules, module)) {
    content = <OperationalWorkspace key={module} module={module as BusinessModule} />;
  } else {
    content = <section className="staff-work-welcome"><h1>Choose your workspace</h1><p>Use the navigation to open a permitted module.</p></section>;
  }
  return (
    <div className="staff-work-shell">
      <a className="staff-work-skip" href="#staff-work-content">Skip to workspace</a>
      <header className="staff-work-header">
        <Link href="/" className="staff-work-brand"><span aria-hidden="true">AH</span><span>AH Interiors<small>Staff workspace</small></span></Link>
        <div className="staff-work-account"><div><strong>{user.name}</strong><small>{user.role}</small></div><button type="button" className="staff-work-signout" disabled={signingOut} onClick={async () => { setSigningOut(true); try { await logout(); } finally { setSigningOut(false); } }}><LogOut size={16} aria-hidden="true" />{signingOut ? 'Signing out…' : 'Sign out'}</button></div>
      </header>
      <nav className="staff-work-nav" aria-label="My workspaces">{links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href || (overview && link.href === '/') ? 'page' : undefined}>{link.label}</Link>)}</nav>
      <main id="staff-work-content" aria-label={overview ? 'My workspace' : current} tabIndex={-1}>{content}</main>
    </div>
  );
}
