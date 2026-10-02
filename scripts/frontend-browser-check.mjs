import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { recordInput } from '../server/services/operational-validation.ts';
const origin = process.env.APP_ORIGIN;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const errors = [];
const page = await context.newPage();
page.on('pageerror', (error) => errors.push(error.message));
fs.mkdirSync('output/design', { recursive: true });
try {
  const login = await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  const me = await (await context.request.get(origin + '/api/auth/me')).json();
  const date = new Date().toLocaleDateString('en-CA');
  // Exercise populated UI and save payloads without inserting demo jobs into the business database.
  let tasks = [
    {
      id: 'ui-task',
      number: 'TASK-UI001',
      title: 'Plan tomorrow’s collections',
      status: 'Open',
      version: 1,
      customerId: null,
      orderId: null,
      supplierId: null,
      productId: null,
      assignedUserId: me.user.id,
      createdBy: me.user.id,
      details: {
        description: 'Confirm the collection slots with the team.',
        priority: 'High',
        dueDate: date,
        reminderDate: '',
        linkedType: '',
        linkedId: '',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await page.route('**/api/operations/tasks**', async (route) => {
    const request = route.request();
    let result = tasks,
      status = 200;
    if (request.method() === 'POST') {
      const input = recordInput('tasks').parse(request.postDataJSON());
      const row = {
        ...tasks[0],
        ...input,
        id: 'ui-created',
        number: 'TASK-UI002',
        version: 1,
        status: 'Open',
      };
      tasks.push(row);
      result = row;
      status = 201;
    }
    if (request.method() === 'PATCH') {
      const input = request.postDataJSON();
      const id = new URL(request.url()).pathname.split('/').at(-1);
      tasks = tasks.map((row) =>
        row.id === id
          ? { ...row, status: input.status, version: row.version + 1 }
          : row,
      );
      result = tasks.find((row) => row.id === id);
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(result),
    });
  });
  const settle = async () => {
    await page.waitForTimeout(650);
  };
  await page.goto(origin + '/deliveries');
  await page
    .getByRole('button', { name: 'Create delivery job', exact: true })
    .first()
    .waitFor();
  await settle();
  await page.screenshot({
    path: 'output/design/after-deliveries.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create delivery job', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const select = dialog.getByLabel('Sales order', { exact: true });
  const options = await select
    .locator('option')
    .evaluateAll((nodes) =>
      nodes
        .map((node) => ({ value: node.value, label: node.textContent }))
        .filter((node) => node.value),
    );
  assert.ok(options.length);
  await select.selectOption(options[0].value);
  assert.ok(await dialog.getByLabel('Customer', { exact: true }).inputValue());
  assert.ok(
    await dialog.getByLabel('Delivery address', { exact: false }).inputValue(),
  );
  await settle();
  await page.screenshot({
    path: 'output/design/after-delivery-form.png',
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await page.locator('.ops-board').waitFor();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await settle();
  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    actual: document.documentElement.scrollWidth,
    elements: [...document.querySelectorAll('body *')]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > window.innerWidth + 2 &&
          getComputedStyle(e).position !== 'fixed',
      )
      .slice(0, 15)
      .map((e) => ({
        tag: e.tagName,
        class: e.className,
        right: e.getBoundingClientRect().right,
        width: e.getBoundingClientRect().width,
      })),
  }));
  assert.ok(
    overflow.actual <= overflow.width + 1,
    'Mobile overflow: ' + JSON.stringify(overflow),
  );
  await page.screenshot({
    path: 'output/design/after-deliveries-mobile.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create delivery job', exact: true })
    .first()
    .click();
  await dialog.waitFor();
  await settle();
  await page.screenshot({
    path: 'output/design/after-form-mobile.png',
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/tasks');
  await page
    .getByRole('button', { name: 'Plan tomorrow’s collections', exact: false })
    .waitFor();
  await page
    .getByRole('button', { name: 'Create task', exact: true })
    .first()
    .click();
  await dialog.waitFor();
  await dialog
    .getByLabel('Task name', { exact: false })
    .fill('Confirm flooring appointment');
  await dialog.getByLabel('Due date', { exact: false }).fill(date);
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page
    .getByRole('button', { name: 'Confirm flooring appointment', exact: false })
    .waitFor();
  assert.equal(tasks.length, 2);
  await page
    .getByRole('button', { name: 'Open TASK-UI002', exact: true })
    .click();
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Completed', exact: true }).click();
  const statusDialog = page.getByRole('dialog', { name: 'Update TASK-UI002' });
  await statusDialog
    .getByRole('button', { name: 'Confirm update', exact: true })
    .click();
  await statusDialog.waitFor({ state: 'hidden' });
  assert.equal(tasks[1].status, 'Completed');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Board', exact: true }).click();
  await settle();
  await page.screenshot({
    path: 'output/design/after-tasks-board.png',
    fullPage: true,
  });
  for (const [path, button] of [
    ['assembly-jobs', 'Create assembly job'],
    ['flooring', 'Create flooring lead'],
    ['service-cases', 'Create customer service case'],
    ['expenses', 'Create expense'],
    ['approvals', 'Create approval request'],
  ]) {
    await page.goto(origin + '/' + path);
    await page
      .getByRole('button', { name: button, exact: true })
      .first()
      .click();
    await dialog.waitFor();
    assert.ok((await dialog.locator('.ops-form-section').count()) > 1);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }
  await page.goto(origin + '/products');
  await page.getByText('Demo wardrobe', { exact: true }).waitFor();
  await settle();
  await page.screenshot({
    path: 'output/design/after-products.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Edit Demo wardrobe', exact: true })
    .click();
  await dialog.waitFor();
  assert.equal(
    await dialog.getByLabel('Product name', { exact: true }).inputValue(),
    'Demo wardrobe',
  );
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.goto(origin + '/suppliers');
  await page
    .getByRole('button', { name: 'Add supplier', exact: true })
    .first()
    .click();
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.goto(origin + '/inventory');
  await page
    .getByRole('button', { name: 'Record movement', exact: true })
    .click();
  await dialog.waitFor();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  for (const [route, label] of [['purchasing', 'Create purchase order'], ['supplier-tracking', 'Create supplier order']]) {
    await page.goto(origin + '/' + route);
    await page.getByRole('button', {name: label, exact: true}).click();
    await dialog.waitFor();
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    await dialog.waitFor({state:'hidden'});
  }
  await page.goto(origin + '/reports');
  await page
    .getByRole('heading', { name: 'Sales by channel', exact: true })
    .waitFor();
  await settle();
  await page.screenshot({
    path: 'output/design/after-reports.png',
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Profit & accounts', exact: true })
    .click();
  await page.getByRole('heading', { name: 'Accounts overview' }).waitFor();
  await page.goto(origin + '/');
  await page.getByRole('heading', { name: 'Keep today moving' }).waitFor();
  await settle();
  await page.screenshot({
    path: 'output/design/after-dashboard.png',
    fullPage: true,
  });
  await page.goto(origin + '/deliveries');
  await page
    .getByRole('button', { name: 'Create delivery job', exact: true })
    .first()
    .waitFor();
  await settle();
  const accessibility = await new AxeBuilder({ page })
    .include('.ops-page')
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  fs.writeFileSync(
    'output/design/accessibility.json',
    JSON.stringify(
      accessibility.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      null,
      2,
    ),
  );
  assert.deepEqual(accessibility.violations, []);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result:
        'All redesigned module screens, drawers, mobile width, order autofill, task creation and progress passed.',
      accessibility: accessibility.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.length,
      })),
    }),
  );
} finally {
  await browser.close();
}
