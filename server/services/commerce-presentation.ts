import type { CommerceState } from '../../lib/commerce';
import { canReadSupplierCosts } from '../../lib/financial-access';
import { authorize, type Staff } from '../permissions';

/** A response projection only. Never persist this value as the canonical ledger. */
export function presentCommerce(staff: Staff, state: CommerceState): CommerceState {
  authorize(staff, 'commerce.read');
  const copy = structuredClone(state);
  if (canReadSupplierCosts(staff)) return copy;
  for (const order of copy.operations.cases) {
    for (const line of order.lines) line.cost = null;
  }
  return copy;
}
