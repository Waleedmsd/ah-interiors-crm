export type Workflow =
  | 'New'
  | 'Processing'
  | 'In review'
  | 'Approved'
  | 'Attention'
  | 'Waiting supplier'
  | 'Assembly'
  | 'Complete';
export type DemoOrder = {
  id: string;
  customer: string;
  initials: string;
  city: string;
  email: string;
  product: string;
  supplier: string;
  total: number;
  paid: number;
  status: Workflow;
  date: string;
  color: string;
};

export const demoOrders: DemoOrder[] = [
  {
    id: '10004821',
    customer: 'John Smith',
    initials: 'JS',
    city: 'Manchester',
    email: 'john.smith@example.com',
    product: 'Imperial wardrobe + assembly',
    supplier: 'Rauch',
    total: 2840,
    paid: 2840,
    status: 'New',
    date: '05 Sep 2026',
    color: 'peach',
  },
  {
    id: '10004822',
    customer: 'Sarah Jones',
    initials: 'SJ',
    city: 'Cheshire',
    email: 'sarah.jones@example.com',
    product: 'Luxury pocket mattress',
    supplier: 'Hypnos',
    total: 1420,
    paid: 1420,
    status: 'New',
    date: '05 Sep 2026',
    color: 'blue',
  },
  {
    id: '10004823',
    customer: 'David Brown',
    initials: 'DB',
    city: 'Liverpool',
    email: 'david.brown@example.com',
    product: 'Bedroom furniture set',
    supplier: 'Wiemann',
    total: 4920,
    paid: 2000,
    status: 'New',
    date: '05 Sep 2026',
    color: 'green',
  },
  {
    id: '10004824',
    customer: 'Emma White',
    initials: 'EW',
    city: 'Bolton',
    email: 'emma.white@example.com',
    product: 'Bedframe + delivery',
    supplier: 'Julian Bowen',
    total: 820,
    paid: 820,
    status: 'New',
    date: '05 Sep 2026',
    color: 'peach',
  },
  {
    id: '10004812',
    customer: 'Lucy Turner',
    initials: 'LT',
    city: 'Stockport',
    email: 'lucy.turner@example.com',
    product: 'Imperial wardrobe 300cm',
    supplier: 'Rauch',
    total: 2180,
    paid: 2180,
    status: 'Attention',
    date: '03 Sep 2026',
    color: 'blue',
  },
  {
    id: '10004798',
    customer: 'Daniel Wilson',
    initials: 'DW',
    city: 'Manchester',
    email: 'daniel.wilson@example.com',
    product: 'Mattress + divan base',
    supplier: 'Hypnos',
    total: 3200,
    paid: 3200,
    status: 'Waiting supplier',
    date: '29 Aug 2026',
    color: 'green',
  },
  {
    id: '10004786',
    customer: 'Nadia Khan',
    initials: 'NK',
    city: 'Wilmslow',
    email: 'nadia.khan@example.com',
    product: 'Wardrobe + assembly',
    supplier: 'Rauch',
    total: 3740,
    paid: 3740,
    status: 'Assembly',
    date: '28 Aug 2026',
    color: 'peach',
  },
  {
    id: '10004761',
    customer: 'Peter Hall',
    initials: 'PH',
    city: 'Altrincham',
    email: 'peter.hall@example.com',
    product: 'Sliding door wardrobe',
    supplier: 'Wiemann',
    total: 2410,
    paid: 2410,
    status: 'Complete',
    date: '24 Aug 2026',
    color: 'blue',
  },
];

export const exceptions = [
  {
    title: 'Supplier price mismatch',
    description: 'Rauch confirmed £350 above the expected cost.',
    order: '10004812',
    type: 'price',
    href: '/purchasing',
  },
  {
    title: 'Confirmation overdue',
    description: 'Hypnos has not confirmed Daniel’s purchase order.',
    order: '10004798',
    type: 'reply',
    href: '/communications',
  },
  {
    title: 'Assembly needs a new date',
    description: 'Flatpack cannot attend Nadia’s requested date.',
    order: '10004786',
    type: 'date',
    href: '/assembly',
  },
];

export const activity = [
  {
    title: 'New order from John Smith',
    detail: '#10004821 · £2,840.00',
    time: '09:42',
    kind: 'order',
  },
  {
    title: 'Rauch confirmation received',
    detail: 'Price difference flagged for review',
    time: '09:31',
    kind: 'mail',
  },
  {
    title: 'Invoice filed in Dropbox',
    detail: 'Invoice-10004821.pdf',
    time: '09:43',
    kind: 'file',
  },
];

export const revenueSeries = [
  { day: '07 Aug', revenue: 2140, previous: 1880 },
  { day: '10 Aug', revenue: 2980, previous: 2410 },
  { day: '13 Aug', revenue: 2420, previous: 2230 },
  { day: '16 Aug', revenue: 3910, previous: 3000 },
  { day: '19 Aug', revenue: 3260, previous: 2940 },
  { day: '22 Aug', revenue: 4640, previous: 3620 },
  { day: '25 Aug', revenue: 3830, previous: 4010 },
  { day: '28 Aug', revenue: 5010, previous: 4230 },
  { day: '31 Aug', revenue: 4250, previous: 3640 },
  { day: '02 Sep', revenue: 5320, previous: 4190 },
  { day: '05 Sep', revenue: 5980, previous: 4710 },
];
export const money = (value: number, decimals = 0) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
export function filterOrders(
  orders: DemoOrder[],
  query: string,
  status = 'All orders',
) {
  const term = query.trim().replace(/^#/, '').toLowerCase();
  return orders.filter(
    (order) =>
      (status === 'All orders' || order.status === status) &&
      [order.id, order.customer, order.product, order.supplier]
        .join(' ')
        .toLowerCase()
        .includes(term),
  );
}
export function workflowTone(
  status: string,
): 'green' | 'gold' | 'red' | 'blue' | 'grey' {
  if (
    ['Paid', 'Complete', 'Confirmed', 'Booked', 'Filed', 'Approved'].includes(
      status,
    )
  )
    return 'green';
  if (
    [
      'Attention',
      'Overdue',
      'Missing',
      'Price mismatch',
      'Date issue',
    ].includes(status)
  )
    return 'red';
  if (
    ['New', 'Part paid', 'Draft', 'Ready to send', 'In review'].includes(status)
  )
    return 'gold';
  if (
    [
      'Processing',
      'Assembly',
      'Waiting supplier',
      'Awaiting confirmation',
    ].includes(status)
  )
    return 'blue';
  return 'grey';
}
