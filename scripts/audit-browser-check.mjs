import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const origin = process.env.APP_ORIGIN;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
fs.mkdirSync('output/audit', { recursive: true });
try {
  const login = await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  const ledger = await (
    await context.request.get(origin + '/api/commerce')
  ).json();
  const id = ledger.data.operations.cases[0]?.id;
  await page.goto(origin + '/integrations/shopify');
  await page
    .getByRole('heading', {
      name: 'ah-interior-nelson-ltd.myshopify.com',
      exact: true,
    })
    .waitFor();
  await page
    .getByRole('link', { name: 'Shopify', exact: true })
    .first()
    .waitFor();
  await page.screenshot({
    path: 'output/audit/shopify.png',
    fullPage: true,
    animations: 'disabled',
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Connect store', exact: true })
    .click();
  await page.getByLabel('Admin API access token').waitFor();
  assert.equal(
    await page.getByLabel('Store domain').inputValue(),
    'ah-interior-nelson-ltd.myshopify.com',
  );
  assert.equal(
    await page.getByLabel('Admin API access token').getAttribute('type'),
    'password',
  );
  await page.keyboard.press('Escape');
  await page.goto(origin + '/documents');
  await page
    .getByRole('button', { name: 'Upload document', exact: true })
    .click();
  await page.getByRole('dialog').waitFor();
  assert.ok(
    (await page.getByLabel('Related record').locator('option').count()) > 1,
  );
  await page.keyboard.press('Escape');
  let savedDraft = false;
  const fixtureDraft = {
    id: 'browser-draft',
    version: 1,
    entity: 'customer',
    entityId: ledger.data.customers[0].id,
    to: 'synthetic@example.test',
    subject: 'Existing shared draft',
    body: 'Original body',
    recordName: ledger.data.customers[0].name,
    href: '/customers',
    updatedBy: 'staff-id',
    updatedAt: new Date().toISOString(),
  };
  await page.route('**/api/communication-drafts**', async (route) => {
    if (route.request().method() === 'PUT') {
      const input = route.request().postDataJSON();
      assert.deepEqual(Object.keys(input).sort(), [
        'body',
        'entity',
        'entityId',
        'subject',
        'to',
        'version',
      ]);
      savedDraft = true;
      await route.fulfill({ json: { ...fixtureDraft, ...input, version: 2 } });
    } else await route.fulfill({ json: [fixtureDraft] });
  });
  await page.goto(origin + '/communications');
  await page
    .getByRole('button', { name: 'Existing shared draft', exact: true })
    .click();
  await page.getByLabel('Message', { exact: true }).fill('Updated body');
  await page
    .getByRole('button', { name: 'Save shared draft', exact: true })
    .click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(savedDraft, true);
  await page.getByRole('button', { name: 'New draft', exact: true }).click();
  await page
    .getByLabel('Subject', { exact: true })
    .fill('Synthetic unsaved draft');
  await page
    .getByLabel('Message', { exact: true })
    .fill('Browser validation only.');
  await page.screenshot({
    path: 'output/audit/shared-draft.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  if (id) {
    await page.goto(
      origin + '/orders/' + encodeURIComponent(id) + '?tab=payment',
    );
    await page
      .getByRole('heading', { name: 'Order profitability', exact: true })
      .waitFor();
    await page.screenshot({
      path: 'output/audit/order-costs.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.goto(
      origin + '/service-cases?create=1&order=' + encodeURIComponent(id),
    );
    await page.getByRole('dialog').waitFor();
    assert.equal(
      await page.getByLabel('Sales order', { exact: true }).inputValue(),
      id,
    );
    assert.ok(await page.getByLabel('Customer', { exact: true }).inputValue());
    assert.equal(
      await page
        .getByLabel('Title', { exact: false })
        .inputValue()
        .then((v) => v.startsWith('Case')),
      true,
    );
    await page.screenshot({
      path: 'output/audit/service-case.png',
      fullPage: true,
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
  }
  const axe = await new AxeBuilder({ page })
    .include('.ops-page')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  assert.deepEqual(
    axe.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact))
      .map((v) => ({ id: v.id, description: v.description })),
    [],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/integrations/shopify');
  await page.getByRole('heading', { name: 'Shopify', exact: true }).waitFor();
  await page.screenshot({
    path: 'output/audit/shopify-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(width.scroll <= width.viewport + 2, JSON.stringify(width));
  assert.deepEqual(errors, []);
  console.log(
    'Browser checks passed: Shopify connection, documents, shared draft, order costs, linked case and mobile layout.',
  );
} finally {
  await browser.close();
}
