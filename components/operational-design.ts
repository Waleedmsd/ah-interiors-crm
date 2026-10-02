import {
  Truck,
  Hammer,
  Layers3,
  LifeBuoy,
  ListChecks,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import type { BusinessModule } from '@/lib/business-modules';
export const operationalDesign = {
  deliveries: {
    icon: Truck,
    category: 'Fulfilment',
    description: 'Every delivery, from ready to book to safely at the door.',
    empty: 'Your delivery day, organised.',
    hint: 'Create your first job from a sales order. Book a time, assign your team and keep proof of delivery together.',
    tabs: ['All', 'Due today', 'Ready to Book', 'Out for Delivery', 'Failed'],
    dateKey: 'scheduledDate',
    dateLabel: 'Delivery date',
    stages: [
      'Awaiting Stock',
      'Ready to Book',
      'Booked',
      'Out for Delivery',
      'Delivered',
    ],
    sections: [
      ['Delivery details', 'groupId', 'address', 'postcode', 'phone', 'packs'],
      [
        'Schedule & team',
        'scheduledDate',
        'timeSlot',
        'team',
        'vehicle',
        'courier',
        'assemblyRequired',
        'customerConfirmed',
      ],
      [
        'Completion & exceptions',
        'proof',
        'failedReason',
        'rescheduledDate',
        'deliveryCostPence',
      ],
      ['Internal notes', 'notes'],
    ],
  },
  'assembly-jobs': {
    icon: Hammer,
    category: 'Fulfilment',
    description:
      'A clear schedule for your installers. A smooth finish for your customers.',
    empty: 'Make room for a great finish.',
    hint: 'Link an assembly job to an order, assign an installer and keep every sign-off in one place.',
    tabs: [
      'All',
      'Due today',
      'Awaiting Booking',
      'In Progress',
      'Issue Reported',
    ],
    dateKey: 'scheduledDate',
    dateLabel: 'Scheduled date',
    stages: ['Awaiting Booking', 'Booked', 'In Progress', 'Completed'],
    sections: [
      ['Job details', 'groupId', 'deliveryId', 'address'],
      ['Schedule & team', 'scheduledDate', 'timeSlot', 'team'],
      [
        'Charges & completion',
        'feePence',
        'extraChargesPence',
        'customerSignoff',
        'problem',
      ],
      ['Internal notes', 'notes'],
    ],
  },
  flooring: {
    icon: Layers3,
    category: 'Sales',
    description: 'Turn first enquiries into beautifully finished rooms.',
    empty: 'Build your flooring pipeline.',
    hint: 'Start with an enquiry, arrange a measure and bring rooms, quotes and fitting dates into one clear journey.',
    tabs: ['All', 'Lead', 'Measure Booked', 'Quote', 'Follow-up', 'Won'],
    dateKey: 'nextChaseDate',
    dateLabel: 'Next follow-up',
    stages: ['Lead', 'Measure Booked', 'Quote', 'Won', 'Completed'],
    sections: [
      [
        'Enquiry details',
        'leadSource',
        'productType',
        'room',
        'approxSqm',
        'budgetPence',
        'branch',
      ],
      [
        'Measure appointment',
        'measureDate',
        'measureTime',
        'surveyor',
        'samples',
        'measureNotes',
      ],
      ['Room measurements', 'rooms'],
      ['Pricing & quote', 'quote'],
      [
        'Follow-up & fitting',
        'nextChaseDate',
        'outcome',
        'lostReason',
        'fittingDate',
      ],
      ['Internal notes', 'notes'],
    ],
  },
  'service-cases': {
    icon: LifeBuoy,
    category: 'Customer care',
    description: 'Give every customer issue a clear owner and a next step.',
    empty: 'A better resolution starts here.',
    hint: 'Log a customer concern, connect the order and keep supplier responses and replacement dates together.',
    tabs: [
      'All',
      'My work',
      'Overdue',
      'Awaiting Supplier',
      'Replacement overdue',
    ],
    dateKey: 'nextChaseDate',
    dateLabel: 'Next chase',
    stages: [
      'New',
      'Investigating',
      'Awaiting Supplier',
      'Ready to Resolve',
      'Resolved',
    ],
    sections: [
      ['The issue', 'caseType', 'priority', 'reportedDate', 'description'],
      [
        'Supplier & replacement',
        'supplierContacted',
        'supplierResponse',
        'replacementRequired',
        'replacementReference',
        'expectedReplacementDate',
      ],
      ['Customer follow-up', 'customerLastUpdated', 'nextChaseDate'],
      ['Resolution', 'resolution', 'resolutionDate'],
    ],
  },
  tasks: {
    icon: ListChecks,
    category: 'Workspace',
    description: 'Clear priorities. Accountable owners. Nothing left behind.',
    empty: 'Give your next step a home.',
    hint: 'Create a task, choose an owner and set a due date. Link it to a customer, order or other piece of work.',
    tabs: ['All', 'My work', 'Due today', 'Overdue', 'Completed'],
    dateKey: 'dueDate',
    dateLabel: 'Due date',
    stages: ['Open', 'In Progress', 'Completed'],
    sections: [
      ['Task details', 'description', 'priority', 'dueDate', 'reminderDate'],
      ['Related work', 'linkedType', 'linkedId'],
    ],
  },
  expenses: {
    icon: Receipt,
    category: 'Finance',
    description: 'Capture your business costs and keep approvals moving.',
    empty: 'A clearer view of business spending.',
    hint: 'Record an expense with its receipt, submit it for review and track it through to payment.',
    tabs: ['All', 'Draft', 'Submitted', 'Approved', 'Paid'],
    dateKey: 'expenseDate',
    dateLabel: 'Expense date',
    stages: ['Draft', 'Submitted', 'Approved', 'Paid'],
    sections: [
      ['Expense details', 'expenseDate', 'category', 'payee', 'description'],
      ['Amount & payment', 'amountPence', 'vatPence', 'paymentMethod'],
      ['Organisation', 'branch', 'department', 'notes'],
    ],
  },
  approvals: {
    icon: ShieldCheck,
    category: 'Management',
    description:
      'Make informed decisions with the request and its context together.',
    empty: 'Decisions, with a clear record.',
    hint: 'Request a margin exception, refund or other management decision. Keep the reason, amount and linked record together.',
    tabs: ['All', 'Requested', 'Approved', 'Rejected'],
    dateKey: '',
    dateLabel: 'Requested',
    stages: ['Requested', 'Approved', 'Rejected'],
    sections: [
      ['Decision requested', 'approvalType', 'reason', 'amountPence'],
      ['Related record', 'linkedType', 'linkedId'],
      ['Decision notes', 'notes'],
    ],
  },
} satisfies Record<
  BusinessModule,
  {
    icon: typeof Truck;
    category: string;
    description: string;
    empty: string;
    hint: string;
    tabs: string[];
    dateKey: string;
    dateLabel: string;
    stages: string[];
    sections: string[][];
  }
>;
