import type { FlooringRoom } from './flooring';
export type FlooringQuote = {
  lines: { productId: string; quantity: number; unitPricePence: number }[];
  underlayPence: number;
  accessoriesPence: number;
  fittingPence: number;
  removalPence: number;
  deliveryPence: number;
  discountPence: number;
  costPence: number;
};
export const flooringCharges = [
  'underlayPence',
  'accessoriesPence',
  'fittingPence',
  'removalPence',
  'deliveryPence',
] as const;
export function flooringTotal(q: FlooringQuote) {
  return (
    q.lines.reduce((n, l) => n + Math.round(l.quantity * l.unitPricePence), 0) +
    flooringCharges.reduce((n, k) => n + q[k], 0) -
    q.discountPence
  );
}
export type FlooringMaterial = {
  productId: string;
  name: string;
  sku: string;
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  unit: string;
  quantity: number;
  unitCostPence: number;
  groupId: string;
};
export type FlooringSnapshot = {
  quote: FlooringQuote;
  rooms: FlooringRoom[];
  materials: FlooringMaterial[];
  totalPence: number;
  acceptedBy: string;
  acceptedAt: string;
  evidence: string;
  address: string;
  postcode: string;
  phone: string;
  customerName: string;
  calculationVersion: number;
  rules: {
    vatBps: number;
    marginThresholds: { excellent: number; strong: number; acceptable: number };
  };
  profit: {
    contributionProfitPence: number;
    contributionMarginBps: number;
    tier: string;
  };
};
