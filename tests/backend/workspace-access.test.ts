import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessWorkspace, staffWorkspaceLinks } from '../../lib/workspace-access';
import { roles, type Staff, type Role } from '../../server/permissions';
const staff = (role: Role): Staff => ({ id: 'test-staff', name: 'Test Staff', email: 'staff@example.test', role, department: 'Test', active: true });

test('workspace routes deny inactive, missing and unknown principals', () => {
  assert.equal(canAccessWorkspace(null, '/'), false);
  assert.equal(canAccessWorkspace(undefined, '/'), false);
  assert.equal(canAccessWorkspace({ ...staff('Management'), active: false }, '/orders'), false);
  assert.equal(canAccessWorkspace({ ...staff('Management'), role: 'Unexpected' as Role }, '/'), false);
});

test('workspace routes do not confuse prefixes, unknown children or external URLs', () => {
  for (const path of ['/orders-export', '/orders/1/private', '/reports/unknown', '/settings/business/secrets', '/__proto__', '/constructor', '/integrations/shopify-credentials', '//outside.test', 'https://outside.test', '/inventory/unknown']) {
    assert.equal(canAccessWorkspace(staff('Management'), path), false, path);
  }
  assert.equal(canAccessWorkspace(staff('Management'), '/orders/123?tab=delivery'), true);
  assert.equal(canAccessWorkspace(staff('Management'), '/products/'), true);
});

test('all active staff retain a home, account and sign-out navigation route', () => {
  for (const role of roles) {
    for (const path of ['/', '/work', '/login', '/settings', '/notifications', '/documents']) assert.equal(canAccessWorkspace(staff(role), path), true, `${role}: ${path}`);
    const links = staffWorkspaceLinks.filter(link => canAccessWorkspace(staff(role), link.href));
    assert.ok(links.some(link => link.href === '/'));
    assert.ok(links.some(link => link.href === '/settings'));
  }
});

test('customer service has operational access without purchasing, management settings or stock administration', () => {
  const user = staff('Customer Service & Sales');
  for (const path of ['/customers', '/orders', '/orders/new', '/products', '/suppliers', '/deliveries', '/assembly-jobs', '/flooring', '/service-cases', '/invoices']) assert.equal(canAccessWorkspace(user, path), true, path);
  for (const path of ['/inventory', '/purchasing', '/supplier-tracking', '/settings/business', '/reports', '/orders/123/review', '/expenses']) assert.equal(canAccessWorkspace(user, path), false, path);
});

test('accounts retain finance and case visibility without ordering or inventory administration', () => {
  const user = staff('Accounts');
  for (const path of ['/orders', '/invoices', '/invoices/new', '/expenses', '/reports', '/products', '/service-cases']) assert.equal(canAccessWorkspace(user, path), true, path);
  for (const path of ['/orders/new', '/orders/123/review', '/inventory', '/purchasing', '/suppliers', '/settings/business']) assert.equal(canAccessWorkspace(user, path), false, path);
});

test('warehouse sees receiving and deliveries but never the financial ledger', () => {
  const user = staff('Warehouse');
  for (const path of ['/inventory', '/products', '/suppliers', '/deliveries', '/tasks']) assert.equal(canAccessWorkspace(user, path), true, path);
  for (const path of ['/orders', '/invoices', '/expenses', '/reports', '/settings/business', '/purchasing']) assert.equal(canAccessWorkspace(user, path), false, path);
});

test('delivery and installer workspaces stay distinct', () => {
  assert.equal(canAccessWorkspace(staff('Delivery'), '/deliveries'), true);
  assert.equal(canAccessWorkspace(staff('Delivery'), '/assembly-jobs'), false);
  assert.equal(canAccessWorkspace(staff('Delivery'), '/flooring/fitting'), false);
  assert.equal(canAccessWorkspace(staff('Installer'), '/assembly-jobs'), true);
  assert.equal(canAccessWorkspace(staff('Installer'), '/flooring/fitting'), true);
  assert.equal(canAccessWorkspace(staff('Installer'), '/flooring'), false);
  assert.equal(canAccessWorkspace(staff('Installer'), '/deliveries'), false);
});

test('marketing has reports without being shown other operational modules', () => {
  const user = staff('Performance Marketing');
  assert.equal(canAccessWorkspace(user, '/reports'), true);
  for (const path of ['/products', '/customers', '/orders', '/inventory', '/tasks', '/flooring', '/expenses', '/settings/business']) assert.equal(canAccessWorkspace(user, path), false, path);
});

test('merchandising and team lead permissions are explicit', () => {
  const merch = staff('Shopify Store Manager');
  assert.equal(canAccessWorkspace(merch, '/products'), true);
  assert.equal(canAccessWorkspace(merch, '/suppliers'), true);
  assert.equal(canAccessWorkspace(merch, '/inventory'), false);
  assert.equal(canAccessWorkspace(merch, '/orders'), false);
  const lead = staff('Team Lead');
  for (const path of ['/purchasing', '/purchasing/PO-123/print', '/supplier-tracking', '/orders/123/review', '/reports']) assert.equal(canAccessWorkspace(lead, path), true, path);
  assert.equal(canAccessWorkspace(lead, '/settings/business'), false);
  assert.equal(canAccessWorkspace(staff('Management'), '/settings/business'), true);
});
