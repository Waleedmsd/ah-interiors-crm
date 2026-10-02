import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const out = 'output/liquid-studio/stress';
await fs.mkdir(out, { recursive: true });
try {
  await page.goto('http://127.0.0.1:3001/orders/new', {
    waitUntil: 'networkidle',
  });
  const prefix = 'QA STRESS ' + Date.now();
  for (let i = 0; i < 20; i++) {
    await page
      .getByRole('button', { name: 'New customer', exact: true })
      .click();
    const d = page.getByRole('dialog');
    await d
      .getByLabel('Full name')
      .fill(
        prefix +
          ' ' +
          String(i).padStart(2, '0') +
          (i === 0
            ? ' Alexandra Catherine Montgomery-Worthington and family — unusually long customer identity'
            : ''),
      );
    await d
      .getByLabel('Email address')
      .fill('qa-stress-' + Date.now() + '-' + i + '@example.invalid');
    await d.getByLabel('Street address').fill('QA ONLY - 1 Example Street');
    await d.getByLabel('Town / city').fill('Milton Keynes');
    await d.getByLabel('Postcode', { exact: true }).fill('MK9 1AA');
    await d.getByRole('button', { name: 'Save customer' }).click();
    await expect(d).toHaveCount(0);
  }
  await page.goto('http://127.0.0.1:3001/customers', {
    waitUntil: 'networkidle',
  });
  await page.getByRole('textbox', { name: 'Search customers' }).fill(prefix);
  await expect(page.locator('.studio-customer-card')).toHaveCount(20);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.screenshot({ path: out + '/many-customers-mobile.png' });
  await page.locator('.studio-customer-card').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Alexandra Catherine Montgomery-Worthington',
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    true,
  );
  await page.screenshot({ path: out + '/long-customer-mobile.png' });
  await fs.writeFile(
    out + '/results.json',
    JSON.stringify(
      {
        createdSyntheticCustomers: 20,
        filteredCards: 20,
        longIdentityPassed: true,
        mobileOverflow: false,
        externalActions: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS 20 synthetic customers, long identity, filtering and mobile layout',
  );
} finally {
  await browser.close();
}
