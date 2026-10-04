import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = process.env.APP_ORIGIN ?? 'http://localhost:3001';
assert.equal(process.env.CI, 'true', 'Use only disposable CI fixtures.');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
assert.ok(process.env.SEED_PASSWORD);
const root = '.runtime/ci-evidence/staff-browser';
await mkdir(root, { recursive: true });
const plans = [
  { role: 'Management', routes: ['/', '/orders', '/products', '/settings/business'], forbidden: null },
  { role: 'Team Lead', routes: ['/', '/purchasing', '/inventory', '/approvals'], forbidden: '/settings/business' },
  { role: 'Customer Service & Sales', routes: ['/', '/orders', '/products', '/deliveries', '/flooring', '/service-cases'], forbidden: '/purchasing' },
  { role: 'Shopify Store Manager', routes: ['/', '/products', '/suppliers', '/tasks', '/settings'], forbidden: '/orders' },
  { role: 'Performance Marketing', routes: ['/', '/reports', '/settings', '/documents'], forbidden: '/orders' },
  { role: 'Warehouse', routes: ['/', '/inventory', '/deliveries', '/products'], forbidden: '/orders' },
  { role: 'Delivery', routes: ['/', '/deliveries', '/tasks', '/settings'], forbidden: '/assembly-jobs' },
  { role: 'Installer', routes: ['/', '/assembly-jobs', '/flooring/fitting', '/tasks', '/settings'], forbidden: '/flooring' },
  { role: 'Accounts', routes: ['/', '/invoices', '/expenses', '/reports', '/service-cases'], forbidden: '/purchasing' },
];
const browser = await chromium.launch({ headless: true });
const report = { checks: [], errors: [], failedRequests: [], failures: [] };
const escapeAnnotation = text => String(text).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
try {
  for (const plan of plans) {
    const key = plan.role.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    try {
      const login = await context.request.post(origin + '/api/auth/login', {
        headers: { Origin: origin },
        data: { email: `quality-${key}@ahinteriors.test`, password: process.env.SEED_PASSWORD },
      });
      assert.equal(login.status(), 200, `Fixture login failed for ${plan.role}`);
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push({ role: plan.role, message: error.message }));
      page.on('response', response => {
        if (response.url().startsWith(origin + '/api/') && response.status() >= 400) {
          report.failedRequests.push({ role: plan.role, path: new URL(response.url()).pathname, status: response.status() });
        }
      });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        for (const route of plan.routes) {
          const response = await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(120);
          const restricted = await page.getByRole('heading', { name: 'This workspace is restricted', exact: true }).count();
          const headings = await page.locator('h1').allTextContents();
          const overflow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
          const violations = axe.violations.filter(value => ['serious', 'critical'].includes(value.impact)).map(value => ({ id: value.id, impact: value.impact, nodes: value.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) }));
          report.checks.push({ role: plan.role, route, width, status: response?.status(), actualRoute: new URL(page.url()).pathname, headings, restricted, overflow, violations });
          if (response?.status() !== 200 || new URL(page.url()).pathname !== route || restricted || !headings.length || overflow.content > overflow.viewport + 1 || violations.length) report.failures.push({ role: plan.role, route, width, reason: 'Role workspace rendering, accessibility or layout check failed.' });
          await page.screenshot({ path: `${root}/${key}-${route === '/' ? 'home' : route.slice(1).replaceAll('/', '-')}-${width}.png`, fullPage: true });
        }
        if (plan.forbidden) {
          await page.goto(origin + plan.forbidden, { waitUntil: 'networkidle' });
          assert.equal(await page.getByRole('heading', { name: 'This workspace is restricted', exact: true }).count(), 1, `${plan.role} must not mount ${plan.forbidden}`);
          assert.equal(await page.getByRole('link', { name: 'Return to my workspace' }).count(), 1);
        }
      }
      // A forbidden route must not start a protected data request. API access itself
      // is verified by the separate PostgreSQL authorization integration tests.
      await context.request.post(origin + '/api/auth/logout', { headers: { Origin: origin } });
      assert.equal((await context.request.get(origin + '/api/auth/me')).status(), 401, `${plan.role}: session must end after logout`);
    } catch (error) {
      report.failures.push({ role: plan.role, reason: error.message });
    } finally { await context.close(); }
  }
} finally {
  await writeFile(root + '/report.json', JSON.stringify(report, null, 2));
  console.log('STAFF_BROWSER_SUMMARY', JSON.stringify({ pages: report.checks.length, roles: plans.length, errors: report.errors, failedRequests: report.failedRequests, failures: report.failures }));
  const seen = new Set();
  for (const check of report.checks) for (const violation of check.violations) for (const node of violation.nodes) {
    const key = JSON.stringify([violation.id, node.target, node.summary]);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log('STAFF_ACCESSIBILITY_DIAGNOSTIC', JSON.stringify({ role: check.role, route: check.route, width: check.width, id: violation.id, ...node }));
  }
  if (report.failures.length || report.errors.length || report.failedRequests.length) {
    console.log(`::error title=Staff workspace verification::${escapeAnnotation(JSON.stringify({ failures: report.failures.slice(0, 10), errors: report.errors.slice(0, 5), failedRequests: report.failedRequests.slice(0, 10) }))}`);
  }
  await browser.close();
}
assert.equal(report.errors.length, 0, 'Uncaught staff UI errors.');
assert.equal(report.failedRequests.length, 0, 'A permitted workspace made unauthorized or failed API requests.');
assert.equal(report.failures.length, 0, 'Role navigation or accessibility checks failed. See staff-browser/report.json.');
assert.equal(report.checks.length, plans.reduce((total, plan) => total + plan.routes.length * 2, 0), 'All role and viewport scenarios must execute.');
console.log('::notice title=Staff workspace verification::All nine roles passed desktop/mobile route, accessibility and session checks.');
