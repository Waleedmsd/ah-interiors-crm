import { businessDate, defaultTimeZone } from './business-date';
export const purchaseStatuses = [
  'Draft',
  'Ready to Send',
  'Sent',
  'Awaiting Confirmation',
  'Confirmed',
  'Partially Received',
  'Received',
  'Cancelled',
] as const;
export const supplierStatuses = [
  'Needs Ordering',
  'Order Sent',
  'Awaiting Confirmation',
  'Confirmed',
  'In Production',
  'Ready for Collection',
  'Collection Requested',
  'Collection Booked',
  'In Transit',
  'Received',
  'Ready for Customer',
  'Completed',
  'Cancelled',
] as const;
export function canTransition(
  statuses: readonly string[],
  before: string,
  after: string,
) {
  if (before === after) return true;
  if (['Completed', 'Cancelled', 'Closed'].includes(before)) return false;
  if (before === 'Received' && !statuses.includes('Ready for Customer'))
    return false;
  if (after === 'Cancelled') return true;
  const from = statuses.indexOf(before),
    to = statuses.indexOf(after);
  return from >= 0 && to === from + 1;
}
export function supplierFlags(
  record: {
    status: string;
    details: Record<string, unknown>;
    createdAt: string | Date;
  },
  confirmationDays: number,
  now = Date.now(),
  timeZone = defaultTimeZone,
) {
  const details = record.details;
  const ended = ['Completed', 'Cancelled'].includes(record.status);
  const date = (key: string) =>
    details[key] ? Date.parse(String(details[key])) : NaN;
  const today = businessDate(now, timeZone);
  const overdue = (key: string) =>
    Number.isFinite(date(key)) && String(details[key]) < today;
  const sent = date('orderedDate');
  return {
    confirmationOverdue:
      !ended &&
      ['Order Sent', 'Awaiting Confirmation'].includes(record.status) &&
      Number.isFinite(sent) &&
      today >=
        new Date(sent + confirmationDays * 86400000).toISOString().slice(0, 10),
    chaseOverdue: !ended && overdue('nextChaseDate'),
    etaOverdue:
      !ended &&
      !['Received', 'Ready for Customer'].includes(record.status) &&
      overdue('expectedArrival'),
    collectionOverdue:
      !ended &&
      [
        'Ready for Collection',
        'Collection Requested',
        'Collection Booked',
      ].includes(record.status) &&
      overdue('collectionDate'),
    receivedNotBooked:
      record.status === 'Ready for Customer' && !details.deliveryBooked,
  };
}
