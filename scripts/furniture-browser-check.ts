import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createCommerceState } from '../lib/commerce';
const origin = process.env.APP_ORIGIN!;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
const commerce = createCommerceState();
const order = structuredClone(commerce.operations.cases[0]);
Object.assign(order, {
  id: 'L-999999',
  customer: 'Sarah Thompson',
  initials: 'ST',
  address: '24 Oakfield Road, Nelson',
  email: 'sarah@example.test',
  phone: '01282000000',
  postcode: 'BB9 7AB',
  channel: 'Showroom',
  sourceRef: 'UI-REVIEW',
  total: 1250,
  paid: 1250,
  paymentVerified: true,
  issues: [],
  pack: undefined,
});
order.groups = [
  {
    ...order.groups[0],
    id: 'g1',
    supplier: 'Furniture supplier',
    route: 'ProBuild',
    delivery: false,
    receipt: false,
    released: false,
    assembly: 'Awaiting booking',
    jobs: [],
  },
];
order.lines = [
  {
    ...order.lines[0],
    id: 'l1',
    groupId: 'g1',
    productId: 'p1',
    name: 'Oak wardrobe · natural finish',
    sku: 'OAK-WRD-180',
    quantity: 3,
  },
];
commerce.operations.cases = [order];
let project: any = {
  orderId: order.id,
  token: 'v1',
  paid: true,
  invoiceId: order.invoice,
  canPrepare: true,
  canManage: true,
  canSeeCosts: true,
  costsReviewed: false,
  groups: [
    {
      id: 'g1',
      supplier: 'Furniture supplier',
      route: 'ProBuild',
      assemblyRequired: true,
      delivered: false,
      assemblyComplete: false,
      ready: false,
      materials: [
        {
          productId: 'p1',
          name: 'Oak wardrobe · natural finish',
          sku: 'OAK-WRD-180',
          quantity: 3,
          allocated: 0,
          delivered: 0,
          incoming: 0,
          shortage: 3,
        },
      ],
    },
  ],
  purchases: [],
  deliveries: [],
  assemblies: [],
  lines: order.lines.map((l) => ({
    id: l.id,
    name: l.name,
    quantity: l.quantity,
    groupId: l.groupId,
  })),
  issues: [],
};
const writes: any[] = [];
try {
  const login = await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  await page.route('**/api/commerce', (r) =>
    r.fulfill({ json: { data: commerce, version: 1 } }),
  );
  await page.route('**/api/attachments?**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/activity?**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/orders/L-999999/fulfilment', async (r) => {
    if (r.request().method() === 'POST') {
      const data = r.request().postDataJSON();
      writes.push(data);
      if (data.action === 'prepare') {
        project.groups[0].materials[0] = {
          ...project.groups[0].materials[0],
          allocated: 2,
          incoming: 1,
          shortage: 0,
        };
        project.purchases = [
          {
            id: 'po1',
            number: 'PO-2026-REVIEW',
            status: 'Draft',
            expectedDate: '',
          },
        ];
      }
      if (data.action === 'split') {
        assert.equal(data.lines[0].quantity, 1);
        assert.ok(data.reason);
        const next = structuredClone(project.groups[0]);
        next.id = 'g2';
        next.materials[0] = {
          ...next.materials[0],
          quantity: 1,
          allocated: 0,
          incoming: 1,
        };
        project.groups[0].materials[0] = {
          ...project.groups[0].materials[0],
          quantity: 2,
          incoming: 0,
        };
        project.groups[0].ready = true;
        project.groups.push(next);
        project.lines = [
          { ...project.lines[0], quantity: 2 },
          { ...project.lines[0], id: 'l2', groupId: 'g2', quantity: 1 },
        ];
      }
      if (data.action === 'delivery') {
        project.deliveries = [
          {
            id: 'del1',
            number: 'DEL-REVIEW',
            status: 'Awaiting Stock',
            groupId: 'g1',
            date: '',
            slot: '',
            evidence: '',
          },
        ];
        project.assemblies = [
          {
            id: 'asm1',
            number: 'ASM-REVIEW',
            status: 'Awaiting Booking',
            groupId: 'g1',
            date: '',
            slot: '',
            evidence: '',
          },
        ];
      }
    }
    await r.fulfill({ json: project });
  });
  await page.goto(origin + '/orders/L-999999?tab=fulfilment');
  await page.getByRole('heading', { name: 'Prepare stock & supply' }).waitFor();
  const root = page.locator('.furniture-workflow');
  assert.equal(
    await root
      .getByRole('button', { name: 'Create delivery job' })
      .isDisabled(),
    true,
  );
  await root
    .getByRole('button', { name: 'Allocate stock & draft shortages' })
    .click();
  await root.getByText('PO-2026-REVIEW · Draft').waitFor();
  await root.getByRole('button', { name: 'Split shipment' }).click();
  await page
    .getByLabel('Move quantity: Oak wardrobe · natural finish')
    .fill('1');
  await page
    .getByLabel('Reason / customer arrangement')
    .fill('Customer agreed to staged delivery.');
  await page.getByRole('button', { name: 'Save split shipment' }).click();
  await page
    .getByRole('heading', { name: 'Ready shipments available' })
    .waitFor();
  await root
    .getByRole('button', { name: 'Create delivery job' })
    .first()
    .click();
  await root.getByText('DEL-REVIEW · Awaiting Stock').waitFor();
  assert.ok(
    (
      await root
        .getByText('ASM-REVIEW · Awaiting Booking')
        .locator('..')
        .locator('..')
        .getAttribute('href')
    )?.includes('/assembly-jobs?record='),
  );
  fs.mkdirSync('output/furniture', { recursive: true });
  await page.screenshot({
    path: 'output/furniture/desktop.png',
    fullPage: true,
  });
  const a11y = await new AxeBuilder({ page })
    .include('.furniture-workflow')
    .analyze();
  assert.deepEqual(
    a11y.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await root.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/furniture/mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    'No page overflow',
  );
  const mobile = await new AxeBuilder({ page })
    .include('.furniture-workflow')
    .analyze();
  assert.deepEqual(
    mobile.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
      .map((v) => v.id),
    [],
  );
  assert.deepEqual(
    writes.map((v) => v.action),
    ['prepare', 'split', 'delivery'],
  );
  assert.deepEqual(errors, []);
  console.log(
    'Furniture desktop/mobile actions and targeted accessibility passed; no business records written.',
  );
} catch (e) {
  console.log('URL', page.url());
  console.log((await page.locator('body').innerText()).slice(0, 9000));
  console.log('Page errors', errors);
  await page.screenshot({
    path: 'output/furniture-failure.png',
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
