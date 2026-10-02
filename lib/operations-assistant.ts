import { previewReply, type ChatMessage } from '@/lib/assistant-preview';
import {
  approvalBlockers,
  currentStatus,
  isPaid,
  type OrderCase,
} from '@/lib/operations';
import { money } from '@/lib/demo-data';

export function operationsReply(
  prompt: string,
  cases: OrderCase[],
  contextId?: string,
  now?: number,
): Omit<ChatMessage, 'id'> {
  const input = prompt.toLowerCase();
  const requestedId = input
    .match(/\b(?:1000\d{4}|l-\d{6})\b/i)?.[0]
    .toUpperCase();
  const order = cases.find(
    (item) =>
      item.id === (requestedId || contextId) ||
      input.includes(item.customer.toLowerCase()),
  );
  const role = 'assistant' as const;
  if (order) {
    if (/draft|chase|follow.up/.test(input)) {
      if (/payment|customer/.test(input))
        return {
          ...previewReply(
            prompt + ' order #' + order.id,
            cases.map((item) => ({ ...item, status: currentStatus(item) })),
          ),
          orderId: order.id,
        };
      if (order.groups.every((group) => group.supplierStatus === 'Not ordered'))
        return {
          role,
          orderId: order.id,
          text:
            'No supplier order has been placed for #' +
            order.id +
            '. ' +
            (!isPaid(order)
              ? 'Full payment must be verified first.'
              : order.pack
                ? 'Open the order pack to review the supplier drafts. Approval in this preview will not send them.'
                : 'Choose Process order to prepare the complete pack, then review it before going ahead.'),
        };
      const group = order.groups[0];
      const target =
        group.receipt &&
        group.route !== 'AH showroom → BStar' &&
        group.route !== 'Supplier → BStar'
          ? group.route
          : group.supplier;
      return {
        role,
        orderId: order.id,
        text:
          'Here is a draft for ' +
          target +
          ', linked to ' +
          order.customer +
          '’s order. Preparing it will not send anything or reset the outstanding follow-up.',
        action: {
          title: 'Supplier / provider follow-up',
          description: target + ' · #' + order.id,
          status: 'pending',
          content:
            'Subject: Update requested · CC-' +
            order.customer +
            '\n\nHello ' +
            target +
            ',\n\nPlease could you update us on order #' +
            order.id +
            ' for ' +
            order.customer +
            '?\n\n' +
            (order.tasks.length
              ? order.tasks.map((task) => task.nextAction).join('\n')
              : 'Please confirm the current order position and the next expected step.') +
            '\n\nPlease include the relevant reference and any confirmed dates.\n\nKind regards,\nAH Interiors',
        },
      };
    }
    const next = !isPaid(order)
      ? 'Payment hold: verify the remaining ' +
        money(order.total - order.paid, 2) +
        ' before processing.'
      : !order.pack && order.status === 'New'
        ? 'Next: Process order to prepare the supplier, provider and customer drafts. Then review the full pack.'
        : order.pack?.state === 'Approved'
          ? 'Approval is recorded locally. Nothing has been sent, purchased or booked. Opening a new revision requires another review.'
          : order.pack
            ? 'Before approval:\n' +
              (approvalBlockers(order)
                .map((item) => '• ' + item)
                .join('\n') ||
                'All preview checks are complete. Open the pack and choose Go ahead.')
            : order.tasks
                .map((task) => task.title + ': ' + task.nextAction)
                .join('\n') ||
              'Check the fulfilment evidence and any outstanding service issues.';
    return {
      role,
      orderId: order.id,
      text:
        '#' +
        order.id +
        ' · ' +
        order.customer +
        '\n' +
        order.channel +
        ' · ' +
        order.sourceRef +
        '\n\n' +
        order.lines
          .map(
            (line) => line.quantity + ' × ' + line.name + ' · ' + line.supplier,
          )
          .join('\n') +
        '\n\nWorkflow: ' +
        currentStatus(order) +
        '\nPayment: ' +
        money(order.paid, 2) +
        ' / ' +
        money(order.total, 2) +
        '\n\n' +
        next,
    };
  }
  if (/money|unpaid|overdue|payment|balance/.test(input)) {
    const unpaid = cases.filter((item) => !isPaid(item));
    return {
      role,
      text: unpaid.length
        ? 'Outstanding in the current order workspace:\n\n' +
          unpaid
            .map(
              (item) =>
                '#' +
                item.id +
                ' · ' +
                item.customer +
                ' · ' +
                money(item.total - item.paid, 2) +
                ' remaining',
            )
            .join('\n') +
          '\n\nThese orders stay on hold until full payment is recorded. This is sample ledger data, not a live bank verification.'
        : 'All orders in this sample workspace have full payment recorded. No outstanding customer balances remain here. No live bank verification has taken place.',
    };
  }
  if (/prepare|process|new order/.test(input)) {
    return {
      role,
      text:
        cases.filter(
          (item) => item.status === 'New' && !item.pack && isPaid(item),
        ).length +
        ' paid orders are ready to process. ' +
        cases.filter(
          (item) => item.status === 'New' && !item.pack && !isPaid(item),
        ).length +
        ' orders are on payment hold.\n\nProcess prepares the complete pack for review; Go ahead is a separate approval. Nothing is sent, purchased or booked in this preview.',
    };
  }
  if (/attention|today|summary/.test(input)) {
    const due = cases.flatMap((item) =>
      item.tasks
        .filter((task) => now === undefined || task.dueAt <= now)
        .map((task) => item.customer + ': ' + task.title),
    );
    return {
      role,
      text:
        cases.filter(
          (item) => isPaid(item) && item.status === 'New' && !item.pack,
        ).length +
        ' paid orders are ready to process. ' +
        cases.filter((item) => item.pack?.state === 'Draft').length +
        ' packs await your review.\n\n' +
        (due.length
          ? 'Follow-ups needing attention:\n' +
            due.map((item) => '• ' + item).join('\n')
          : 'No internal follow-ups are due right now.') +
        '\n\nUse Today to open the relevant order. All actions in this preview stay local.',
    };
  }
  return previewReply(
    prompt,
    cases.map((item) => ({ ...item, status: currentStatus(item) })),
  );
}
