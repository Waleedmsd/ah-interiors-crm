import {
  createOperationsState,
  operationsReducer,
  PREVIEW_NOW,
  type OperationsState,
  type OperationsAction,
  type OrderCase,
  type Channel,
  type Route,
  type Group,
} from '@/lib/operations';
export type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postcode: string;
  createdAt: number;
};
export type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unitPence: number;
};
export type Payment = {
  id: string;
  amountPence: number;
  reference: string;
  method: string;
  at: number;
};
export type Invoice = {
  id: string;
  customerId: string;
  orderId?: string;
  lifecycle: 'Draft' | 'Issued' | 'Void';
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  discountPence: number;
  taxBps: number;
  notes: string;
  payments: Payment[];
  customerSnapshot?: Customer;
  createdAt: number;
  issuedAt?: number;
  emailDraft?: { to: string; subject: string; body: string; savedAt: number };
  history: { title: string; detail: string; at: number }[];
};
export type CommerceState = {
  version: 3;
  operations: OperationsState;
  customers: Customer[];
  invoices: Invoice[];
  nextOrder: number;
  nextCustomer: number;
  nextInvoice: number;
};
export type NewOrderLine = {
  productId?: string;
  name: string;
  supplier: string;
  article: string;
  quantity: number;
  unitPence: number;
  options: string;
  route: Route;
};
export type NewOrderInput = {
  requestId: string;
  customerId?: string;
  customer?: Omit<Customer, 'id' | 'createdAt'>;
  channel: Channel;
  sourceRef: string;
  lines: NewOrderLine[];
  deliveryPence: number;
  note: string;
  now: number;
};
export type NewInvoiceInput = {
  customerId: string;
  orderId?: string;
  issueDate: string;
  dueDate: string;
  lines: InvoiceLine[];
  discountPence: number;
  taxBps: number;
  notes: string;
  now: number;
};
export type CommerceAction =
  | {
      type: 'create-customer';
      customer: Omit<Customer, 'id' | 'createdAt'>;
      now: number;
    }
  | { type: 'operation'; action: OperationsAction }
  | { type: 'create-order'; input: NewOrderInput }
  | { type: 'create-invoice'; id: string; input: NewInvoiceInput }
  | { type: 'edit-invoice'; id: string; input: NewInvoiceInput }
  | { type: 'issue-invoice'; id: string; now: number }
  | { type: 'pay-invoice'; id: string; payment: Payment }
  | { type: 'void-invoice'; id: string; reason: string; now: number }
  | {
      type: 'invoice-email';
      id: string;
      to: string;
      subject: string;
      body: string;
      now: number;
    };
export type CommerceResult = {
  state: CommerceState;
  error?: string;
  id?: string;
};
export const pence = (value: number) => Math.round(value * 100);
export function parsePounds(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return NaN;
  return Math.round(Number(value) * 100);
}
export const dateKey = (now: number) =>
  new Date(now).toISOString().slice(0, 10);
export const invoiceTotals = (
  invoice: Pick<Invoice, 'lines' | 'discountPence' | 'taxBps' | 'payments'>,
) => {
  const subtotal = invoice.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPence,
    0,
  );
  const net = subtotal - invoice.discountPence;
  const tax = Math.round((net * invoice.taxBps) / 10000);
  const total = net + tax;
  const paid = invoice.payments.reduce(
    (sum, payment) => sum + payment.amountPence,
    0,
  );
  return {
    subtotal,
    discount: invoice.discountPence,
    tax,
    total,
    paid,
    balance: total - paid,
  };
};
export function invoiceStatus(
  invoice: Invoice,
): 'Draft' | 'Paid' | 'Partially paid' | 'Due' | 'Void' {
  if (invoice.lifecycle !== 'Issued') return invoice.lifecycle;
  const totals = invoiceTotals(invoice);
  return totals.balance === 0
    ? 'Paid'
    : totals.paid > 0
      ? 'Partially paid'
      : 'Due';
}
export const invoiceOverdue = (invoice: Invoice, now: number) =>
  invoice.lifecycle === 'Issued' &&
  invoiceTotals(invoice).balance > 0 &&
  invoice.dueDate < dateKey(now);
export const customerForInvoice = (state: CommerceState, invoice: Invoice) =>
  invoice.customerSnapshot ||
  state.customers.find((customer) => customer.id === invoice.customerId)!;
export const invoiceForOrder = (state: CommerceState, orderId: string) =>
  state.invoices.find(
    (invoice) => invoice.orderId === orderId && invoice.lifecycle !== 'Void',
  );
export const nextInvoiceId = (state: CommerceState) =>
  'INV-2026-' + String(state.nextInvoice).padStart(4, '0');
export function accountTotals(invoices: Invoice[], now: number) {
  const active = invoices.filter((invoice) => invoice.lifecycle === 'Issued');
  return active.reduce(
    (sum, invoice) => {
      const value = invoiceTotals(invoice);
      return {
        invoiced: sum.invoiced + value.total,
        paid: sum.paid + value.paid,
        outstanding: sum.outstanding + value.balance,
        overdue:
          sum.overdue + (invoiceOverdue(invoice, now) ? value.balance : 0),
      };
    },
    { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 },
  );
}
export function invoiceInputForOrder(
  order: OrderCase,
  now: number,
): NewInvoiceInput {
  const lines = order.lines.map((line) => ({
    id: line.id,
    description: line.name + (line.options ? ' — ' + line.options : ''),
    quantity: line.quantity,
    unitPence: pence(line.unitPrice),
  }));
  const services =
    pence(order.total) -
    lines.reduce((sum, line) => sum + line.quantity * line.unitPence, 0);
  if (services > 0)
    lines.push({
      id: 'services',
      description: 'Delivery and selected services',
      quantity: 1,
      unitPence: services,
    });
  return {
    customerId: order.customerId!,
    orderId: order.id,
    lines,
    issueDate: dateKey(now),
    dueDate: dateKey(now + 7 * 86400000),
    discountPence: 0,
    taxBps: 0,
    notes: 'Order-linked total. Tax is not itemised in this local preview.',
    now,
  };
}
export function createCommerceState(): CommerceState {
  const operations = createOperationsState();
  const customers: Customer[] = operations.cases.map((order, index) => ({
    id: 'C-' + String(index + 1).padStart(4, '0'),
    name: order.customer,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    postcode: order.postcode,
    createdAt: PREVIEW_NOW - 30 * 86400000,
  }));
  operations.cases = operations.cases.map((order, index) => ({
    ...order,
    customerId: customers[index].id,
  }));
  const invoices: Invoice[] = operations.cases.map((order, index) => ({
    ...invoiceInputForOrder(order, PREVIEW_NOW),
    id: order.invoice,
    customerId: order.customerId!,
    lifecycle: 'Issued',
    issueDate: '2026-09-01',
    dueDate: index === 2 ? '2026-09-03' : '2026-09-12',
    createdAt: PREVIEW_NOW - 4 * 86400000,
    issuedAt: PREVIEW_NOW - 4 * 86400000,
    customerSnapshot: { ...customers[index] },
    payments: order.paid
      ? [
          {
            id: 'seed-' + order.id,
            amountPence: pence(order.paid),
            reference: order.paymentReference,
            method: 'Sample ledger',
            at: PREVIEW_NOW - 3 * 86400000,
          },
        ]
      : [],
    history: [
      {
        title: 'Sample invoice imported',
        detail: 'Linked to order #' + order.id,
        at: PREVIEW_NOW - 4 * 86400000,
      },
    ],
  }));
  for (const [
    index,
    customerIndex,
    amount,
    lifecycle,
    dueDate,
    description,
  ] of [
    [1038, 1, 68000, 'Issued', '2026-09-12', 'Additional bedroom furniture'],
    [1039, 0, 24500, 'Issued', '2026-09-03', 'Showroom accessories'],
    [1040, 6, 19000, 'Draft', '2026-09-15', 'Additional service quotation'],
  ] as const) {
    invoices.push({
      id: 'INV-2026-' + index,
      customerId: customers[customerIndex].id,
      lifecycle,
      issueDate: '2026-09-01',
      dueDate,
      lines: [{ id: 'item1', description, quantity: 1, unitPence: amount }],
      discountPence: 0,
      taxBps: 0,
      notes: 'Sample invoice · tax not configured.',
      payments: [],
      customerSnapshot:
        lifecycle === 'Issued' ? { ...customers[customerIndex] } : undefined,
      createdAt: PREVIEW_NOW - 4 * 86400000,
      history: [
        {
          title: 'Sample invoice created',
          detail: 'Linked to the existing customer account.',
          at: PREVIEW_NOW - 4 * 86400000,
        },
      ],
    });
  }
  return {
    version: 3,
    operations,
    customers,
    invoices,
    nextOrder: 1,
    nextCustomer: 9,
    nextInvoice: 1041,
  };
}
const validMoney = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 10000000000;
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function validateInvoiceInput(
  state: CommerceState,
  input: NewInvoiceInput,
): string | undefined {
  if (!state.customers.some((customer) => customer.id === input.customerId))
    return 'Choose a customer account.';
  if (
    !validDate(input.issueDate) ||
    !validDate(input.dueDate) ||
    input.dueDate < input.issueDate
  )
    return 'Enter valid invoice dates; the due date cannot precede the issue date.';
  if (
    !input.lines.length ||
    input.lines.some(
      (line) =>
        !line.description.trim() ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 10000 ||
        !validMoney(line.unitPence),
    )
  )
    return 'Every line needs a description, whole quantity and a valid GBP price.';
  if (
    !validMoney(input.discountPence) ||
    !Number.isInteger(input.taxBps) ||
    input.taxBps < 0 ||
    input.taxBps > 10000
  )
    return 'Check the discount and tax rate.';
  const total = invoiceTotals({ ...input, payments: [] });
  if (
    total.subtotal < input.discountPence ||
    !validMoney(total.total) ||
    total.total <= 0
  )
    return 'Invoice total must be greater than zero. Discount cannot exceed the subtotal.';
  if (input.orderId) {
    const order = state.operations.cases.find(
      (item) => item.id === input.orderId,
    );
    if (
      !order ||
      order.customerId !== input.customerId ||
      pence(order.total) !== total.total
    )
      return 'The invoice customer and total must match its linked order.';
  }
}
function syncInvoiceOrder(
  state: CommerceState,
  invoice: Invoice,
  title: string,
  at: number,
): CommerceState {
  if (!invoice.orderId) return state;
  return {
    ...state,
    operations: {
      ...state.operations,
      cases: state.operations.cases.map((order) =>
        order.id !== invoice.orderId
          ? order
          : {
              ...order,
              invoice: invoice.id,
              paid:
                invoice.lifecycle === 'Issued'
                  ? invoiceTotals(invoice).paid / 100
                  : 0,
              paymentVerified:
                invoice.lifecycle === 'Issued' &&
                invoiceTotals(invoice).balance === 0,
              paymentReference:
                invoice.payments.at(-1)?.reference ||
                'Awaiting verified payment',
              events: [
                ...order.events,
                {
                  id: 'invoice-' + invoice.id + '-' + order.events.length,
                  title,
                  detail:
                    invoice.id + ' · local invoice ledger; no money moved.',
                  source: 'Amir · local preview',
                  at,
                },
              ],
            },
      ),
    },
  };
}
export function applyCommerce(
  state: CommerceState,
  action: CommerceAction,
): CommerceResult {
  const fail = (error: string): CommerceResult => ({ state, error });
  if (action.type === 'create-customer') {
    const input = action.customer;
    if (
      !input.name.trim() ||
      !validEmail(input.email.trim()) ||
      !input.address.trim() ||
      !input.city.trim() ||
      !input.postcode.trim()
    )
      return fail('Complete the customer name, valid email and address.');
    if (
      state.customers.some(
        (item) => item.email.toLowerCase() === input.email.trim().toLowerCase(),
      )
    )
      return fail(
        'This email already belongs to a customer. Select their existing account.',
      );
    const customer = {
      ...input,
      id: 'C-' + String(state.nextCustomer).padStart(4, '0'),
      name: input.name.trim(),
      email: input.email.trim(),
      createdAt: action.now,
    };
    return {
      id: customer.id,
      state: {
        ...state,
        customers: [...state.customers, customer],
        nextCustomer: state.nextCustomer + 1,
      },
    };
  }
  if (action.type === 'operation') {
    if (action.action.type === 'payment') {
      const order = state.operations.cases.find(
        (item) => item.id === action.action.id,
      );
      const invoice = order && invoiceForOrder(state, order.id);
      if (
        invoice &&
        invoice.lifecycle === 'Issued' &&
        invoiceTotals(invoice).balance > 0
      )
        return applyCommerce(state, {
          type: 'pay-invoice',
          id: invoice.id,
          payment: {
            id: 'legacy-' + order.id + '-' + invoice.payments.length,
            amountPence: invoiceTotals(invoice).balance,
            reference: action.action.reference,
            method: 'Sample bank verification',
            at: action.action.now,
          },
        });
      return fail(
        'Issue the linked invoice and record payment from its payment panel.',
      );
    }
    return {
      state: {
        ...state,
        operations: operationsReducer(state.operations, action.action),
      },
    };
  }
  if (action.type === 'create-order') {
    const input = action.input;
    const existingRequest = state.operations.cases.find(
      (order) => order.creationRequest === input.requestId,
    );
    if (existingRequest) return { state, id: existingRequest.id };
    let customer = state.customers.find((item) => item.id === input.customerId);
    const newCustomer = !customer;
    if (!customer) {
      if (
        !input.customer?.name.trim() ||
        !validEmail(input.customer.email) ||
        !input.customer.address.trim() ||
        !input.customer.city.trim() ||
        !input.customer.postcode.trim()
      )
        return fail(
          'Complete the customer name, valid email and delivery address.',
        );
      if (
        state.customers.some(
          (item) =>
            item.email.toLowerCase() ===
            input.customer!.email.toLowerCase().trim(),
        )
      )
        return fail(
          'This email already belongs to a customer. Select their existing account.',
        );
      customer = {
        ...input.customer,
        id: 'C-' + String(state.nextCustomer).padStart(4, '0'),
        name: input.customer.name.trim(),
        email: input.customer.email.trim(),
        createdAt: input.now,
      };
    }
    if (!input.sourceRef.trim())
      return fail('Enter the original order reference.');
    if (
      state.operations.cases.some(
        (order) =>
          order.channel === input.channel &&
          order.sourceRef.trim().toLowerCase() ===
            input.sourceRef.trim().toLowerCase(),
      )
    )
      return fail('An order from this channel already uses that reference.');
    if (
      !input.lines.length ||
      input.lines.some(
        (line) =>
          !line.name.trim() ||
          !line.supplier.trim() ||
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 10000 ||
          !validMoney(line.unitPence),
      )
    )
      return fail('Add a product with supplier, quantity and a valid price.');
    if (!validMoney(input.deliveryPence))
      return fail('Enter a valid delivery and service charge.');
    const total =
      input.lines.reduce(
        (sum, line) => sum + line.unitPence * line.quantity,
        0,
      ) + input.deliveryPence;
    if (!validMoney(total) || total <= 0)
      return fail('Order total must be greater than zero.');
    const id = 'L-' + String(state.nextOrder).padStart(6, '0');
    const groups: Group[] = [];
    const lines = input.lines.map((line, index) => {
      let group = groups.find(
        (group) =>
          group.supplier === line.supplier && group.route === line.route,
      );
      if (!group) {
        group = {
          id: 'g' + (groups.length + 1),
          supplier: line.supplier,
          route: line.route,
          charging: 'Not verified · review current terms',
          coverageChecked: false,
          supplierStatus: 'Not ordered',
          receipt: false,
          released: false,
          delivery: false,
          assembly: line.route.includes('BStar')
            ? 'Not required'
            : 'Awaiting booking',
          jobs: line.route.includes('BStar')
            ? [
                {
                  type: 'Collection',
                  ref: 'Not booked',
                  status: 'Not booked',
                  window: 'Awaiting BStar portal',
                },
                {
                  type: 'Delivery',
                  ref: 'Not booked',
                  status: 'Not booked',
                  window: 'Awaiting BStar portal',
                },
              ]
            : [],
        };
        groups.push(group);
      }
      return {
        id: 'l' + (index + 1),
        name: line.name.trim(),
        supplier: line.supplier,
        productId: line.productId,
        sku: 'Custom item',
        article: line.article.trim(),
        quantity: line.quantity,
        unitPrice: line.unitPence / 100,
        cost: 0,
        costVerified: false,
        options: line.options.trim(),
        catalogue: 'Awaiting catalogue verification',
        matched: false,
        groupId: group.id,
      };
    });
    const invoiceId = nextInvoiceId(state);
    const order: OrderCase = {
      id,
      customerId: customer.id,
      creationRequest: input.requestId,
      customer: customer.name,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      postcode: customer.postcode,
      initials: customer.name
        .split(/\s+/)
        .map((word) => word[0])
        .slice(0, 2)
        .join('')
        .toUpperCase(),
      color: 'blue',
      product: input.lines.map((line) => line.name).join(' + '),
      supplier: Array.from(
        new Set(input.lines.map((line) => line.supplier)),
      ).join(' + '),
      total: total / 100,
      paid: 0,
      paymentVerified: false,
      paymentReference: 'Awaiting verified payment',
      invoice: invoiceId,
      channel: input.channel,
      sourceRef: input.sourceRef.trim(),
      supplierSource: 'Manually selected suppliers · catalogue checks required',
      status: 'New',
      date: new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/London',
      }).format(input.now),
      lines,
      groups,
      tasks: [],
      events: [
        {
          id: 'created',
          title: 'Order created locally',
          detail:
            'Invoice draft prepared. Payment and product checks are required before supplier approval.',
          source: 'Amir · local preview',
          at: input.now,
        },
      ],
      note: input.note.trim(),
      issues: [],
    };
    const invoiceInput = invoiceInputForOrder(order, input.now);
    const invoice: Invoice = {
      ...invoiceInput,
      id: invoiceId,
      lifecycle: 'Draft',
      payments: [],
      createdAt: input.now,
      history: [
        {
          title: 'Draft generated from order',
          detail: '#' + id,
          at: input.now,
        },
      ],
    };
    return {
      id,
      state: {
        ...state,
        customers: newCustomer
          ? [...state.customers, customer]
          : state.customers,
        operations: {
          ...state.operations,
          cases: [order, ...state.operations.cases],
        },
        invoices: [invoice, ...state.invoices],
        nextOrder: state.nextOrder + 1,
        nextInvoice: state.nextInvoice + 1,
        nextCustomer: state.nextCustomer + (newCustomer ? 1 : 0),
      },
    };
  }
  if (action.type === 'create-invoice') {
    const existingNumber = state.invoices.find(
      (invoice) => invoice.id === action.id,
    );
    if (existingNumber) {
      const fields = (item: NewInvoiceInput | Invoice) =>
        JSON.stringify([
          item.customerId,
          item.orderId,
          item.issueDate,
          item.dueDate,
          item.lines,
          item.discountPence,
          item.taxBps,
          item.notes,
        ]);
      return fields(existingNumber) === fields(action.input)
        ? { state, id: action.id }
        : fail(
            'This invoice number already exists. Reopen the editor to generate a fresh number.',
          );
    }
    if (action.input.orderId) {
      const existing = invoiceForOrder(state, action.input.orderId);
      if (existing) return { state, id: existing.id };
    }
    const error = validateInvoiceInput(state, action.input);
    if (error) return fail(error);
    const invoice: Invoice = {
      ...action.input,
      id: action.id,
      lifecycle: 'Draft',
      payments: [],
      createdAt: action.input.now,
      history: [
        {
          title: 'Invoice draft created',
          detail: 'No invoice email sent.',
          at: action.input.now,
        },
      ],
    };
    const next = {
      ...state,
      invoices: [invoice, ...state.invoices],
      nextInvoice: state.nextInvoice + 1,
    };
    return {
      id: invoice.id,
      state: syncInvoiceOrder(
        next,
        invoice,
        'Invoice draft created',
        action.input.now,
      ),
    };
  }
  const invoice = state.invoices.find((item) => item.id === action.id);
  if (!invoice) return fail('Invoice not found.');
  let updated: Invoice = invoice;
  let title = '';
  let at = 'now' in action ? action.now : PREVIEW_NOW;
  if (action.type === 'edit-invoice') {
    if (invoice.lifecycle !== 'Draft')
      return fail('Only draft invoices can be edited.');
    if (
      invoice.orderId !== action.input.orderId ||
      invoice.customerId !== action.input.customerId
    )
      return fail('The linked customer and order cannot be changed.');
    const error = validateInvoiceInput(state, action.input);
    if (error) return fail(error);
    updated = { ...invoice, ...action.input, emailDraft: undefined };
    at = action.input.now;
    title = 'Invoice draft updated';
  } else if (action.type === 'issue-invoice') {
    if (invoice.lifecycle === 'Issued') return { state, id: invoice.id };
    if (invoice.lifecycle === 'Void')
      return fail('A void invoice cannot be issued.');
    const error = validateInvoiceInput(state, { ...invoice, now: action.now });
    if (error) return fail(error);
    updated = {
      ...invoice,
      lifecycle: 'Issued',
      issuedAt: action.now,
      customerSnapshot: {
        ...state.customers.find((item) => item.id === invoice.customerId)!,
      },
      emailDraft: undefined,
    };
    title = 'Invoice issued locally';
  } else if (action.type === 'pay-invoice') {
    const payment = action.payment;
    if (invoice.payments.some((item) => item.id === payment.id))
      return { state, id: invoice.id };
    if (invoice.lifecycle !== 'Issued')
      return fail('Issue the invoice before recording a payment.');
    if (
      !validMoney(payment.amountPence) ||
      payment.amountPence <= 0 ||
      payment.amountPence > invoiceTotals(invoice).balance ||
      !payment.reference.trim() ||
      !payment.method.trim() ||
      !Number.isFinite(payment.at)
    )
      return fail(
        'Enter a positive payment no greater than the balance, with its reference.',
      );
    if (
      invoice.payments.some(
        (item) =>
          item.reference.trim().toLowerCase() ===
          payment.reference.trim().toLowerCase(),
      )
    )
      return fail('This payment reference is already recorded on the invoice.');
    updated = {
      ...invoice,
      payments: [
        ...invoice.payments,
        { ...payment, reference: payment.reference.trim() },
      ],
      emailDraft: undefined,
    };
    at = payment.at;
    title = 'Payment recorded · local ledger';
  } else if (action.type === 'void-invoice') {
    if (invoice.lifecycle === 'Void') return { state, id: invoice.id };
    if (invoice.payments.length)
      return fail(
        'A paid or partially paid invoice cannot be voided. A separate refund or credit process is required.',
      );
    if (!action.reason.trim())
      return fail('Record a reason for voiding the invoice.');
    updated = { ...invoice, lifecycle: 'Void', emailDraft: undefined };
    title = 'Invoice voided: ' + action.reason.trim();
  } else if (action.type === 'invoice-email') {
    if (invoice.lifecycle !== 'Issued')
      return fail('Issue the invoice before preparing its customer email.');
    if (!validEmail(action.to) || !action.subject.trim() || !action.body.trim())
      return fail('Complete the recipient, subject and email body.');
    updated = {
      ...invoice,
      emailDraft: {
        to: action.to,
        subject: action.subject,
        body: action.body,
        savedAt: action.now,
      },
    };
    title = 'Customer email draft saved · not sent';
  }
  updated = {
    ...updated,
    history: [
      ...updated.history,
      { title, detail: 'Amir · local preview', at },
    ],
  };
  const next = {
    ...state,
    invoices: state.invoices.map((item) =>
      item.id === updated.id ? updated : item,
    ),
  };
  return {
    id: updated.id,
    state:
      action.type === 'pay-invoice' ||
      action.type === 'issue-invoice' ||
      action.type === 'void-invoice'
        ? syncInvoiceOrder(next, updated, title, at)
        : next,
  };
}

export function parseSavedCommerce(raw: string): CommerceState | null {
  try {
    const value = JSON.parse(raw) as CommerceState;
    if (
      value.version !== 3 ||
      !Array.isArray(value.customers) ||
      !Array.isArray(value.invoices) ||
      !Array.isArray(value.operations?.cases) ||
      ![value.nextOrder, value.nextCustomer, value.nextInvoice].every(
        (item) => Number.isSafeInteger(item) && item > 0,
      )
    )
      return null;
    if (
      new Set(value.customers.map((item) => item.id)).size !==
        value.customers.length ||
      new Set(value.invoices.map((item) => item.id)).size !==
        value.invoices.length ||
      new Set(value.operations.cases.map((item) => item.id)).size !==
        value.operations.cases.length
    )
      return null;
    if (
      value.customers.some(
        (item) =>
          !item.id ||
          typeof item.name !== 'string' ||
          typeof item.email !== 'string' ||
          typeof item.address !== 'string' ||
          typeof item.city !== 'string' ||
          typeof item.postcode !== 'string',
      )
    )
      return null;
    if (
      value.invoices.some(
        (item) =>
          !['Draft', 'Issued', 'Void'].includes(item.lifecycle) ||
          !Array.isArray(item.payments) ||
          !Array.isArray(item.history) ||
          validateInvoiceInput(value, { ...item, now: PREVIEW_NOW }) ||
          item.payments.some(
            (payment) =>
              !validMoney(payment.amountPence) || payment.amountPence <= 0,
          ) ||
          invoiceTotals(item).balance < 0,
      )
    )
      return null;
    if (
      value.operations.cases.some(
        (item) =>
          !value.customers.some(
            (customer) => customer.id === item.customerId,
          ) ||
          !Array.isArray(item.lines) ||
          !Array.isArray(item.groups) ||
          !Array.isArray(item.events) ||
          !Array.isArray(item.tasks) ||
          typeof item.customer !== 'string' ||
          !Number.isFinite(item.total) ||
          !Number.isFinite(item.paid),
      )
    )
      return null;
    const activeOrderInvoices = value.invoices.filter(
      (item) => item.orderId && item.lifecycle !== 'Void',
    );
    if (
      new Set(activeOrderInvoices.map((item) => item.orderId)).size !==
      activeOrderInvoices.length
    )
      return null;
    for (const item of value.invoices) {
      if (
        !item.id ||
        !Number.isFinite(item.createdAt) ||
        typeof item.notes !== 'string' ||
        (item.lifecycle !== 'Issued' && item.payments.length > 0)
      )
        return null;
      if (
        item.lifecycle === 'Issued' &&
        (!item.customerSnapshot ||
          item.customerSnapshot.id !== item.customerId ||
          typeof item.customerSnapshot.name !== 'string' ||
          typeof item.customerSnapshot.email !== 'string' ||
          typeof item.customerSnapshot.address !== 'string' ||
          typeof item.customerSnapshot.city !== 'string' ||
          typeof item.customerSnapshot.postcode !== 'string')
      )
        return null;
      if (
        new Set(item.lines.map((line) => line.id)).size !== item.lines.length ||
        item.lines.some((line) => !line.id)
      )
        return null;
      if (
        new Set(item.payments.map((payment) => payment.id)).size !==
          item.payments.length ||
        item.payments.some(
          (payment) =>
            !payment.id ||
            typeof payment.reference !== 'string' ||
            !payment.reference.trim() ||
            typeof payment.method !== 'string' ||
            !payment.method.trim() ||
            !Number.isFinite(payment.at),
        )
      )
        return null;
      if (
        new Set(
          item.payments.map((payment) =>
            payment.reference.trim().toLowerCase(),
          ),
        ).size !== item.payments.length
      )
        return null;
      if (
        item.history.some(
          (event) =>
            typeof event.title !== 'string' ||
            typeof event.detail !== 'string' ||
            !Number.isFinite(event.at),
        )
      )
        return null;
    }
    for (const order of value.operations.cases) {
      if (
        !Array.isArray(order.issues) ||
        !order.issues.every((issue) => typeof issue === 'string') ||
        typeof order.sourceRef !== 'string' ||
        typeof order.status !== 'string' ||
        typeof order.email !== 'string'
      )
        return null;
      if (
        order.lines.some(
          (line) =>
            typeof line.id !== 'string' ||
            typeof line.name !== 'string' ||
            typeof line.article !== 'string' ||
            typeof line.supplier !== 'string' ||
            typeof line.options !== 'string' ||
            !validMoney(pence(line.unitPrice)) ||
            !Number.isInteger(line.quantity) ||
            line.quantity < 1 ||
            !Number.isFinite(line.cost) ||
            line.cost < 0,
        )
      )
        return null;
      if (
        order.groups.some(
          (group) =>
            typeof group.id !== 'string' ||
            typeof group.supplier !== 'string' ||
            typeof group.route !== 'string' ||
            !Array.isArray(group.jobs),
        )
      )
        return null;
      if (
        order.pack &&
        (!Array.isArray(order.pack.drafts) ||
          !order.pack.checks ||
          !['Draft', 'Approved'].includes(order.pack.state))
      )
        return null;
      const linked = activeOrderInvoices.find(
        (item) => item.orderId === order.id,
      );
      if (linked) {
        const ledgerPaid =
          linked.lifecycle === 'Issued' ? invoiceTotals(linked).paid : 0;
        if (
          order.invoice !== linked.id ||
          pence(order.paid) !== ledgerPaid ||
          order.paymentVerified !==
            (linked.lifecycle === 'Issued' &&
              invoiceTotals(linked).balance === 0)
        )
          return null;
      } else if (order.paid !== 0 || order.paymentVerified) return null;
    }
    const maxNumber = (ids: string[], expression: RegExp) =>
      Math.max(0, ...ids.map((id) => Number(id.match(expression)?.[1] || 0))) +
      1;
    value.nextOrder = Math.max(
      value.nextOrder,
      maxNumber(
        value.operations.cases.map((item) => item.id),
        /^L-(\d+)$/,
      ),
    );
    value.nextCustomer = Math.max(
      value.nextCustomer,
      maxNumber(
        value.customers.map((item) => item.id),
        /^C-(\d+)$/,
      ),
    );
    value.nextInvoice = Math.max(
      value.nextInvoice,
      maxNumber(
        value.invoices.map((item) => item.id),
        /^INV-2026-(\d+)$/,
      ),
    );
    return value;
  } catch {
    return null;
  }
}
