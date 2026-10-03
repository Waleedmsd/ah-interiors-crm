import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { blankDetails } from '../lib/business-modules';
const origin = process.env.APP_ORIGIN!;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
});
const page = await context.newPage(),
  errors: string[] = [],
  writes: any[] = [];
page.on('pageerror', (e) => errors.push(e.message));
let row: any = {
  id: 'case-ui',
  number: 'CS-REVIEW',
  title: 'Damaged oak chairs',
  status: 'Investigating',
  version: 1,
  customerId: 'c1',
  orderId: 'L-999999',
  productId: null,
  supplierId: null,
  assignedUserId: 'ui-manager',
  createdBy: 'ui-manager',
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-03T09:00:00Z',
  details: {
    ...blankDetails('service-cases'),
    caseType: 'Damage',
    priority: 'High',
    reportedDate: '2026-10-01',
    description: 'Customer reported damage to two chairs.',
  },
};
let project: any = {
  caseId: row.id,
  number: row.number,
  version: 1,
  status: row.status,
  orderId: row.orderId,
  invoiceId: 'INV-REVIEW',
  workflow: {
    caseId: row.id,
    productId: null,
    quantity: 1,
    purchaseOrderId: null,
    deliveryId: null,
    approvalId: null,
    refundId: null,
    refundPence: 0,
    customerNextDate: '',
    supplierNextDate: '',
    contacts: [],
    returns: [],
    outcome: '',
    customerConfirmed: false,
  },
  products: [{ id: 'p1', name: 'Oak dining chair · natural' }],
  locations: [{ id: 'loc1', name: 'Nelson warehouse' }],
  allocated: 0,
  purchase: null,
  delivery: null,
  approval: null,
  refund: null,
  availableRefunds: [],
  returnable: [],
  canManage: true,
  canStock: true,
  canRefund: true,
};
try {
  const login = await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  await page.route('**/api/**', (r) =>
    r.request().method() === 'GET'
      ? r.continue()
      : r.fulfill({
          status: 403,
          json: { error: { message: 'Unmocked test write blocked' } },
        }),
  );
  await page.route('**/api/operations/service-cases', (r) =>
    r.fulfill({ json: [row] }),
  );
  await page.route('**/api/lookups', (r) =>
    r.fulfill({
      json: {
        timeZone: 'Europe/London',
        customers: [{ id: 'c1', name: 'Sarah Thompson' }],
        orders: [{ id: 'L-999999', name: 'Sarah Thompson', customerId: 'c1' }],
        suppliers: [],
        products: project.products,
        staff: [{ id: 'ui-manager', name: 'Case owner', role: 'Management' }],
      },
    }),
  );
  await page.route('**/api/attachments?**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/activity?**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/service-cases/case-ui/workflow', async (r) => {
    if (r.request().method() === 'POST') {
      const d = r.request().postDataJSON();
      writes.push(d);
      assert.equal(d.version, project.version);
      const w = project.workflow;
      if (d.action === 'configure') {
        w.productId = d.productId;
        w.quantity = d.quantity;
        project.returnable = [{ id: 'r1', quantity: 2 }];
      }
      if (d.action === 'contact') {
        w.contacts.push({
          id: 'ct1',
          audience: d.audience,
          note: d.note,
          at: new Date().toISOString(),
          by: 'Case owner',
        });
        w.customerNextDate = d.nextDate;
      }
      if (d.action === 'prepare') {
        project.replacementRequired = true;
        project.allocated = 1;
        project.purchase = {
          id: 'po1',
          number: 'PO-REVIEW',
          status: 'Draft',
          expectedDate: '2026-10-10',
        };
        w.purchaseOrderId = 'po1';
      }
      if (d.action === 'delivery') {
        project.delivery = {
          id: 'd1',
          number: 'DEL-REVIEW',
          status: 'Ready to Book',
          proof: '',
        };
        w.deliveryId = 'd1';
      }
      if (d.action === 'return') {
        assert.equal(d.disposition, 'Write off');
        w.returns.push({
          reservationId: 'r1',
          quantity: d.quantity,
          disposition: d.disposition,
          movementId: 'm1',
          at: new Date().toISOString(),
        });
      }
      if (d.action === 'request-refund') {
        project.approval = {
          id: 'a1',
          number: 'APR-REVIEW',
          status: 'Requested',
        };
        w.approvalId = 'a1';
        w.refundPence = d.amountPence;
      }
      if (d.action === 'link-refund') {
        project.refund = {
          id: d.refundId,
          amountPence: 2500,
          reference: 'BANK-REVIEW',
        };
        w.refundId = d.refundId;
      }
      if (d.action === 'resolve') {
        assert.equal(d.customerConfirmed, true);
        project.status = 'Resolved';
        w.outcome = d.outcome;
        w.customerConfirmed = true;
      }
      project.version++;
      row = { ...row, version: project.version, status: project.status };
    }
    await r.fulfill({ json: project });
  });
  await page.goto(origin + '/service-cases?record=case-ui');
  const root = page.getByRole('region', { name: 'After-sales workflow' });
  await root
    .getByRole('heading', { name: 'Make the customer whole' })
    .waitFor();
  await root
    .getByLabel('What was discussed or agreed?')
    .fill('Customer agreed to replacement chairs and a follow-up call.');
  await root.getByLabel('Next promised update / chase').fill('2026-10-06');
  await root.getByRole('button', { name: 'Log update', exact: true }).click();
  await root
    .getByText('Customer agreed to replacement chairs and a follow-up call.', {
      exact: true,
    })
    .waitFor();
  await root.getByRole('button', { name: 'Replacement', exact: true }).click();
  await root.getByLabel('Ordered product').selectOption('p1');
  await root.getByLabel('Affected quantity').fill('2');
  await root.getByRole('button', { name: 'Save affected item' }).click();
  await root
    .getByText('2 × Oak dining chair · natural', { exact: true })
    .waitFor();
  await root
    .getByLabel('Agreed supplier cost per replacement (£)', { exact: false })
    .fill('0');
  await root.getByRole('button', { name: 'Allocate & draft shortage' }).click();
  await root.getByRole('link', { name: /PO-REVIEW · Draft/ }).waitFor();
  assert.equal(
    await root
      .getByRole('button', { name: 'Create replacement delivery' })
      .isDisabled(),
    true,
  );
  project.allocated = 2;
  project.purchase.status = 'Received';
  await root.getByRole('button', { name: 'Refresh after-sales' }).click();
  await root
    .getByRole('button', { name: 'Create replacement delivery' })
    .click();
  await root
    .getByRole('link', { name: /DEL-REVIEW · Ready to Book/ })
    .waitFor();
  await root.getByRole('button', { name: 'Return', exact: true }).click();
  await root.getByLabel('Delivered stock').selectOption('r1');
  await root.getByLabel('Quantity received').fill('1');
  await root.getByLabel('Receiving location').selectOption('loc1');
  await root.getByLabel('Inspection outcome').selectOption('Write off');
  await root
    .getByLabel('Condition and reason')
    .fill('Broken frame inspected at goods in.');
  await root.getByRole('button', { name: 'Record physical return' }).click();
  await root.getByText(/1 units · Write off/).waitFor();
  await root.getByRole('button', { name: 'Refund', exact: true }).click();
  await root.getByLabel('Refund amount (£)').fill('25');
  await root
    .getByLabel('Refund reason', { exact: true })
    .fill('Agreed goodwill for the delay.');
  await root.getByRole('button', { name: 'Request refund approval' }).click();
  await root.getByRole('link', { name: /APR-REVIEW · Requested/ }).waitFor();
  assert.equal(
    await root
      .getByRole('button', { name: 'Link recorded refund' })
      .isDisabled(),
    true,
  );
  project.approval.status = 'Approved';
  project.availableRefunds = [
    { id: 'rf1', amountPence: 2500, reference: 'BANK-REVIEW' },
  ];
  await root.getByRole('button', { name: 'Refresh after-sales' }).click();
  await root.getByLabel('Recorded invoice refund').selectOption('rf1');
  await root.getByRole('button', { name: 'Link recorded refund' }).click();
  await root.getByText(/Refund recorded: £25.00/).waitFor();
  fs.mkdirSync('output/after-sales', { recursive: true });
  await root.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/after-sales/desktop.png',
    fullPage: true,
  });
  const audit = await new AxeBuilder({ page })
    .include('.after-sales')
    .analyze();
  assert.deepEqual(
    audit.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await root.getByRole('button', { name: 'Contact', exact: true }).click();
  await root.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'output/after-sales/mobile.png',
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  project.delivery.status = 'Delivered';
  project.delivery.proof = 'Signed';
  await root.getByRole('button', { name: 'Refresh after-sales' }).click();
  await root.getByRole('button', { name: 'Resolve', exact: true }).click();
  await root.getByLabel('Resolution outcome').selectOption('Combined remedy');
  await root
    .getByLabel('Resolution details')
    .fill(
      'Replacements delivered and goodwill refunded. Customer confirmed satisfaction.',
    );
  await root
    .getByLabel('Customer confirmation of the resolution has been recorded.')
    .check();
  await root.getByRole('button', { name: 'Resolve case', exact: true }).click();
  await root
    .getByRole('heading', { name: 'Resolved · Combined remedy' })
    .waitFor();
  const mobile = await new AxeBuilder({ page })
    .include('.after-sales')
    .analyze();
  assert.deepEqual(
    mobile.violations
      .filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))
      .map((v) => v.id),
    [],
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(
    writes.map((w) => w.action),
    [
      'contact',
      'configure',
      'prepare',
      'delivery',
      'return',
      'request-refund',
      'link-refund',
      'resolve',
    ],
  );
  console.log(
    'After-sales desktop/mobile controls and accessibility passed. All business writes mocked.',
  );
} catch (e) {
  console.log((await page.locator('body').innerText()).slice(-11000));
  console.log('Page errors', errors);
  fs.mkdirSync('output/after-sales', { recursive: true });
  await page.screenshot({
    path: 'output/after-sales/failure.png',
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
