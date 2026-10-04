import { businessModules, canUseModule, type BusinessModule } from './business-modules';
import { hasPermission, roles, type Staff } from '../server/permissions';

/** Navigation policy only. Every API must independently enforce authorization. */
export function canAccessWorkspace(staff: Staff | null | undefined, input: string): boolean {
  if (!staff?.active || !roles.includes(staff.role)) return false;
  if (!input.startsWith('/') || input.startsWith('//')) return false;
  const path = input.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  if (['/', '/work', '/login', '/notifications', '/documents', '/settings'].includes(path)) return true;
  if (path === '/settings/business') return hasPermission(staff, 'settings.write');
  if (path === '/design-system') return staff.role === 'Management';
  if (path === '/flooring/fitting') return ['Management', 'Team Lead', 'Customer Service & Sales', 'Installer'].includes(staff.role);
  if (path === '/products') return hasPermission(staff, 'catalogue.write') || hasPermission(staff, 'orders.write') || hasPermission(staff, 'inventory.write') || staff.role === 'Accounts';
  if (path === '/suppliers') return hasPermission(staff, 'catalogue.write') || hasPermission(staff, 'orders.write') || hasPermission(staff, 'inventory.write');
  if (path === '/inventory') return hasPermission(staff, 'inventory.write');
  if (path === '/purchasing' || path === '/supplier-tracking' || (segments[0] === 'purchasing' && segments.length === 3 && segments[2] === 'print')) return hasPermission(staff, 'approvals.write');
  if (path === '/reports') return hasPermission(staff, 'reports.read');
  if (path === '/integrations/shopify') return ['Management', 'Team Lead', 'Shopify Store Manager'].includes(staff.role);
  if (path === '/orders/new') return hasPermission(staff, 'orders.write');
  if (path === '/reviews' || (segments[0] === 'orders' && segments.length === 3 && segments[2] === 'review')) return hasPermission(staff, 'approvals.write');
  if (path === '/orders' || (segments[0] === 'orders' && segments.length === 2)) return hasPermission(staff, 'commerce.read');
  if (path === '/invoices/new') return hasPermission(staff, 'invoices.write');
  if (path === '/invoices' || path === '/accounts' || (segments[0] === 'invoices' && segments.length === 2)) return hasPermission(staff, 'commerce.read');
  if (['/assembly', '/communications', '/assistant'].includes(path)) return hasPermission(staff, 'commerce.read');
  if (segments.length === 1 && Object.hasOwn(businessModules, segments[0])) return canUseModule(staff.role, segments[0] as BusinessModule);
  return false;
}

export const staffWorkspaceLinks = [
  { href: '/', label: 'Overview' },
  { href: '/products', label: 'Products' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/inventory', label: 'Stock & receiving' },
  { href: '/deliveries', label: 'Delivery jobs' },
  { href: '/assembly-jobs', label: 'Assembly jobs' },
  { href: '/flooring/fitting', label: 'Flooring fitting' },
  { href: '/tasks', label: 'Tasks & follow-ups' },
  { href: '/approvals', label: 'Approval requests' },
  { href: '/reports', label: 'Reports' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/documents', label: 'Documents' },
  { href: '/settings', label: 'My account' },
] as const;
