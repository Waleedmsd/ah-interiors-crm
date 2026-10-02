import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = process.env.APP_ORIGIN,
  browser = await chromium.launch({ headless: true, channel: 'chrome' }),
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  }),
  page = await context.newPage();
const violations = [];
async function scan(name, selector) {
  await page.locator(selector).waitFor();
  await page.waitForTimeout(400);
  const result = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  violations.push(
    ...result.violations.map((v) => ({
      page: name,
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  console.log(
    name +
      ': ' +
      result.violations.reduce((sum, v) => sum + v.nodes.length, 0) +
      ' issues',
  );
}
try {
  await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  for (const [route, selector] of [
    ['deliveries', '.ops-page'],
    ['products', '.ops-page'],
    ['reports', '.ops-page'],
    ['', '.business-snapshot'],
  ]) {
    await page.goto(origin + '/' + route);
    await scan(route || 'dashboard', selector);
    if (route === 'deliveries') {
      await page
        .getByRole('button', { name: 'Create delivery job', exact: true })
        .first()
        .click();
      await scan('delivery drawer', '.ops-drawer');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  }
  await context.clearCookies();
  await page.goto(origin + '/login');
  await scan('login', '.login-page');
  fs.writeFileSync(
    'output/design/accessibility-final.json',
    JSON.stringify(violations, null, 2),
  );
  assert.deepEqual(
    violations,
    [],
    'The redesigned surfaces should have no detected WCAG A/AA violations.',
  );
} finally {
  await browser.close();
}
