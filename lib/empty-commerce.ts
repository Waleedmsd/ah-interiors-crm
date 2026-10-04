import type { CommerceState } from './commerce';

/** Empty transport state only: never substitute demo business data for a failed API. */
export function emptyCommerceState(): CommerceState {
  return {
    version: 3,
    operations: { cases: [] },
    customers: [],
    invoices: [],
    nextOrder: 1,
    nextCustomer: 1,
    nextInvoice: 1,
  };
}
