import { and, eq, ilike, isNull, or } from 'drizzle-orm';
import {
  accountTotals,
  invoiceTotals,
  type CommerceState,
} from '../../lib/commerce';
import {
  businessModules,
  canUseModule,
  type BusinessModule,
} from '../../lib/business-modules';
import { currentStatus, isPaid } from '../../lib/operations';
import { database } from '../db';
import {
  customers,
  invoices,
  notifications,
  orders,
  orderCostSheets,
  products,
  purchaseOrders,
  suppliers,
  supplierOrders,
} from '../db/schema';
import { authorize, hasPermission, type Staff } from '../permissions';
import { orderProfit } from './order-costs';
import { listSupplierOrders } from './purchasing';
import { recordHref } from '../../lib/record-links';
import { marginSettings } from './catalogue';
import { listRecords } from './operational';
import { readCommerce } from './commerce';

import { businessDate } from '../../lib/business-date';
import { businessOptions } from './business-options';
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const pence = (value: number) => Math.round(value);
const fieldText = (value: unknown): string =>
  typeof value === 'string' ? value : '';
const isOpen = (status: string) =>
  !['Completed', 'Closed', 'Resolved', 'Cancelled', 'Paid'].includes(status);

export async function dashboardData(staff: Staff) {
  const options = await businessOptions();
  const day = (offset = 0) =>
    new Date(businessDate(Date.now(), options.timeZone, offset) + 'T00:00:00Z');
  const today = () => businessDate(Date.now(), options.timeZone);
  const db = database();
  const result: Record<string, unknown> = {};
  if (hasPermission(staff, 'commerce.read')) {
    const state: CommerceState = (await readCommerce(staff)).data;
    const rows = state.operations.cases;
    const issued = state.invoices.filter((v) => v.lifecycle === 'Issued');
    const salesSince = (date: string) =>
      sum(
        issued
          .filter((v) => v.issueDate >= date)
          .map((v) => invoiceTotals(v).total),
      );
    const start = day();
    const week = day(-((start.getUTCDay() + 6) % 7));
    const month = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1),
    );
    const channelMap = new Map<
      string,
      { orders: number; revenuePence: number }
    >();
    for (const order of rows) {
      const v = channelMap.get(order.channel) ?? { orders: 0, revenuePence: 0 };
      v.orders++;
      v.revenuePence += pence(order.total * 100);
      channelMap.set(order.channel, v);
    }
    result.sales = {
      todayPence: salesSince(start.toISOString().slice(0, 10)),
      weekPence: salesSince(week.toISOString().slice(0, 10)),
      monthPence: salesSince(month.toISOString().slice(0, 10)),
      orderCount: rows.length,
      averageOrderPence: rows.length
        ? pence(sum(rows.map((v) => v.total * 100)) / rows.length)
        : 0,
      byChannel: [...channelMap]
        .map(([channel, v]) => ({ channel, ...v }))
        .sort((a, b) => b.revenuePence - a.revenuePence),
    };
    result.orders = {
      new: rows.filter((v) => v.status === 'New' && !v.pack).length,
      needsSupplierOrder: rows.filter((v) =>
        v.groups.some((g) => g.supplierStatus === 'Not ordered'),
      ).length,
      awaitingConfirmation: rows.filter((v) =>
        v.groups.some((g) => g.supplierStatus === 'Awaiting confirmation'),
      ).length,
      confirmed: rows.filter((v) =>
        v.groups.some((g) => g.supplierStatus === 'Confirmed' && !g.receipt),
      ).length,
      readyForDelivery: rows.filter(
        (v) => isPaid(v) && v.groups.some((g) => g.receipt && !g.delivery),
      ).length,
      completed: rows.filter((v) => currentStatus(v) === 'Complete').length,
    };
    if (['Management', 'Team Lead', 'Accounts'].includes(staff.role)) {
      const rules = await marginSettings();
      const sheets = await db.select().from(orderCostSheets);
      const costed = rows.filter(
        (v) => v.lines.length > 0 && v.lines.every((line) => line.costVerified),
      );
      const margins = costed.map((v) =>
        orderProfit(v, rules, sheets.find((s) => s.orderId === v.id)?.costs),
      );
      result.profit = {
        grossPence: sum(margins.map((v) => v.grossProfitPence)),
        contributionPence: sum(margins.map((v) => v.contributionProfitPence)),
        averageMarginBps: margins.length
          ? pence(
              sum(margins.map((v) => v.contributionMarginBps)) / margins.length,
            )
          : 0,
        belowMinimum: margins.filter((v) => v.approvalRequired).length,
        costCoverage: costed.length,
        reviewedCostCoverage: costed.filter((v) =>
          sheets.some((s) => s.orderId === v.id && s.reviewed),
        ).length,
        provisional: costed.some(
          (v) => !sheets.some((s) => s.orderId === v.id && s.reviewed),
        ),
        orderCount: rows.length,
      };
      result.accounts = accountTotals(state.invoices, Date.now());
    }
  }
  const get = async (module: BusinessModule) =>
    canUseModule(staff.role, module) ? listRecords(staff, module) : [];
  const [deliveries, assembly, flooring, cases, tasks, unread] =
    await Promise.all([
      get('deliveries'),
      get('assembly-jobs'),
      get('flooring'),
      get('service-cases'),
      get('tasks'),
      db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, staff.id),
            isNull(notifications.readAt),
          ),
        ),
    ]);
  const overdue = (
    rows: Awaited<ReturnType<typeof listRecords>>,
    key: string,
  ) =>
    rows.filter((v) => {
      const date = fieldText(v.details[key]);
      return date && date < today() && isOpen(v.status);
    }).length;
  if (canUseModule(staff.role, 'deliveries'))
    result.delivery = {
      today: deliveries.filter((v) => v.details.scheduledDate === today())
        .length,
      tomorrow: deliveries.filter(
        (v) => v.details.scheduledDate === day(1).toISOString().slice(0, 10),
      ).length,
      readyToBook: deliveries.filter((v) => v.status === 'Ready to Book')
        .length,
      failed: deliveries.filter((v) => v.status === 'Failed').length,
      rescheduled: deliveries.filter((v) => v.status === 'Rescheduled').length,
    };
  if (canUseModule(staff.role, 'assembly-jobs'))
    result.assembly = {
      today: assembly.filter((v) => v.details.scheduledDate === today()).length,
      upcoming: assembly.filter(
        (v) =>
          fieldText(v.details.scheduledDate) >= today() && isOpen(v.status),
      ).length,
      awaiting: assembly.filter((v) => v.status === 'Awaiting Booking').length,
      issues: assembly.filter((v) => v.status === 'Issue Reported').length,
    };
  if (canUseModule(staff.role, 'flooring'))
    result.flooring = {
      leads: flooring.filter((v) => v.status === 'Lead').length,
      measuresBooked: flooring.filter((v) => v.status === 'Measure Booked')
        .length,
      measuresToday: flooring.filter((v) => v.details.measureDate === today())
        .length,
      quotesPending: flooring.filter((v) =>
        ['Quote', 'Follow-up'].includes(v.status),
      ).length,
      won: flooring.filter((v) =>
        [
          'Won',
          'Materials Ordered',
          'Fitting Booked',
          'Installation',
          'Completed',
        ].includes(v.status),
      ).length,
      lost: flooring.filter((v) => v.status === 'Lost').length,
      conversionBps: flooring.length
        ? pence(
            (flooring.filter((v) =>
              [
                'Won',
                'Materials Ordered',
                'Fitting Booked',
                'Installation',
                'Completed',
              ].includes(v.status),
            ).length *
              10000) /
              flooring.length,
          )
        : 0,
    };
  if (canUseModule(staff.role, 'service-cases'))
    result.service = {
      open: cases.filter((v) => isOpen(v.status)).length,
      overdue: overdue(cases, 'nextChaseDate'),
      awaitingSupplier: cases.filter((v) => v.status === 'Awaiting Supplier')
        .length,
      replacementOverdue: cases.filter(
        (v) =>
          ['Replacement Ordered', 'Replacement In Transit'].includes(
            v.status,
          ) &&
          !!v.details.expectedReplacementDate &&
          fieldText(v.details.expectedReplacementDate) < today(),
      ).length,
    };
  if (canUseModule(staff.role, 'tasks'))
    result.tasks = {
      mine: tasks.filter(
        (v) => v.assignedUserId === staff.id && isOpen(v.status),
      ).length,
      today: tasks.filter(
        (v) => v.details.dueDate === today() && isOpen(v.status),
      ).length,
      overdue: overdue(tasks, 'dueDate'),
    };
  if (hasPermission(staff, 'approvals.write')) {
    const [po, so] = await Promise.all([
      db.select().from(purchaseOrders),
      listSupplierOrders(staff),
    ]);
    result.suppliers = {
      awaitingConfirmation: so.filter(
        (v) => v.status === 'Awaiting Confirmation',
      ).length,
      confirmationOverdue: so.filter((v) => v.flags.confirmationOverdue).length,
      etaOverdue: so.filter(
        (v) =>
          !!v.details.expectedArrival &&
          fieldText(v.details.expectedArrival) < today() &&
          !['Received', 'Completed', 'Cancelled'].includes(v.status),
      ).length,
      readyForCollection: so.filter((v) =>
        [
          'Ready for Collection',
          'Collection Requested',
          'Collection Booked',
        ].includes(v.status),
      ).length,
      issues: po.filter((v) => v.status === 'Cancelled').length,
    };
  }
  result.notifications = unread.length;
  return result;
}

export async function reportData(staff: Staff) {
  authorize(staff, 'reports.read');
  const options = await businessOptions();
  const today = () => businessDate(Date.now(), options.timeZone);
  const db = database();
  const state: CommerceState | null = hasPermission(staff, 'commerce.read')
    ? (await readCommerce(staff)).data
    : null;
  const rows = state?.operations.cases ?? [];
  const channels = new Map<string, { orders: number; salesPence: number }>();
  for (const order of rows) {
    const value = channels.get(order.channel) ?? { orders: 0, salesPence: 0 };
    value.orders++;
    value.salesPence += pence(order.total * 100);
    channels.set(order.channel, value);
  }
  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    orderCount: rows.length,
    salesByChannel: [...channels].map(([channel, v]) => ({ channel, ...v })),
  };
  if (!state && hasPermission(staff, 'reports.read')) {
    const aggregates = await db
      .select({ channel: orders.channel, data: orders.data })
      .from(orders);
    const safe = new Map<string, { orders: number; salesPence: number }>();
    for (const row of aggregates) {
      const value = safe.get(row.channel) ?? { orders: 0, salesPence: 0 };
      value.orders++;
      value.salesPence += pence(row.data.total * 100);
      safe.set(row.channel, value);
    }
    result.orderCount = aggregates.length;
    result.salesByChannel = [...safe].map(([channel, value]) => ({
      channel,
      ...value,
    }));
  }
  if (state) {
    const rules = await marginSettings();
    const sheets = await db.select().from(orderCostSheets);
    const costed = rows.filter(
      (v) => v.lines.length > 0 && v.lines.every((line) => line.costVerified),
    );
    const margins = costed.map((v) =>
      orderProfit(v, rules, sheets.find((s) => s.orderId === v.id)?.costs),
    );
    const byProduct = new Map<
      string,
      { units: number; revenuePence: number }
    >();
    for (const order of rows)
      for (const line of order.lines) {
        const entry = byProduct.get(line.name) ?? { units: 0, revenuePence: 0 };
        entry.units += line.quantity;
        entry.revenuePence += pence(line.quantity * line.unitPrice * 100);
        byProduct.set(line.name, entry);
      }
    result.salesByProduct = [...byProduct]
      .map(([product, v]) => ({ product, ...v }))
      .sort((a, b) => b.revenuePence - a.revenuePence)
      .slice(0, 100);
    result.salesByDay = state.invoices
      .filter((v) => v.lifecycle === 'Issued')
      .reduce(
        (groups, v) => {
          const row = groups.find((x) => x.date === v.issueDate);
          if (row) row.salesPence += invoiceTotals(v).total;
          else
            groups.push({
              date: v.issueDate,
              salesPence: invoiceTotals(v).total,
            });
          return groups;
        },
        [] as { date: string; salesPence: number }[],
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    if (['Management', 'Team Lead', 'Accounts'].includes(staff.role)) {
      result.profit = {
        grossPence: sum(margins.map((v) => v.grossProfitPence)),
        contributionPence: sum(margins.map((v) => v.contributionProfitPence)),
        averageMarginBps: margins.length
          ? pence(
              sum(margins.map((v) => v.contributionMarginBps)) / margins.length,
            )
          : 0,
        belowMinimum: margins.filter((v) => v.approvalRequired).length,
        costCoverage: costed.length,
        reviewedCostCoverage: costed.filter((v) =>
          sheets.some((s) => s.orderId === v.id && s.reviewed),
        ).length,
        provisional: costed.some(
          (v) => !sheets.some((s) => s.orderId === v.id && s.reviewed),
        ),
      };
      result.accounts = accountTotals(state.invoices, Date.now());
      const suppliersMap = new Map<
        string,
        { orders: number; salesPence: number }
      >();
      for (const order of rows) {
        for (const supplier of new Set(order.lines.map((l) => l.supplier))) {
          const v = suppliersMap.get(supplier) ?? { orders: 0, salesPence: 0 };
          v.orders++;
          v.salesPence += pence(
            order.lines
              .filter((l) => l.supplier === supplier)
              .reduce((n, l) => n + l.quantity * l.unitPrice * 100, 0),
          );
          suppliersMap.set(supplier, v);
        }
      }
      result.salesBySupplier = [...suppliersMap].map(([supplier, v]) => ({
        supplier,
        ...v,
      }));
    }
  }
  const [flooring, cases, deliveries, assembly] = await Promise.all([
    canUseModule(staff.role, 'flooring')
      ? listRecords(staff, 'flooring')
      : Promise.resolve([]),
    canUseModule(staff.role, 'service-cases')
      ? listRecords(staff, 'service-cases')
      : Promise.resolve([]),
    canUseModule(staff.role, 'deliveries')
      ? listRecords(staff, 'deliveries')
      : Promise.resolve([]),
    canUseModule(staff.role, 'assembly-jobs')
      ? listRecords(staff, 'assembly-jobs')
      : Promise.resolve([]),
  ]);
  if (canUseModule(staff.role, 'flooring'))
    result.flooring = {
      leads: flooring.length,
      won: flooring.filter((v) =>
        [
          'Won',
          'Materials Ordered',
          'Fitting Booked',
          'Installation',
          'Completed',
        ].includes(v.status),
      ).length,
      lost: flooring.filter((v) => v.status === 'Lost').length,
      quotes: flooring.filter((v) => ['Quote', 'Follow-up'].includes(v.status))
        .length,
    };
  if (canUseModule(staff.role, 'service-cases'))
    result.service = {
      open: cases.filter((v) => isOpen(v.status)).length,
      overdue: cases.filter(
        (v) =>
          !!v.details.nextChaseDate &&
          fieldText(v.details.nextChaseDate) < today() &&
          isOpen(v.status),
      ).length,
    };
  if (canUseModule(staff.role, 'deliveries'))
    result.delivery = {
      total: deliveries.length,
      failed: deliveries.filter((v) => v.status === 'Failed').length,
      rescheduled: deliveries.filter((v) => v.status === 'Rescheduled').length,
      completed: deliveries.filter((v) =>
        ['Delivered', 'Completed'].includes(v.status),
      ).length,
    };
  if (canUseModule(staff.role, 'assembly-jobs'))
    result.assembly = {
      total: assembly.length,
      issues: assembly.filter((v) => v.status === 'Issue Reported').length,
      completed: assembly.filter((v) => v.status === 'Completed').length,
    };
  if (hasPermission(staff, 'approvals.write')) {
    const [po, so] = await Promise.all([
      db.select().from(purchaseOrders),
      db.select().from(supplierOrders),
    ]);
    result.supplier = {
      purchaseOrders: po.length,
      openPurchases: po.filter(
        (v) => !['Received', 'Cancelled'].includes(v.status),
      ).length,
      supplierOrders: so.length,
      etaOverdue: so.filter(
        (v) =>
          !!v.details.expectedArrival &&
          fieldText(v.details.expectedArrival) < today() &&
          !['Received', 'Completed', 'Cancelled'].includes(v.status),
      ).length,
    };
  }
  return result;
}

export async function searchRecords(staff: Staff, raw: string) {
  const query = raw.trim().slice(0, 100);
  if (query.length < 2) return [];
  const db = database();
  const term = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const result: {
    id: string;
    type: string;
    label: string;
    detail: string;
    href: string;
  }[] = [];
  const add = (
    type: string,
    rows: { id: string; label: string; detail?: string; href: string }[],
  ) =>
    rows.forEach((v) => {
      if (result.length < 40)
        result.push({ ...v, type, detail: v.detail ?? '' });
    });
  if (hasPermission(staff, 'commerce.read')) {
    const [c, o, i] = await Promise.all([
      db
        .select()
        .from(customers)
        .where(
          or(
            ilike(customers.name, term),
            ilike(customers.email, term),
            ilike(customers.phone, term),
            ilike(customers.postcode, term),
          ),
        )
        .limit(12),
      db
        .select()
        .from(orders)
        .where(
          or(
            ilike(orders.id, term),
            ilike(orders.channel, term),
            ilike(orders.status, term),
          ),
        )
        .limit(12),
      db
        .select({ id: invoices.id, lifecycle: invoices.lifecycle })
        .from(invoices)
        .where(ilike(invoices.id, term))
        .limit(8),
    ]);
    add(
      'Customer',
      c.map((v) => ({
        id: v.id,
        label: v.name,
        detail: [v.email, v.phone, v.postcode].filter(Boolean).join(' · '),
        href: '/customers?customer=' + encodeURIComponent(v.id),
      })),
    );
    add(
      'Order',
      o.map((v) => ({
        id: v.id,
        label: 'Order #' + v.id,
        detail: v.channel + ' · ' + v.status,
        href: '/orders/' + encodeURIComponent(v.id),
      })),
    );
    add(
      'Invoice',
      i.map((v) => ({
        id: v.id,
        label: v.id,
        detail: v.lifecycle,
        href: '/invoices/' + encodeURIComponent(v.id),
      })),
    );
  }
  if (
    hasPermission(staff, 'catalogue.write') ||
    hasPermission(staff, 'orders.write') ||
    hasPermission(staff, 'inventory.write') ||
    staff.role === 'Accounts'
  ) {
    const rows = await db
      .select()
      .from(products)
      .where(
        or(
          ilike(products.name, term),
          ilike(products.sku, term),
          ilike(products.category, term),
        ),
      )
      .limit(12);
    add(
      'Product',
      rows.map((v) => ({
        id: v.id,
        label: v.name,
        detail: v.sku + ' · ' + v.category,
        href: recordHref('product', v.id),
      })),
    );
  }
  if (hasPermission(staff, 'approvals.write')) {
    const [s, p] = await Promise.all([
      db
        .select()
        .from(suppliers)
        .where(or(ilike(suppliers.name, term), ilike(suppliers.code, term)))
        .limit(8),
      db
        .select()
        .from(purchaseOrders)
        .where(ilike(purchaseOrders.number, term))
        .limit(8),
    ]);
    add(
      'Supplier',
      s.map((v) => ({
        id: v.id,
        label: v.name,
        detail: v.code,
        href: recordHref('supplier', v.id),
      })),
    );
    add(
      'Purchase order',
      p.map((v) => ({
        id: v.id,
        label: v.number,
        detail: v.status,
        href: recordHref('purchase-order', v.id),
      })),
    );
  }
  for (const moduleKey of Object.keys(businessModules) as BusinessModule[]) {
    if (!canUseModule(staff.role, moduleKey)) continue;
    const rows = await listRecords(staff, moduleKey);
    add(
      businessModules[moduleKey].title,
      rows
        .filter((v) =>
          (v.number + ' ' + v.title + ' ' + v.status)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 8)
        .map((v) => ({
          id: v.id,
          label: v.number,
          detail: v.title + ' · ' + v.status,
          href: recordHref(moduleKey, v.id),
        })),
    );
  }
  return result;
}
