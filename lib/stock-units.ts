export const stockUnits = ['Each', 'Pack', 'm²', 'Metre'] as const;
export const stockUnit = (details: Record<string, unknown>) =>
  String(details.stockUnit ?? 'Each');
export const fractionalUnit = (unit: string) => ['m²', 'Metre'].includes(unit);
export const quantityRound = (value: number) => Math.round(value * 1000) / 1000;
export const quantityValid = (value: number, unit: string) =>
  Number.isFinite(value) &&
  Math.abs(value - quantityRound(value)) < 0.00000001 &&
  (fractionalUnit(unit) || Number.isInteger(value));
