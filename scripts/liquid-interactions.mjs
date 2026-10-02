import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base = 'http://127.0.0.1:3001',
  out = 'output/liquid-studio/interactions';
await fs.mkdir(out, { recursive: true });
const b = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const results = [],
  issues = [];
async function pass(name, details) {
  results.push({ name, passed: true, details });
  console.log('PASS ' + name);
}
async function open(page, route) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.locator('html[data-ui-ready=true]').waitFor();
  await page.waitForTimeout(700);
}
try {
  const c = await b.newContext({ viewport: { width: 1440, height: 1000 } }),
    p = await c.newPage();
  await open(p, '/settings');
  await p.getByRole('button', { name: 'Reduced motion', exact: true }).click();
  await p.getByRole('button', { name: 'Solid surfaces', exact: true }).click();
  await p.getByRole('button', { name: 'Full motion', exact: true }).click();
  await expect(p.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(p.locator('.liquid-sidebar')).toHaveCSS(
    'animation-name',
    'none',
  );
  await open(p, '/customers');
  const card = p.locator('.studio-customer-card').first();
  await card.hover();
  await p.waitForTimeout(250);
  assert.notEqual(
    await card.evaluate((el) => getComputedStyle(el).translate),
    'none',
  );
  await p.mouse.move(1300, 20);
  await open(p, '/settings');
  await p.getByRole('button', { name: 'Reduced motion', exact: true }).click();
  await open(p, '/customers');
  await card.hover();
  await p.waitForTimeout(150);
  assert.equal(
    await card.evaluate((el) => getComputedStyle(el).translate),
    'none',
  );
  await pass(
    'Full and Reduced change card reactions; shell entrance does not replay',
  );
  await open(p, '/orders/10004824');
  await p
    .getByRole('button', { name: 'Open Amiro assistant', exact: true })
    .click();
  await expect(p.getByRole('dialog')).toBeVisible();
  assert.equal(
    await p
      .getByRole('dialog')
      .evaluate((el) => getComputedStyle(el).backdropFilter),
    'none',
  );
  await p.getByRole('link', { name: 'Open full assistant' }).click();
  await expect(p.getByRole('dialog')).toHaveCount(0);
  await p.waitForURL(/\/assistant\?order=10004824/);
  const composer = p.locator('.composer textarea');
  await composer.fill('UNSENT for Emma only');
  await p.getByLabel('Linked order').selectOption('10004821');
  await expect(composer).toHaveValue('');
  await p.getByLabel('Linked order').selectOption('10004824');
  await expect(composer).toHaveValue('UNSENT for Emma only');
  await pass(
    'Solid drawer and full-assistant handoff preserve isolated per-order composers',
  );
  await open(p, '/orders/new');
  await p.getByRole('button', { name: 'New customer', exact: true }).click();
  await expect(p.getByRole('dialog')).toBeVisible();
  const modalAxe = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  if (modalAxe.violations.length)
    issues.push(
      ...modalAxe.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.failureSummary),
      })),
    );
  await p.keyboard.press('Escape');
  await expect(
    p.getByRole('button', { name: 'New customer', exact: true }),
  ).toBeFocused();
  await p
    .locator('#product-1')
    .fill(
      'Extra-long modular wardrobe description with hinged mirrored doors, two accessory drawers, soft-close fittings and customer-specific finish notes. '.repeat(
        3,
      ),
    );
  await p.locator('#source-reference').fill('LONG-REFERENCE-'.repeat(12));
  for (const width of [390, 768, 1024, 1440, 1920, 720]) {
    await p.setViewportSize({ width, height: width === 720 ? 500 : 1000 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
      'long form overflow ' + width,
    );
  }
  await p.screenshot({ path: out + '/long-fields-200-percent-equivalent.png' });
  await pass(
    'Long form fields reflow at five target widths plus 720px/200%-equivalent layout',
  );
  await c.close();
  const unavailable = await b.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await unavailable.addInitScript(() => {
    const get = Storage.prototype.getItem,
      set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === 'amiro-ui-preferences-v1')
        throw new DOMException(
          'QA blocked appearance storage',
          'SecurityError',
        );
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'amiro-ui-preferences-v1')
        throw new DOMException(
          'QA blocked appearance storage',
          'QuotaExceededError',
        );
      return set.call(this, key, value);
    };
  });
  const s = await unavailable.newPage();
  await open(s, '/settings');
  const ledger = await s.evaluate(() =>
    localStorage.getItem('ah-interiors-local-workspace-v3'),
  );
  await s.getByRole('button', { name: 'Reduced motion', exact: true }).click();
  await expect(s.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(
    s.getByText(
      'Appearance changes are session-only; browser storage is unavailable.',
    ),
  ).toBeVisible();
  assert.equal(
    await s.evaluate(() =>
      localStorage.getItem('ah-interiors-local-workspace-v3'),
    ),
    ledger,
  );
  await s.screenshot({ path: out + '/storage-unavailable.png' });
  await pass(
    'Unavailable appearance storage stays session-only and leaves ledger bytes unchanged',
  );
  await unavailable.close();
  const touch = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const t = await touch.newPage();
  await open(t, '/orders');
  await t.getByRole('button', { name: 'Open all navigation' }).tap();
  await t
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'Customers', exact: true })
    .tap();
  await expect(t.getByRole('dialog')).toHaveCount(0);
  await expect(
    t.getByRole('heading', { name: 'Customer directory.' }),
  ).toBeVisible();
  await pass('Touch navigation works without hover');
  await touch.close();
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        results,
        accessibilityIssues: issues,
        nativeDesktopZoomTested: false,
        zoomNote:
          '720 CSS pixel viewport is 200% reflow equivalent for a 1440px desktop; native browser zoom UI was not exercised.',
      },
      null,
      2,
    ),
  );
  if (issues.length)
    throw Error('Accessibility issues in modal: ' + JSON.stringify(issues));
} catch (error) {
  console.error(error);
  await fs.writeFile(
    out + '/failure.json',
    JSON.stringify({ error: String(error), results, issues }, null, 2),
  );
  process.exitCode = 1;
} finally {
  await b.close();
}
