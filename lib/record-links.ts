const routes: Record<string, string> = {
  product: 'products',
  supplier: 'suppliers',
  'purchase-order': 'purchasing',
  'supplier-order': 'supplier-tracking',
};
export function recordHref(entity: string, id: string) {
  entity = recordEntity(entity);
  const key = encodeURIComponent(id);
  if (entity === 'stock-movement') return '/inventory?movement=' + key;
  if (entity === 'order') return '/orders/' + key;
  if (entity === 'invoice') return '/invoices/' + key;
  if (entity === 'customer') return '/customers?customer=' + key;
  return '/' + (routes[entity] ?? entity) + '?record=' + key;
}

export function recordEntity(entity: string) {
  return (
    (
      {
        delivery: 'deliveries',
        assembly: 'assembly-jobs',
        'service-case': 'service-cases',
        expense: 'expenses',
      } as Record<string, string>
    )[entity] ?? entity
  );
}
