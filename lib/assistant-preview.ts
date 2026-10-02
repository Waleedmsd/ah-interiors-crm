import { demoOrders, money, type DemoOrder } from '@/lib/demo-data';
import { invoices, overdueTotal } from '@/lib/account-data';

export type ChatAction = {
  title: string;
  description: string;
  content: string;
  status: 'pending' | 'prepared' | 'dismissed';
};
export type ChatMessage = {
  orderId?: string;
  id: string;
  role: 'user' | 'assistant';
  text: string;
  files?: string[];
  action?: ChatAction;
};

export function previewReply(
  prompt: string,
  orders: DemoOrder[] = demoOrders,
): Omit<ChatMessage, 'id'> {
  const input = prompt.toLowerCase();
  const role = 'assistant' as const;
  const requestedId = input.match(/\b1000\d{4}\b/)?.[0];
  const order = orders.find(
    (item) =>
      item.id === requestedId || input.includes(item.customer.toLowerCase()),
  );
  const newOrders = orders.filter((item) => item.status === 'New');
  if (requestedId && !order)
    return {
      role,
      text: 'That order is not in the eight-order sample workspace. You can search the available orders from the Orders page. No live customer records are connected.',
    };
  if (/draft|chase|remind|email|update customer/.test(input)) {
    const supplier = /hypnos|supplier|chase/.test(input) && !order;
    if (supplier)
      return {
        role,
        text: 'I can prepare a follow-up for the overdue Hypnos confirmation. Review the draft below.',
        action: {
          title: 'Draft a supplier follow-up',
          description: 'To Hypnos · order #10004798',
          status: 'pending',
          content:
            'Subject: Confirmation requested — PO-2026-002829\n\nHello,\n\nPlease could you confirm receipt of our purchase order for Daniel Wilson, along with the agreed cost and estimated delivery week?\n\nKind regards,\nAH Interiors',
        },
      };
    const customer =
      order ??
      (/remind|payment/.test(input)
        ? orders.find((item) => item.paid < item.total)
        : undefined);
    if (!customer)
      return {
        role,
        text: 'Which customer or order should the draft be for? For example, ask “Draft an update for John Smith” or “Draft a follow-up to Hypnos”. All drafts stay local for your review.',
      };
    const balance = customer.total - customer.paid;
    const reminder = /remind|payment/.test(input);
    return {
      role,
      text:
        'I can prepare ' +
        (reminder ? 'a payment reminder' : 'an order update') +
        ' for ' +
        customer.customer +
        ' using the current sample record.',
      action: {
        title: reminder
          ? 'Draft a payment reminder'
          : 'Draft a customer update',
        description: 'To ' + customer.customer + ' · order #' + customer.id,
        status: 'pending',
        content:
          'Subject: ' +
          (reminder ? 'Payment reminder' : 'Your order update') +
          ' — #' +
          customer.id +
          '\n\nHello ' +
          customer.customer.split(' ')[0] +
          ',\n\n' +
          (reminder
            ? balance > 0
              ? 'Our records show a remaining balance of ' +
                money(balance) +
                '. If you have already paid, please share your payment reference so we can verify it.'
              : 'Your order is paid in full. No payment is outstanding.'
            : 'Your order for ' +
              customer.product +
              ' is currently marked as ' +
              customer.status.toLowerCase() +
              '. ' +
              (balance
                ? 'The remaining balance is ' + money(balance) + '.'
                : 'We have recorded your payment in full.')) +
          '\n\nKind regards,\nAH Interiors',
      },
    };
  }
  if (order)
    return {
      role,
      text:
        '#' +
        order.id +
        ' · ' +
        order.customer +
        '\n\n' +
        order.product +
        '\nSupplier: ' +
        order.supplier +
        '\nTotal: ' +
        money(order.total) +
        '\nPaid: ' +
        money(order.paid) +
        '\nBalance: ' +
        money(order.total - order.paid) +
        '\nWorkflow: ' +
        order.status +
        '\n\n' +
        (order.status === 'New'
          ? 'This order needs your review before purchasing begins. Open its order detail and choose Review to approve it locally.'
          : 'This is the current preview status. No supplier message or external action has been performed.'),
    };
  if (/prepare|process|new order/.test(input)) {
    if (!newOrders.length)
      return {
        role,
        text: 'All four sample new orders have been reviewed in this session. Their status is now Processing. No purchase orders have been sent.',
      };
    return {
      role,
      text:
        'There are ' +
        newOrders.length +
        ' new orders worth ' +
        money(newOrders.reduce((sum, item) => sum + item.total, 0)) +
        '. I can prepare a checklist; order approval remains a separate step.',
      action: {
        title: 'Prepare the order review',
        description: newOrders.length + ' sample orders · purchasing review',
        status: 'pending',
        content:
          newOrders
            .map(
              (item) =>
                '#' +
                item.id +
                ' — ' +
                item.customer +
                ' — ' +
                item.supplier +
                ' — ' +
                money(item.total) +
                ' — ' +
                (item.total === item.paid
                  ? 'Paid'
                  : money(item.total - item.paid) + ' balance'),
            )
            .join('\n') +
          '\n\nReview supplier product codes and prices before authorising each purchase order.',
      },
    };
  }
  if (/money|unpaid|overdue|payment|balance/.test(input))
    return {
      role,
      text:
        'In the sample ledger, ' +
        money(overdueTotal) +
        ' is overdue across two invoices. Total outstanding is ' +
        money(invoices.reduce((sum, item) => sum + item.total - item.paid, 0)) +
        '.\n\nDavid Brown has a £2,920 balance due on 12 September. Customer payment reports stay unverified until matched to a trusted source. Open Accounts to prepare a reminder for a specific invoice.',
    };
  if (/attention|today|summary/.test(input))
    return {
      role,
      text:
        'Three items need attention:\n\n• Rauch: a £350 price difference on Lucy Turner’s order.\n• Hypnos: Daniel Wilson’s confirmation is overdue.\n• Flatpack: Nadia Khan needs an assembly date after her delivery is confirmed.\n\n' +
        newOrders.length +
        ' new orders are ready for your review.',
    };
  if (/rauch|supplier|confirmation/.test(input))
    return {
      role,
      text: 'Rauch’s confirmation for order #10004812 is £1,390 against an expected £1,040. The workflow is paused. Hypnos order #10004798 is waiting for a confirmation. Both are sample records in this preview.',
    };
  if (/document|file|dropbox/.test(input))
    return {
      role,
      text: 'The document library includes customer invoices, purchase orders and supplier confirmations. Use Documents to filter the sample files by name or order. Attached files stay local; their contents are not analysed yet.',
    };
  return {
    role,
    text: 'This is a local assistant preview using sample records. Try “What needs attention?”, “Review order #10004821”, or “Draft a follow-up to Hypnos”. Live conversations and actions will be connected during the backend phase.',
  };
}
