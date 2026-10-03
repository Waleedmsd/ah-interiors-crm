// Existing lines without an explicit measured unit retain whole-unit validation.
export type SalesUnit = 'Each' | 'Pack' | 'm²' | 'Metre';
export function validSalesQuantity(line: { quantity: number; unit?: string }) {
  const q = line.quantity;
  if (!Number.isFinite(q) || q <= 0 || q > 10000) return false;
  if (line.unit === 'm²' || line.unit === 'Metre')
    return Math.abs(q * 1000 - Math.round(q * 1000)) < 0.000001;
  return (
    (!line.unit || line.unit === 'Each' || line.unit === 'Pack') &&
    Number.isInteger(q)
  );
}
export const salesLineTotal = (line: { quantity: number; unitPence: number }) =>
  Math.round(line.quantity * line.unitPence);
