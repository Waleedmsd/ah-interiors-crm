import type { SalesUnit } from './sales-quantity';
import { demoOrders, money, type DemoOrder } from '@/lib/demo-data';

export const PREVIEW_NOW = Date.parse('2026-09-05T10:00:00Z');
export const DAY = 24 * 60 * 60 * 1000;
export type Channel = string;
export type Route =
  | 'AH flooring'
  | 'ProBuild'
  | 'Flat Pack Pro'
  | 'AH showroom → BStar'
  | 'Supplier → BStar';
export const routes: Route[] = [
  'ProBuild',
  'Flat Pack Pro',
  'AH showroom → BStar',
  'Supplier → BStar',
];
export const suppliers = [
  'Rauch',
  'Wiemann',
  'AC Furniture',
  'AWS Trade',
  'Furnish365',
  'World Furniture',
  'Classic Furniture',
  'GI Italia',
  'Heritage',
  'Torelli',
  'Exclusive Sofas and Chairs',
  'Indus Valley',
  'BerryAlloc',
  'Welcome Furniture',
  'VIDA Living',
  'Birlea',
  'Julian Bowen',
  'Kettle Home',
  'Think Rugs',
  'Heartlands',
  'Hypnos',
];
export type Line = {
  productId?: string;
  id: string;
  name: string;
  supplier: string;
  sku: string;
  article: string;
  colourCode?: string;
  quantity: number;
  unit?: SalesUnit;
  unitPrice: number;
  /** null only in a role-redacted response; canonical ledger costs are numeric. */
  cost: number | null;
  costVerified?: boolean;
  options: string;
  catalogue: string;
  matched: boolean;
  groupId: string;
};
export type Job = {
  type: 'Collection' | 'Delivery';
  ref: string;
  status: 'Not booked' | 'Booked' | 'Done';
  window: string;
};
export type Group = {
  id: string;
  supplier: string;
  route: Route;
  coverageChecked: boolean;
  charging: string;
  supplierStatus: 'Not ordered' | 'Awaiting confirmation' | 'Confirmed';
  receipt: boolean;
  released: boolean;
  delivery: boolean;
  assembly: 'Not required' | 'Awaiting booking' | 'Booked' | 'Complete';
  jobs: Job[];
};
export type Task = {
  id: string;
  title: string;
  category: 'Follow-ups' | 'Exceptions' | 'Delivery & assembly';
  waitingFor: string;
  detail: string;
  nextAction: string;
  dueAt: number;
};
export type Evidence = {
  id: string;
  title: string;
  source: string;
  detail: string;
  at: number;
};
export type Draft = {
  id: string;
  kind:
    | 'Supplier order'
    | 'Provider notice'
    | 'Customer update'
    | 'Transport instructions';
  to: string;
  subject: string;
  body: string;
  timing: string;
  reviewed: boolean;
};
export type Pack = {
  revision: number;
  state: 'Draft' | 'Approved';
  drafts: Draft[];
  checks: {
    specification: boolean;
    routing: boolean;
    payment: boolean;
    split: boolean;
  };
  preparedAt: number;
  approvedAt?: number;
};
export type OrderCase = DemoOrder & {
  customerId?: string;
  flooringLeadId?: string;
  discountPence?: number;
  creationRequest?: string;
  channel: Channel;
  sourceRef: string;
  supplierSource: string;
  postcode: string;
  address: string;
  phone: string;
  paymentReference: string;
  paymentVerified: boolean;
  invoice: string;
  lines: Line[];
  groups: Group[];
  tasks: Task[];
  events: Evidence[];
  pack?: Pack;
  note: string;
  issues: string[];
};
export type OperationsState = { cases: OrderCase[] };
const sampleContact = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '') + '@supplier.example.com';
export const hasAssembly = (group: Group) =>
  group.route === 'AH flooring' ||
  group.route === 'ProBuild' ||
  group.route === 'Flat Pack Pro';
export const isPaid = (order: OrderCase) =>
  order.paymentVerified && order.paid >= order.total;
export const completed = (order: OrderCase) =>
  isPaid(order) &&
  order.groups.length > 0 &&
  !order.issues.length &&
  order.groups.every(
    (group) =>
      group.delivery && (!hasAssembly(group) || group.assembly === 'Complete'),
  );
export const currentStatus = (order: OrderCase): DemoOrder['status'] =>
  completed(order)
    ? 'Complete'
    : order.pack?.state === 'Approved'
      ? 'Approved'
      : order.pack
        ? 'In review'
        : order.status;
export const packHref = (id: string) => '/orders/' + id + '/review';

export function createOperationsState(): OperationsState {
  const channels: Channel[] = [
    'Magento',
    'Shopify',
    'WhatsApp',
    'Amazon',
    'Magento',
    'eBay',
    'Magento',
    'Shopify',
  ];
  return {
    cases: demoOrders.map((base, index) => {
      const route: Route =
        index === 0
          ? 'ProBuild'
          : index === 6
            ? 'Flat Pack Pro'
            : ['Rauch', 'Wiemann'].includes(base.supplier)
              ? 'ProBuild'
              : 'AH showroom → BStar';
      const complete = base.status === 'Complete';
      const assembly = route === 'ProBuild' || route === 'Flat Pack Pro';
      const group: Group = {
        id: 'g1',
        supplier: base.supplier,
        route,
        coverageChecked: index !== 4,
        charging: assembly
          ? 'AH pays provider directly · sample rate'
          : 'AH BStar account · sample rate',
        supplierStatus:
          index < 4
            ? 'Not ordered'
            : index === 5
              ? 'Awaiting confirmation'
              : 'Confirmed',
        receipt: index >= 6,
        released: index >= 6,
        delivery: complete,
        assembly: assembly
          ? complete
            ? 'Complete'
            : 'Awaiting booking'
          : 'Not required',
        jobs: assembly
          ? []
          : [
              {
                type: 'Collection',
                ref: index === 5 ? 'DEMO-90901' : 'Not booked',
                status: index === 5 ? 'Booked' : 'Not booked',
                window:
                  index === 5
                    ? '7 Sep · awaiting stock'
                    : 'Awaiting BStar portal',
              },
              {
                type: 'Delivery',
                ref: index === 5 ? 'DEMO-90902' : 'Not booked',
                status: index === 5 ? 'Booked' : 'Not booked',
                window:
                  index === 5
                    ? '9–11 Sep · portal estimate'
                    : 'Awaiting BStar portal',
              },
            ],
      };
      const order: OrderCase = {
        ...base,
        channel: channels[index],
        sourceRef: [
          'MG-10004821',
          '#1140',
          'WA-0923',
          'AMZ-DEMO-4824',
          'MG-10004812',
          'EB-DEMO-4798',
          'MG-10004786',
          '#1108',
        ][index],
        supplierSource:
          channels[index] === 'Shopify'
            ? 'Shopify tag: supplier:' + base.supplier.toLowerCase()
            : 'Sample supplier match · review before use',
        postcode: index === 6 ? 'MK9 1AA' : index === 0 ? 'M1 1AA' : 'M2 1AA',
        address:
          '24 Example Street, ' + (index === 6 ? 'Milton Keynes' : base.city),
        phone: 'Not provided in preview',
        paymentReference:
          index === 2
            ? 'Deposit only · balance unverified'
            : channels[index] + ' payment · SAMPLE-' + base.id,
        paymentVerified: index !== 2,
        invoice: 'INV-' + base.id,
        lines: [
          {
            id: 'l1',
            name: base.product
              .replace(' + assembly', '')
              .replace(' + delivery', ''),
            supplier: base.supplier,
            sku:
              'DEMO-' +
              base.supplier.slice(0, 3).toUpperCase() +
              '-' +
              base.id.slice(-4),
            article: 'SAMPLE-' + base.id.slice(-4),
            colourCode: assembly ? 'SAMPLE-ALP-W' : undefined,
            quantity: 1,
            unitPrice: base.total - (index === 0 ? 280 : 0),
            cost: Math.round(base.total * 0.5),
            options: assembly
              ? 'Alpine white · W250 × H216 × D65 cm · mirror fronts'
              : 'As selected · sample specification',
            catalogue: base.supplier + ' sample catalogue · p. 24',
            matched: index !== 4,
            groupId: 'g1',
          },
        ],
        groups: [group],
        tasks: [],
        events: [
          {
            id: 'received',
            title: 'Order received',
            source: channels[index] + ' · sample record',
            detail:
              'Original reference ' +
              [
                'MG-10004821',
                '#1140',
                'WA-0923',
                'AMZ-DEMO-4824',
                'MG-10004812',
                'EB-DEMO-4798',
                'MG-10004786',
                '#1108',
              ][index] +
              ' retained.',
            at:
              PREVIEW_NOW -
              (index < 4 ? (index + 1) * 3600000 : (index + 1) * DAY),
          },
          {
            id: 'payment',
            title:
              index === 2
                ? 'Invoice created · balance outstanding'
                : 'Payment recorded',
            source: 'Sample payment ledger',
            detail:
              money(base.paid, 2) +
              ' recorded of ' +
              money(base.total, 2) +
              '.',
            at: PREVIEW_NOW - (index + 1) * 3600000 + 60000,
          },
        ],
        note: '',
        issues:
          index === 4
            ? [
                'Supplier cost is £350 above the expected purchase cost. Request an amended confirmation or record a separately agreed cost before proceeding.',
              ]
            : [],
      };
      if (index === 0) {
        order.lines[0].name = 'Imperial sliding wardrobe';
        order.lines[0].unitPrice = 2435;
        order.lines[0].cost = 1300;
        order.lines.push(
          {
            id: 'l2',
            name: 'Extra interior shelf',
            supplier: 'Rauch',
            sku: 'DEMO-RAU-SHELF',
            article: 'SAMPLE-SHELF-45',
            quantity: 2,
            unitPrice: 40,
            cost: 35,
            options:
              '45 cm · texline interior · compatible with sample wardrobe',
            catalogue: 'Rauch sample accessories · p. 48',
            matched: true,
            groupId: 'g1',
          },
          {
            id: 'l3',
            name: 'Additional hanging rail',
            supplier: 'Rauch',
            sku: 'DEMO-RAU-RAIL',
            article: 'SAMPLE-RAIL-45',
            quantity: 1,
            unitPrice: 45,
            cost: 50,
            options: '45 cm · chrome finish',
            catalogue: 'Rauch sample accessories · p. 49',
            matched: true,
            groupId: 'g1',
          },
        );
      }
      if (index === 3) {
        order.product = 'Bedframe + bedside tables';
        order.supplier = 'Julian Bowen + Torelli';
        order.lines = [
          {
            ...order.lines[0],
            name: 'Maine king bedframe',
            quantity: 1,
            unitPrice: 500,
            cost: 245,
            options: 'King · dove grey · bedframe only',
          },
          {
            id: 'l2',
            name: 'Luna bedside table',
            supplier: 'Torelli',
            sku: 'DEMO-TOR-220',
            article: 'SAMPLE-LUNA-GREY',
            quantity: 2,
            unitPrice: 110,
            cost: 52,
            options: 'Grey oak · left and right pair',
            catalogue: 'Torelli sample catalogue · p. 12',
            matched: true,
            groupId: 'g2',
          },
        ];
        order.groups.push({
          ...group,
          id: 'g2',
          supplier: 'Torelli',
          route: 'Supplier → BStar',
          jobs: group.jobs.map((job) => ({ ...job })),
        });
      }
      if (index === 4)
        order.tasks.push({
          id: 'cost',
          title: 'Rauch confirmation needs checking',
          category: 'Exceptions',
          waitingFor: 'AH admin',
          detail: '£350 cost difference and an unresolved catalogue match.',
          nextAction: 'Review the confirmation against the original order.',
          dueAt: PREVIEW_NOW - 2 * 3600000,
        });
      if (index === 5)
        order.tasks.push({
          id: 'confirmation',
          title: 'Chase supplier confirmation',
          category: 'Follow-ups',
          waitingFor: 'Hypnos',
          detail: 'No confirmation recorded for 28 hours.',
          nextAction: 'Prepare a supplier chaser with the order reference.',
          dueAt: PREVIEW_NOW - 4 * 3600000,
        });
      if (index === 6) {
        order.city = 'Milton Keynes';
        order.tasks.push({
          id: 'assembly',
          title: 'Get an assembly appointment',
          category: 'Delivery & assembly',
          waitingFor: 'Flat Pack Pro',
          detail: 'Goods received and released. Appointment still outstanding.',
          nextAction: 'Ask the provider for its booking position.',
          dueAt: PREVIEW_NOW - 3600000,
        });
        order.events.push({
          id: 'receipt',
          title: 'Physical receipt confirmed',
          source: 'Flat Pack Pro · sample email',
          detail:
            'All items received. AH release recorded; awaiting customer appointment.',
          at: PREVIEW_NOW - 25 * 3600000,
        });
      }
      return order;
    }),
  };
}

export function makePack(order: OrderCase, now: number, revision = 1): Pack {
  const drafts: Draft[] = [];
  for (const group of order.groups) {
    const items = order.lines.filter((line) => line.groupId === group.id);
    const internalItems = items
      .map(
        (line) =>
          line.quantity +
          ' × ' +
          line.name +
          '\nArticle: ' +
          line.article +
          (line.colourCode ? '\nColour code: ' + line.colourCode : '') +
          '\nSelection: ' +
          line.options,
      )
      .join('\n\n');
    const plainItems = items
      .map((line) => line.quantity + ' × ' + line.name + ' — ' + line.options)
      .join('\n');
    drafts.push({
      id: group.id + '-supplier',
      kind: 'Supplier order',
      to: sampleContact(group.supplier),
      subject: 'New order · CC-' + order.customer + ' · ' + order.id,
      body:
        'Hello ' +
        group.supplier +
        ',\n\nPlease place the following order:\n\n' +
        internalItems +
        '\n\nDestination: ' +
        (hasAssembly(group)
          ? group.route + ' depot — confirm destination code before live use'
          : group.route.startsWith('AH')
            ? 'AH Interiors showroom'
            : 'Hold for BStar collection; date to follow') +
        '\nCharging: ' +
        group.charging +
        '\nReference: CC-' +
        order.customer +
        '\n\nPlease confirm every item, quantity, cost and delivery destination.\n\nKind regards,\nAH Interiors',
      timing: 'First · after your approval',
      reviewed: false,
    });
    drafts.push(
      hasAssembly(group)
        ? {
            id: group.id + '-provider',
            kind: 'Provider notice',
            to: sampleContact(group.route),
            subject:
              'Incoming ' + group.supplier + ' order · CC-' + order.customer,
            body:
              'Hello ' +
              group.route +
              ',\n\nOnce the supplier order is placed, these goods will be coming to you for delivery and assembly:\n\n' +
              plainItems +
              '\n\nCustomer: ' +
              order.customer +
              '\n' +
              order.address +
              '\n' +
              order.postcode +
              '\n' +
              order.email +
              '\nReference: CC-' +
              order.customer +
              '\n\nPlease acknowledge the incoming order and confirm physical receipt. Contact AH for release before arranging a customer appointment. No customer appointment is promised yet.\n\nKind regards,\nAH Interiors',
            timing: 'After supplier order placement · not after confirmation',
            reviewed: false,
          }
        : {
            id: group.id + '-transport',
            kind: 'Transport instructions',
            to: 'bookings@bstar.example.com',
            subject: 'Prepare collection and delivery · CC-' + order.customer,
            body:
              'Origin: ' +
              (group.route.startsWith('AH')
                ? 'AH Interiors showroom'
                : group.supplier +
                  ' — collection address to verify before booking') +
              '\nDestination: ' +
              order.address +
              ', ' +
              order.postcode +
              '\nCustomer reference: CC-' +
              order.customer +
              '\n\n' +
              plainItems +
              '\n\nCreate and link separate collection and final delivery jobs when booking. Verify package count, weight, crew and service level in the portal. Use the delivery window returned by BStar; do not invent a date.\n\nHOLD: These are planning instructions, not a booking. Confirm goods are ready and all booking details before execution.',
            timing: 'Held · goods readiness and portal details required',
            reviewed: false,
          },
    );
  }
  drafts.push({
    id: 'customer',
    kind: 'Customer update',
    to: order.email,
    subject: 'Your AH Interiors order · ' + order.sourceRef,
    body:
      'Hello ' +
      order.customer.split(' ')[0] +
      ',\n\nThank you for your order. We have recorded your payment and are preparing the next steps for:\n\n' +
      order.lines
        .map((line) => line.quantity + ' × ' + line.name + ' — ' + line.options)
        .join('\n') +
      '\n\n' +
      (order.groups.length > 1
        ? 'Your items come from different suppliers. We will confirm the delivery arrangements with you before making a separate delivery that affects your charges or agreed arrangements.\n\n'
        : '') +
      'We will update you when the supplier confirms the order and the delivery arrangements are available. No delivery date is confirmed yet.\n\nKind regards,\nAH Interiors',
    timing: 'After supplier order placement',
    reviewed: false,
  });
  return {
    revision,
    state: 'Draft',
    drafts,
    checks: {
      specification: false,
      routing: false,
      payment: false,
      split: order.groups.length < 2,
    },
    preparedAt: now,
  };
}

export function approvalBlockers(order: OrderCase): string[] {
  const blockers: string[] = [];
  if (!order.lines.length || !order.groups.length)
    blockers.push('The order must contain products and supplier groups.');
  if (!isPaid(order)) blockers.push('Full payment must be verified.');
  if (!order.pack) return [...blockers, 'Prepare the order pack first.'];
  const requiredDraftIds = makePack(order, order.pack.preparedAt).drafts.map(
    (draft) => draft.id,
  );
  if (
    requiredDraftIds.length !== order.pack.drafts.length ||
    requiredDraftIds.some(
      (id) =>
        order.pack!.drafts.filter((draft) => draft.id === id).length !== 1,
    )
  )
    blockers.push(
      'The complete draft set must cover every supplier group and the customer.',
    );
  if (
    order.lines.some(
      (line) =>
        !line.matched ||
        !line.article.trim() ||
        !line.supplier.trim() ||
        line.quantity <= 0,
    )
  )
    blockers.push('Resolve every catalogue match and article code.');
  if (order.lines.some((line) => line.costVerified === false))
    blockers.push('Verify the supplier cost for every new product.');
  if (order.groups.some((group) => !group.coverageChecked))
    blockers.push('Review the postcode coverage for every route.');
  if (
    order.lines.some(
      (line) =>
        !order.groups.some(
          (group) =>
            group.id === line.groupId && group.supplier === line.supplier,
        ),
    )
  )
    blockers.push('Each item needs a matching supplier fulfilment group.');
  blockers.push(...order.issues);
  if (
    order.pack.drafts.some(
      (draft) =>
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.to) ||
        !draft.subject.trim() ||
        !draft.body.trim(),
    )
  )
    blockers.push('Every draft needs a valid recipient, subject and body.');
  if (order.pack.drafts.some((draft) => !draft.reviewed))
    blockers.push('Review each message and transport instruction.');
  if (
    !order.pack.checks.specification ||
    !order.pack.checks.routing ||
    !order.pack.checks.payment
  )
    blockers.push('Complete the three approval checks.');
  if (order.groups.length > 1 && !order.pack.checks.split)
    blockers.push('Approve the mixed-order delivery plan.');
  return blockers;
}

export type OperationsAction =
  | { type: 'prepare'; id: string; now: number }
  | {
      type: 'draft';
      id: string;
      draftId: string;
      patch: Partial<Pick<Draft, 'to' | 'subject' | 'body' | 'reviewed'>>;
    }
  | { type: 'check'; id: string; key: keyof Pack['checks']; value: boolean }
  | { type: 'approve'; id: string; now: number }
  | { type: 'revise'; id: string; now: number }
  | {
      type: 'line';
      id: string;
      lineId: string;
      article: string;
      matched: boolean;
      cost?: number;
      now: number;
    }
  | {
      type: 'route';
      id: string;
      groupId: string;
      route: Route;
      checked: boolean;
      now: number;
    }
  | { type: 'note'; id: string; text: string; now: number }
  | { type: 'snooze'; id: string; taskId: string; now: number }
  | { type: 'payment'; id: string; reference: string; now: number }
  | {
      type: 'evidence';
      id: string;
      groupId: string;
      event: 'receipt' | 'release' | 'booking' | 'delivery' | 'assembly';
      detail: string;
      now: number;
    };

export function operationsReducer(
  state: OperationsState,
  action: OperationsAction,
): OperationsState {
  return {
    cases: state.cases.map((order) => {
      if (order.id !== action.id) return order;
      const log = (title: string, detail: string, now: number) => [
        ...order.events,
        {
          id: 'event-' + order.events.length + '-' + now,
          title,
          detail,
          at: now,
          source: 'Amir · local preview',
        },
      ];
      if (action.type === 'prepare') {
        if (!isPaid(order) || order.pack || order.status !== 'New')
          return order;
        return {
          ...order,
          pack: makePack(order, action.now),
          events: log(
            'Order pack prepared',
            'Drafts created for review. No supplier order placed or message sent.',
            action.now,
          ),
        };
      }
      if (action.type === 'draft' && order.pack?.state === 'Draft')
        return {
          ...order,
          pack: {
            ...order.pack,
            checks:
              'reviewed' in action.patch
                ? order.pack.checks
                : {
                    specification: false,
                    routing: false,
                    payment: false,
                    split: order.groups.length < 2,
                  },
            drafts: order.pack.drafts.map((draft) =>
              draft.id === action.draftId
                ? {
                    ...draft,
                    ...action.patch,
                    reviewed:
                      'reviewed' in action.patch
                        ? Boolean(action.patch.reviewed)
                        : false,
                  }
                : draft,
            ),
          },
        };
      if (action.type === 'check' && order.pack?.state === 'Draft')
        return {
          ...order,
          pack: {
            ...order.pack,
            checks: { ...order.pack.checks, [action.key]: action.value },
          },
        };
      if (
        action.type === 'approve' &&
        order.pack?.state === 'Draft' &&
        !approvalBlockers(order).length
      )
        return {
          ...order,
          pack: { ...order.pack, state: 'Approved', approvedAt: action.now },
          events: log(
            'Approval recorded · preview only',
            'Revision ' +
              order.pack.revision +
              ' approved. Nothing sent, purchased or booked. Live execution awaits the backend.',
            action.now,
          ),
        };
      if (action.type === 'revise' && order.pack?.state === 'Approved')
        return {
          ...order,
          pack: {
            ...order.pack,
            state: 'Draft',
            approvedAt: undefined,
            revision: order.pack.revision + 1,
            checks: {
              specification: false,
              routing: false,
              payment: false,
              split: order.groups.length < 2,
            },
            drafts: order.pack.drafts.map((draft) => ({
              ...draft,
              reviewed: false,
            })),
          },
          events: log(
            'New revision opened',
            'Previous approval does not authorise this revision.',
            action.now,
          ),
        };
      if (action.type === 'line' || action.type === 'route') {
        if (
          action.type === 'line' &&
          action.cost !== undefined &&
          (!Number.isFinite(action.cost) || action.cost < 0)
        )
          return order;
        if (order.pack?.state === 'Approved' || order.status !== 'New')
          return order;
        const updated =
          action.type === 'line'
            ? {
                ...order,
                lines: order.lines.map((line) =>
                  line.id === action.lineId
                    ? {
                        ...line,
                        article: action.article,
                        cost: action.cost ?? line.cost,
                        costVerified:
                          action.cost !== undefined ? true : line.costVerified,
                        matched:
                          action.matched && Boolean(action.article.trim()),
                      }
                    : line,
                ),
              }
            : {
                ...order,
                groups: order.groups.map((group) =>
                  group.id === action.groupId
                    ? {
                        ...group,
                        route: action.route,
                        charging: action.route.includes('BStar')
                          ? 'AH BStar account · sample rate'
                          : 'AH pays provider directly · sample rate',
                        coverageChecked: action.checked,
                        assembly:
                          action.route === 'ProBuild' ||
                          action.route === 'Flat Pack Pro'
                            ? ('Awaiting booking' as const)
                            : ('Not required' as const),
                        jobs: action.route.includes('BStar')
                          ? [
                              {
                                type: 'Collection' as const,
                                ref: 'Not booked',
                                status: 'Not booked' as const,
                                window: 'Awaiting BStar portal',
                              },
                              {
                                type: 'Delivery' as const,
                                ref: 'Not booked',
                                status: 'Not booked' as const,
                                window: 'Awaiting BStar portal',
                              },
                            ]
                          : [],
                      }
                    : group,
                ),
              };
        return {
          ...updated,
          pack: order.pack
            ? makePack(updated, action.now, order.pack.revision + 1)
            : undefined,
          events: log(
            'Specification or route updated',
            'Dependent pack drafts regenerated; review checks reset.',
            action.now,
          ),
        };
      }
      if (action.type === 'note' && action.text.trim())
        return {
          ...order,
          note: action.text.trim(),
          events: log('Internal note added', action.text.trim(), action.now),
        };
      if (action.type === 'snooze')
        return {
          ...order,
          tasks: order.tasks.map((task) =>
            task.id === action.taskId
              ? { ...task, dueAt: action.now + DAY }
              : task,
          ),
          events: log(
            'Reminder moved to tomorrow',
            'Internal reminder only. No follow-up sent and no operational status changed.',
            action.now,
          ),
        };
      if (
        action.type === 'payment' &&
        action.reference.trim() &&
        order.channel === 'WhatsApp' &&
        !isPaid(order)
      )
        return {
          ...order,
          paid: order.total,
          paymentVerified: true,
          paymentReference: action.reference.trim() + ' · preview evidence',
          events: log(
            'Full payment recorded · sample evidence',
            action.reference.trim() +
              '. No bank transaction or live verification performed.',
            action.now,
          ),
        };
      if (action.type === 'evidence' && action.detail.trim()) {
        const group = order.groups.find((item) => item.id === action.groupId);
        if (!group || group.supplierStatus !== 'Confirmed') return order;
        if (action.event !== 'receipt' && (!group.receipt || !isPaid(order)))
          return order;
        if (
          ['booking', 'delivery', 'assembly'].includes(action.event) &&
          !group.released
        )
          return order;
        if (
          action.event === 'assembly' &&
          (!group.delivery || !hasAssembly(group))
        )
          return order;
        const updated: OrderCase = {
          ...order,
          tasks: order.tasks.map((task) =>
            task.id === 'assembly' && action.event === 'booking'
              ? {
                  ...task,
                  title: 'Follow up delivery & assembly completion',
                  detail:
                    'Appointment recorded. Written completion is still needed.',
                  nextAction:
                    'Request the confirmed completion position and fitter report.',
                  dueAt: action.now + DAY,
                }
              : task,
          ),
          groups: order.groups.map((item) =>
            item.id !== group.id
              ? item
              : {
                  ...item,
                  receipt: item.receipt || action.event === 'receipt',
                  released: item.released || action.event === 'release',
                  delivery: item.delivery || action.event === 'delivery',
                  assembly:
                    action.event === 'assembly'
                      ? 'Complete'
                      : action.event === 'booking' && hasAssembly(item)
                        ? 'Booked'
                        : item.assembly,
                  jobs:
                    action.event === 'delivery'
                      ? item.jobs.map((job) =>
                          job.type === 'Delivery'
                            ? { ...job, status: 'Done' }
                            : job,
                        )
                      : item.jobs,
                },
          ),
          events: log(
            'Recorded ' + action.event + ' evidence',
            action.detail,
            action.now,
          ),
        };
        return completed(updated) ? { ...updated, tasks: [] } : updated;
      }
      return order;
    }),
  };
}

export function dueLabel(dueAt: number, now: number) {
  const hours = Math.max(1, Math.ceil(Math.abs(now - dueAt) / 3600000));
  return dueAt <= now ? hours + 'h overdue' : 'Due in ' + hours + 'h';
}

export function movementRows(cases: OrderCase[]) {
  return cases.flatMap((order) =>
    order.groups
      .filter(
        (group) =>
          !completed(order) &&
          (hasAssembly(group)
            ? group.receipt && group.assembly !== 'Complete'
            : !group.delivery &&
              group.jobs.some((job) => job.status === 'Booked')),
      )
      .map((group) => ({
        order,
        group,
        label: hasAssembly(group)
          ? group.route +
            ' · ' +
            (group.assembly === 'Booked'
              ? 'Appointment recorded'
              : group.delivery
                ? 'Assembly still pending'
                : 'Awaiting appointment')
          : 'BStar · ' +
            (group.jobs.find((job) => job.type === 'Delivery')?.window ||
              'Awaiting delivery window'),
        detail: hasAssembly(group)
          ? group.delivery
            ? 'Delivery confirmed; completion evidence pending'
            : 'Receipt confirmed; delivery not complete'
          : 'Collection: ' +
            (group.jobs.find((job) => job.type === 'Collection')?.status ||
              'Not booked') +
            ' · delivery not complete',
      })),
  );
}
