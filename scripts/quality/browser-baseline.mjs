import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = process.env.APP_ORIGIN ?? 'http://localhost:3001';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Browser checks must use an isolated local database.');
assert.ok(process.env.SEED_PASSWORD, 'A synthetic seed password is required.');
const root = '.runtime/ci-evidence/browser';
await mkdir(root, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const report = { origin, checks: [], errors: [], failedRequests: [] };
page.on('pageerror', error => report.errors.push(error.message));
page.on('response', response => { if (response.url().startsWith(origin + '/api/') && response.status() >= 500) report.failedRequests.push({ path: new URL(response.url()).pathname, status: response.status() }); });
const routes = ['/', '/customers', '/orders', '/products', '/suppliers', '/purchasing', '/supplier-tracking', '/inventory', '/deliveries', '/assembly-jobs', '/flooring', '/flooring/fitting', '/service-cases', '/tasks', '/invoices', '/expenses', '/approvals', '/reports', '/documents', '/communications', '/notifications', '/settings/business'];
try {
  await page.goto(origin + '/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: root + '/login.png', fullPage: true });
  await page.getByLabel('Work email', { exact: true }).fill('manager@ahinteriors.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.SEED_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(url => url.pathname === '/', { timeout: 20000 });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of routes) {
      const response = await page.goto(origin + route, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(180);
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      report.checks.push({ route, width, status: response?.status(), actualRoute: new URL(page.url()).pathname, overflow, violations: accessibility.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })) });
      await page.screenshot({ path: root + '/' + (route === '/' ? 'dashboard' : route.slice(1).replaceAll('/', '-')) + '-' + width + '.png', fullPage: true });
    }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  assert.equal(report.failedRequests.length, 0, JSON.stringify(report.failedRequests));
  assert.ok(report.checks.every(c => c.status === 200 && c.route === c.actualRoute), 'Every management route must actually open.');
  assert.ok(report.checks.every(c => c.overflow.content <= c.overflow.viewport + 1), 'Horizontal page overflow found. See browser report.');
  assert.ok(report.checks.every(c => !c.violations.some(v => ['critical', 'serious'].includes(v.impact))), 'Serious accessibility failures found. See browser report.');
} finally {
  await writeFile(root + '/report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
