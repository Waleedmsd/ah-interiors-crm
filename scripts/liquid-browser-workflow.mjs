import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out = 'output/liquid-studio/workflow';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errors = [];
const results = [];
page.on('pageerror', (e) => errors.push(e.message));
const stamp = Date.now();
const customer = 'QA Liquid Studio ' + stamp;
const base = 'http://127.0.0.1:3001';
async function note(name) {
  results.push({ name, passed: true });
  console.log('PASS ' + name);
}
async function go(route) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.locator('html[data-ui-ready=true]').waitFor();
  await page.waitForTimeout(700);
}
async function shot(name) {
  await page.screenshot({ path: out + '/' + name + '.png' });
}
async function reflow(name) {
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      name + ' overflow at ' + width,
    );
    await shot(name + '-' + width);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
async function pay(amount, ref) {
  await page
    .getByRole('button', { name: 'Record payment', exact: true })
    .click();
  await page.getByLabel('Amount received (£)').fill(amount);
  await page.getByLabel('Method', { exact: true }).selectOption('Other');
  await page.getByLabel('Payment / bank reference').fill(ref);
  await page.getByRole('button', { name: 'Record verified payment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
let orderPath, invoicePath;
try {
  await go('/orders/new');
  await page.getByRole('button', { name: 'New customer', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Full name').fill(customer);
  await dialog
    .getByLabel('Email address')
    .fill('qa-liquid-' + stamp + '@example.invalid');
  await dialog.getByLabel('Street address').fill('QA ONLY — 1 Example Street');
  await dialog.getByLabel('Town / city').fill('Milton Keynes');
  await dialog.getByLabel('Postcode', { exact: true }).fill('MK9 1AA');
  await shot('customer-dialog');
  await dialog.getByRole('button', { name: 'Save customer' }).click();
  await page.getByLabel('Original order reference').fill('QA-LIQUID-' + stamp);
  for (const [n, name, supplier, article, options, price, route] of [
    [
      1,
      'QA wardrobe — synthetic test only',
      'Rauch',
      'QA-WARD-001',
      'Alpine white · 150 cm · QA shelf',
      '300',
      'Flat Pack Pro',
    ],
    [
      2,
      'QA bedside table — synthetic test only',
      'Torelli',
      'QA-TABLE-001',
      'Grey oak · 45 cm',
      '80',
      'AH showroom → BStar',
    ],
  ]) {
    if (n === 2)
      await page
        .getByRole('button', { name: /Add.*product|Add.*item/i })
        .click();
    await page.locator('#product-' + n).fill(name);
    await page.locator('#supplier-' + n).fill(supplier);
    await page.locator('#article-' + n).fill(article);
    await page.locator('#options-' + n).fill(options);
    await page.locator('#price-' + n).fill(price);
    await page.locator('#route-' + n).selectOption(route);
  }
  await page.getByLabel(/Delivery.*charge|Delivery.*£/).fill('20');
  await page
    .getByLabel(/Internal note|Order notes|Notes/i)
    .fill('SYNTHETIC TEST. DO NOT FULFIL, CONTACT OR CHARGE.');
  await shot('new-order');
  await page.getByRole('button', { name: /Create order & invoice/ }).click();
  await page.waitForURL(/\/orders\/L-\d+/);
  orderPath = new URL(page.url()).pathname;
  await expect(
    page.getByRole('heading', { name: customer, exact: true }),
  ).toBeVisible();
  await note('Create order and linked draft invoice using synthetic data');
  await page.getByRole('link', { name: 'View invoice', exact: true }).click();
  await page.waitForURL(/\/invoices\//);
  await page.waitForLoadState('networkidle');
  await page.locator('html[data-ui-ready=true]').waitFor();
  invoicePath = new URL(page.url()).pathname;
  await expect(page.locator('.invoice-balance')).toContainText('£400.00');
  await page.getByRole('button', { name: 'Review & issue' }).click();
  await page
    .getByRole('button', { name: 'Issue locally', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Record payment', exact: true }),
  ).toBeVisible();
  await note('Issue invoice locally with £400.00 total');
  await pay('125', 'QA-SIMULATED-PARTIAL-' + stamp);
  await expect(page.locator('.invoice-balance')).toHaveText('£275.00');
  await expect(page.locator('.invoice-actions')).toContainText(
    'Partially paid',
  );
  await shot('partial-payment');
  await note('Partial payment preserves £275.00 balance and amber status');
  await pay('275', 'QA-SIMULATED-FINAL-' + stamp);
  await expect(page.locator('.invoice-balance')).toHaveText('£0.00');
  await expect(page.locator('.payment-history>div')).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Email customer', exact: true })
    .click();
  await expect(page.getByLabel('To', { exact: true })).toHaveValue(
    'qa-liquid-' + stamp + '@example.invalid',
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('.toast-notice')).toContainText('Not sent');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await note('Final payment and customer-linked email draft; nothing sent');
  await reflow('paid-invoice');
  await page.evaluate(() => {
    window.__printCalled = 0;
    window.print = () => {
      window.__printCalled++;
    };
  });
  await page.getByRole('button', { name: /Print.*Save PDF/ }).click();
  assert.equal(await page.evaluate(() => window.__printCalled), 1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.liquid-sidebar')).toBeHidden();
  await expect(page.locator('.invoice-paper')).toContainText(/LOCAL PREVIEW/i);
  await page.pdf({
    path: out + '/synthetic-invoice.pdf',
    format: 'A4',
    printBackground: true,
  });
  await page.emulateMedia({ media: 'screen' });
  await note('Print action and static local-preview invoice PDF');
  await go(orderPath);
  await page
    .getByRole('button', { name: 'Process order', exact: true })
    .click();
  await page.waitForURL(/\/review$/);
  await expect(
    page.getByRole('button', { name: 'Go ahead', exact: true }),
  ).toBeDisabled();
  await note('Prepared pack is blocked until product, route and review checks');
  await go(orderPath);
  const products = page.locator('.ops-line');
  const count = await products.count();
  assert.equal(count, 2);
  for (let i = 0; i < count; i++) {
    const card = products.nth(i);
    await card.getByLabel(/Supplier unit cost/).fill(i === 0 ? '150' : '40');
    await card.getByRole('checkbox').check();
    await card.getByRole('button', { name: 'Save check' }).click();
  }
  await page.getByRole('tab', { name: 'Fulfilment', exact: true }).click();
  const routes = page.locator('.ops-route-card');
  await expect(routes).toHaveCount(2);
  await expect(routes.nth(0)).toContainText('Flat Pack Pro');
  await expect(routes.nth(1)).toContainText('BStar');
  for (let i = 0; i < 2; i++) {
    await routes
      .nth(i)
      .getByRole('checkbox', { name: /Postcode route reviewed/ })
      .check();
    await routes.nth(i).getByRole('button', { name: 'Save route' }).click();
  }
  await shot('separate-routes');
  await reflow('separate-routes');
  await note(
    'Separate assembly and showroom/BStar routes retain missing evidence',
  );
  await page.getByRole('link', { name: 'Review pack', exact: true }).click();
  const draftTabs = page.locator('.liquid-draft-tabs [role=tab]');
  await expect(draftTabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await draftTabs.nth(i).click();
    await page.getByRole('checkbox', { name: /I have reviewed this/ }).check();
  }
  await page
    .getByRole('checkbox', { name: /I approve this coordination plan/ })
    .check();
  for (const check of await page
    .locator('.ops-check-section')
    .getByRole('checkbox')
    .all())
    await check.check();
  await expect(
    page.getByRole('button', { name: 'Go ahead', exact: true }),
  ).toBeEnabled();
  await draftTabs.nth(0).click();
  const subject = page.getByRole('textbox', { name: /Subject for/ });
  const before = await subject.inputValue();
  await subject.fill(before + ' — QA revised');
  await expect(
    page.getByRole('checkbox', { name: /I have reviewed this/ }),
  ).not.toBeChecked();
  for (const check of await page
    .locator('.ops-check-section')
    .getByRole('checkbox')
    .all())
    await expect(check).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: /I approve this coordination plan/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Go ahead', exact: true }),
  ).toBeDisabled();
  await note(
    'Editing a reviewed draft invalidates its review and all final checks',
  );
  await page.getByRole('checkbox', { name: /I have reviewed this/ }).check();
  await page
    .getByRole('checkbox', { name: /I approve this coordination plan/ })
    .check();
  for (const check of await page
    .locator('.ops-check-section')
    .getByRole('checkbox')
    .all())
    await check.check();
  await shot('review-ready');
  await page.getByRole('button', { name: 'Go ahead', exact: true }).click();
  await page
    .getByRole('button', { name: 'Approve locally', exact: true })
    .click();
  await expect(page.locator('.ops-page')).toContainText('Approved locally');
  await expect(subject).toBeDisabled();
  await shot('approved-locally');
  await reflow('approved-locally');
  await note(
    'Approval is local, drafts lock, no external execution is implied',
  );
  await go('/customers');
  await page.getByRole('textbox', { name: 'Search customers' }).fill(customer);
  await page.locator('.studio-customer-card').click();
  await expect(page.locator('.studio-customer-profile')).toContainText(
    '£400.00',
  );
  await expect(page.locator('.studio-customer-order')).toHaveCount(1);
  await shot('customer-profile');
  await note(
    'Customer profile links the correct order, invoice and account balance',
  );
  await go('/orders/new');
  await page
    .getByLabel('Original order reference')
    .fill('UNSAVED-PREFERENCE-CHECK');
  const settings = await context.newPage();
  await settings.goto(base + '/settings', { waitUntil: 'networkidle' });
  await expect(settings.locator('.storage-warning')).toContainText(
    /read-only|another tab/i,
  );
  await settings
    .getByRole('button', { name: 'Reduced motion', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await settings
    .getByRole('button', { name: 'Solid surfaces', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-materials', 'solid');
  await expect(page.getByLabel('Original order reference')).toHaveValue(
    'UNSAVED-PREFERENCE-CHECK',
  );
  await settings
    .getByRole('button', { name: 'Full motion', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await expect(page.locator('.liquid-sidebar')).toHaveCSS(
    'animation-name',
    'none',
  );
  await settings
    .getByRole('button', { name: 'Reduced motion', exact: true })
    .click();
  await settings.close();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-materials', 'solid');
  await note(
    'Read-only tab, live preference sync, persistence and unsaved-form preservation',
  );
  await go('/orders');
  const search = page.getByRole('textbox', { name: 'Search orders' });
  await search.fill('NO-SUCH-ORDER-XYZ');
  await expect(search).toBeFocused();
  await expect(
    page.getByText('No orders found', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Clear filters', exact: true })
    .click();
  await page.getByRole('button', { name: /Search workspace/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /Search workspace/ }),
  ).toBeFocused();
  await note(
    'Empty search, keyboard focus, dialog Escape and focus restoration',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open all navigation' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Orders', exact: true }),
  ).toBeVisible();
  await shot('mobile-navigation');
  await page.keyboard.press('Escape');
  await note('Labelled mobile navigation is accessible and dismissible');
  assert.deepEqual(errors, []);
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        results,
        errors,
        orderPath,
        invoicePath,
        customer,
        origin: base,
        externalActions: 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await shot('failure');
  await fs.writeFile(
    out + '/failure.json',
    JSON.stringify(
      {
        error: String(error),
        results,
        errors,
        url: page.url(),
        text: await page.locator('body').innerText(),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
