import type { Staff } from '../server/permissions';

export function canReadSupplierCosts(staff: Staff | null | undefined): boolean {
  return !!staff?.active && ['Management', 'Team Lead', 'Accounts'].includes(staff.role);
}

/** Only real canonical amounts may enter profitability calculations. */
export function supplierCostPence(cost: number | null): number {
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    throw new Error('A valid supplier cost is required for this calculation.');
  }
  const value = Math.round(cost * 100);
  if (!Number.isSafeInteger(value)) throw new Error('Supplier cost exceeds the supported monetary range.');
  return value;
}
