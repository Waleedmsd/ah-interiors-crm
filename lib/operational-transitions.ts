import type { BusinessModule } from './business-modules';
export const operationalTransitions: Record<
  BusinessModule,
  Record<string, string[]>
> = {
  deliveries: {
    'Awaiting Stock': ['Ready to Book'],
    'Ready to Book': ['Customer Contact Required', 'Booked'],
    'Customer Contact Required': ['Booked'],
    Booked: ['Confirmed', 'Rescheduled'],
    Confirmed: ['Out for Delivery', 'Rescheduled'],
    'Out for Delivery': ['Delivered', 'Failed'],
    Delivered: ['Completed'],
    Failed: ['Rescheduled'],
    Rescheduled: ['Booked'],
  },
  'assembly-jobs': {
    'Awaiting Booking': ['Booked', 'Cancelled'],
    Booked: ['Confirmed', 'Rescheduled', 'Cancelled'],
    Confirmed: ['In Progress', 'Rescheduled', 'Cancelled'],
    'In Progress': ['Completed', 'Issue Reported'],
    'Issue Reported': ['Rescheduled', 'In Progress'],
    Rescheduled: ['Booked', 'Cancelled'],
  },
  flooring: {
    Lead: ['Measure Booked', 'Lost'],
    'Measure Booked': ['Measure Completed', 'Lost'],
    'Measure Completed': ['Quote', 'Lost'],
    Quote: ['Follow-up', 'Won', 'Lost'],
    'Follow-up': ['Won', 'Lost'],
    Won: ['Materials Ordered'],
    'Materials Ordered': ['Fitting Booked'],
    'Fitting Booked': ['Installation'],
    Installation: ['Completed'],
  },
  'service-cases': {
    New: ['Investigating'],
    Investigating: [
      'Awaiting Customer',
      'Awaiting Supplier',
      'Replacement Ordered',
      'Ready to Resolve',
    ],
    'Awaiting Customer': ['Investigating', 'Ready to Resolve'],
    'Awaiting Supplier': [
      'Investigating',
      'Replacement Ordered',
      'Ready to Resolve',
    ],
    'Replacement Ordered': ['Replacement In Transit'],
    'Replacement In Transit': ['Ready to Resolve'],
    'Ready to Resolve': ['Resolved'],
    Resolved: ['Closed'],
  },
  tasks: {
    Open: ['In Progress', 'Completed', 'Cancelled'],
    'In Progress': ['Completed', 'Cancelled'],
  },
  expenses: {
    Draft: ['Submitted'],
    Submitted: ['Approved', 'Rejected'],
    Approved: ['Paid'],
  },
  approvals: { Requested: ['Approved', 'Rejected'] },
};
