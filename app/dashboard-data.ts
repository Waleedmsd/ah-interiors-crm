import {
  Hammer,
  Layers3,
  LifeBuoy,
  ListChecks,
  Receipt,
  ShieldCheck,
  Warehouse,
  Package,
  Factory,
  Boxes,
  Bot,
  CircleDollarSign,
  ClipboardList,
  FileCheck2,
  FileText,
  LayoutDashboard,
  BarChart3,
  Mail,
  Truck,
  Users,
} from 'lucide-react';

export type Order = {
  id: string;
  customer: string;
  initials: string;
  total: string;
  payment: 'Paid' | 'Part paid';
  items: string;
  supplier: string;
  received: string;
};

export const orders: Order[] = [
  {
    id: '#10004821',
    customer: 'John Smith',
    initials: 'JS',
    total: '£2,840.00',
    payment: 'Paid',
    items: 'Rauch wardrobe + assembly',
    supplier: 'Rauch',
    received: '8 min ago',
  },
  {
    id: '#10004822',
    customer: 'Sarah Jones',
    initials: 'SJ',
    total: '£1,420.00',
    payment: 'Paid',
    items: 'Hypnos mattress',
    supplier: 'Hypnos',
    received: '22 min ago',
  },
  {
    id: '#10004823',
    customer: 'David Brown',
    initials: 'DB',
    total: '£4,920.00',
    payment: 'Part paid',
    items: 'Wiemann bedroom set',
    supplier: 'Wiemann',
    received: '41 min ago',
  },
  {
    id: '#10004824',
    customer: 'Emma White',
    initials: 'EW',
    total: '£820.00',
    payment: 'Paid',
    items: 'Bedframe + delivery',
    supplier: 'Julian Bowen',
    received: '1 hr ago',
  },
];

export const navigation = [
  {
    index: 'SHOP',
    label: 'Shopify',
    icon: Package,
    href: '/integrations/shopify',
  },
  { index: 'REP', label: 'Reports', icon: BarChart3, href: '/reports' },
  { index: 'DEL', label: 'Deliveries', icon: Truck, href: '/deliveries' },
  {
    index: 'ASM',
    label: 'Assembly jobs',
    icon: Hammer,
    href: '/assembly-jobs',
  },
  { index: 'FLR', label: 'Flooring', icon: Layers3, href: '/flooring' },
  {
    index: 'CS',
    label: 'Customer service',
    icon: LifeBuoy,
    href: '/service-cases',
  },
  { index: 'T', label: 'Tasks', icon: ListChecks, href: '/tasks' },
  { index: 'EXP', label: 'Expenses', icon: Receipt, href: '/expenses' },
  { index: 'APR', label: 'Approvals', icon: ShieldCheck, href: '/approvals' },

  { index: 'ST', label: 'Inventory', icon: Warehouse, href: '/inventory' },
  { index: 'P', label: 'Products', icon: Package, href: '/products' },
  { index: 'S', label: 'Suppliers', icon: Factory, href: '/suppliers' },
  { index: '01', label: 'Today', icon: LayoutDashboard, href: '/' },
  { index: 'R', label: 'Review & approve', icon: FileCheck2, href: '/reviews' },
  { index: 'AI', label: 'Assistant', icon: Bot, href: '/assistant' },
  {
    index: '02',
    label: 'Orders',
    icon: ClipboardList,
    href: '/orders',
    count: 4,
  },
  {
    index: '03',
    label: 'Purchasing',
    icon: Boxes,
    href: '/purchasing',
    count: 5,
  },
  {
    index: '04',
    label: 'Communications',
    icon: Mail,
    href: '/communications',
    count: 5,
  },
  { index: '05', label: 'Fulfilment', icon: Truck, href: '/assembly' },
  {
    index: '06',
    label: 'Invoices',
    icon: CircleDollarSign,
    href: '/invoices',
  },
  { index: '07', label: 'Documents', icon: FileText, href: '/documents' },
  { index: '08', label: 'Customers', icon: Users, href: '/customers' },
];

export const attentionItems = [
  {
    title: 'Rauch price mismatch',
    detail: '#10004812 · Expected £1,040, confirmed £1,390',
    time: '12 min ago',
    critical: true,
  },
  {
    title: 'Supplier confirmation overdue',
    detail: '#10004798 · Hypnos · waiting 4 days',
    time: '34 min ago',
    critical: false,
  },
  {
    title: 'Assembly date unavailable',
    detail: '#10004786 · Flatpack cannot attend 18 Sep',
    time: '1 hr ago',
    critical: false,
  },
];

export const suggestedPrompts = [
  'What needs my attention?',
  'Show unpaid orders',
  'Has Rauch confirmed everything?',
];
