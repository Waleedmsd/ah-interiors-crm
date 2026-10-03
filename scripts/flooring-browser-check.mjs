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
fs.mkdirSync('output/flooring', { recursive: true });
const rooms = [
  {
    name: 'Living room',
    length: 4.5,
    width: 4,
    wastePercent: 10,
    stairs: false,
    landing: false,
    underlay: 'Acoustic underlay',
    accessories: 'Brass door bar',
    notes: 'Customer will clear furniture before fitting.',
  },
  {
    name: 'Hallway',
    length: 3.2,
    width: 1.4,
    wastePercent: 10,
    stairs: false,
    landing: false,
    underlay: '',
    accessories: '',
    notes: '',
  },
];
let project = {
  leadId: 'ui-flooring',
  orderId: 'L-REVIEW',
  status: 'Awaiting Materials',
  version: 1,
  fitterId: null,
  scheduledDate: '',
  timeSlot: '',
  customerConfirmed: false,
  signoff: '',
  notes: '',
  caseId: null,
  customerName: 'Sarah Thompson',
  address: '24 Oakfield Road, Nelson',
  postcode: 'BB9 7AB',
  phone: '01282000000',
  rooms,
  materials: [
    {
      productId: 'carpet',
      name: 'Cormar Primo Plus · Nordic Grey',
      sku: 'CPP-NG',
      supplierId: 's1',
      supplierName: 'Cormar',
      supplierSku: 'CPP',
      unit: 'm²',
      quantity: 24.728,
      groupId: 'g1',
      allocated: 10,
      incoming: 0,
      shortage: 14.728,
      ready: false,
    },
    {
      productId: 'underlay',
      name: 'Cloud 9 underlay · 11 mm',
      sku: 'C9-11',
      supplierId: 's2',
      supplierName: 'Ball & Young',
      supplierSku: 'C9',
      unit: 'm²',
      quantity: 22.48,
      groupId: 'g2',
      allocated: 22.48,
      incoming: 0,
      shortage: 0,
      ready: true,
    },
  ],
  ready: false,
  paid: true,
  invoiceId: 'INV-REVIEW',
  purchases: [],
  fitters: [
    { id: 'f1', name: 'James Wilson' },
    { id: 'f2', name: 'Daniel Hughes' },
  ],
  acceptedAt: '2026-10-03T09:00:00Z',
  acceptedBy: 'Amir',
  evidence: 'Signed quote reviewed with customer.',
  totalPence: 102550,
  profit: {
    contributionProfitPence: 29450,
    contributionMarginBps: 3450,
    tier: 'Strong',
  },
  canPrepare: true,
  canSchedule: true,
  canWork: true,
};
const quote = {
  lines: [{ productId: 'carpet', quantity: 24.728, unitPricePence: 2400 }],
  underlayPence: 0,
  accessoriesPence: 0,
  fittingPence: 18000,
  removalPence: 4500,
  deliveryPence: 2500,
  discountPence: 0,
  costPence: 35000,
};
let lead = {
  id: 'ui-flooring',
  number: 'FLR-REVIEW',
  title: 'Living room & hallway carpet',
  status: 'Quote',
  version: 4,
  customerId: 'ui-customer',
  orderId: null,
  supplierId: null,
  productId: null,
  assignedUserId: 'ui-manager',
  createdBy: 'ui-manager',
  createdAt: '2026-10-01T09:00:00Z',
  updatedAt: '2026-10-03T09:00:00Z',
  details: {
    leadSource: 'Showroom',
    productType: 'Carpet',
    room: 'Living room and hallway',
    approxSqm: 22.48,
    budgetPence: 110000,
    branch: 'Nelson',
    measureDate: '2026-10-02',
    measureTime: 'AM',
    surveyor: 'James Wilson',
    samples: 'Nordic Grey',
    measureNotes: '',
    rooms,
    quote,
    nextChaseDate: '2026-10-04',
    outcome: 'Quote reviewed',
    lostReason: '',
    fittingDate: '',
    notes: '',
  },
};
let accepted = false;
const writes = [];
try {
  const login = await context.request.post(origin + '/api/auth/login', {
    headers: { origin },
    data: {
      email: 'manager@ahinteriors.test',
      password: process.env.SEED_PASSWORD,
    },
  });
  assert.equal(login.status(), 200);
  await page.goto(origin + '/flooring/fitting');
  await page
    .getByRole('heading', { name: 'Materials & fitting', exact: true })
    .waitFor();
  await page.route('**/api/flooring/fittings', (r) =>
    r.fulfill({ json: [project] }),
  );
  await page.route('**/api/operations/flooring', (r) =>
    r.fulfill({ json: [lead] }),
  );
  await page.route('**/api/lookups', (r) =>
    r.fulfill({
      json: {
        timeZone: 'Europe/London',
        customers: [{ id: 'ui-customer', name: 'Sarah Thompson' }],
        orders: [],
        suppliers: [],
        products: [
          {
            id: 'carpet',
            name: 'Cormar Primo Plus',
            unit: 'm²',
            sellingPricePence: 2400,
          },
        ],
        staff: [{ id: 'ui-manager', name: 'Amir', role: 'Management' }],
      },
    }),
  );
  await page.route('**/api/flooring/ui-flooring/accept', async (r) => {
    writes.push(r.request().postDataJSON());
    accepted = true;
    lead = { ...lead, orderId: project.orderId, status: 'Won', version: 5 };
    await r.fulfill({ json: { orderId: project.orderId } });
  });
  await page.route('**/api/flooring/ui-flooring/fulfilment', async (r) => {
    if (r.request().method() === 'GET')
      return r.fulfill({ json: accepted ? project : null });
    const data = r.request().postDataJSON();
    writes.push(data);
    assert.equal(data.version, project.version);
    if (data.action === 'prepare')
      project = {
        ...project,
        ready: true,
        status: 'Ready to Book',
        materials: project.materials.map((m) => ({
          ...m,
          allocated: m.quantity,
          shortage: 0,
          ready: true,
        })),
      };
    if (data.action === 'book')
      project = { ...project, ...data, status: 'Booked' };
    if (data.action === 'start')
      project = { ...project, status: 'In Progress' };
    project.version++;
    await r.fulfill({ json: project });
  });
  await page.route('**/api/attachments?**', (r) => r.fulfill({ json: [] }));
  await page.route('**/api/activity?**', (r) => r.fulfill({ json: [] }));
  await page.goto(origin + '/flooring?record=ui-flooring');
  await page.getByRole('button', { name: /Accept quote ·/ }).waitFor();
  await page.screenshot({
    path: 'output/flooring/quote-review.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /Accept quote ·/ }).click();
  await page
    .getByLabel('Acceptance evidence', { exact: true })
    .fill('Customer signed the agreed quotation.');
  await page
    .getByRole('button', { name: 'Accept & create order', exact: true })
    .click();
  await page
    .getByText('The accepted quote is locked.', { exact: false })
    .waitFor();
  assert.ok(writes[0].evidence);
  await page.goto(origin + '/flooring/fitting?record=ui-flooring');
  await page
    .getByRole('heading', { name: 'Sarah Thompson', exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Book fitting', exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: 'output/flooring/materials-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page
    .getByRole('button', { name: 'Allocate & prepare purchases', exact: true })
    .click();
  await page.getByRole('button', { name: 'Book fitting', exact: true }).click();
  await page.getByLabel('Fitter', { exact: true }).selectOption('f1');
  await page.getByLabel('Fitting date', { exact: true }).fill('2027-03-15');
  await page.getByLabel('Time window', { exact: true }).fill('09:00–12:00');
  await page
    .getByLabel('Customer confirmed this appointment', { exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Confirm booking', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Start / resume fitting', exact: true })
    .waitFor();
  assert.equal(writes.at(-1).fitterId, 'f1');
  await page.screenshot({
    path: 'output/flooring/booked-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  const a11y = await new AxeBuilder({ page })
    .include('.floor-workspace')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  const severe = a11y.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact),
  );
  assert.deepEqual(
    severe.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
  );
  await page
    .getByRole('button', { name: 'Start / resume fitting', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm dispatch', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Complete & sign off', exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'output/flooring/fitting-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page
    .getByRole('button', { name: 'Complete & sign off', exact: true })
    .click();
  await page
    .getByLabel('Fitting evidence', { exact: true })
    .fill('Customer confirmed the finished rooms.');
  await page.screenshot({
    path: 'output/flooring/signoff-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  project = {...project,canPrepare:false,canSchedule:false,canWork:true,totalPence:undefined,profit:undefined,purchases:[],fitters:[],evidence:''};
  await page.route('**/api/auth/me',r=>r.fulfill({json:{user:{id:'f1',name:'James Wilson',email:'fitter@example.invalid',role:'Installer',department:'Fitting',active:true}}}));
  await page.goto(origin+'/flooring/fitting?record=ui-flooring');
  await page.getByRole('heading',{name:'Sarah Thompson',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Sales order',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Allocate & prepare purchases',exact:true}).count(),0);
  assert.equal(await page.getByText('Accepted estimated contribution:',{exact:false}).count(),0);
  await page.getByRole('button',{name:'Complete & sign off',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.screenshot({path:'output/flooring/installer-mobile.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors, []);
  console.log(
    'Flooring UI passed: quote acceptance, material readiness, booking, dispatch, sign-off dialog, desktop/mobile and targeted accessibility. Synthetic API writes only.',
  );
} catch (e) {
  await page
    .screenshot({ path: 'output/flooring/failure.png', fullPage: true })
    .catch(() => {});
  throw e;
} finally {
  await browser.close();
}
