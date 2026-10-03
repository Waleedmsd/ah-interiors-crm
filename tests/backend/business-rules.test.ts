import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessDate } from '../../lib/business-date';
import { supplierFlags } from '../../lib/supplier-workflow';
import { slotsOverlap } from '../../lib/scheduling';
import { deliveryReady } from '../../server/services/order-progress';
test('business dates use the configured zone across midnight and daylight saving', () => {
  assert.equal(
    businessDate(new Date('2026-10-03T23:30:00Z'), 'Europe/London'),
    '2026-10-04',
  );
  assert.equal(
    businessDate(new Date('2026-10-25T23:30:00Z'), 'Europe/London'),
    '2026-10-25',
  );
  assert.equal(
    businessDate(new Date('2026-10-03T21:00:00Z'), 'Asia/Karachi'),
    '2026-10-04',
  );
  const flags = supplierFlags(
    {
      status: 'Awaiting Confirmation',
      details: { orderedDate: '2026-10-01', expectedArrival: '2026-10-03' },
      createdAt: '',
    },
    3,
    Date.parse('2026-10-03T23:30:00Z'),
    'Europe/London',
  );
  assert.equal(flags.confirmationOverdue, true);
  assert.equal(flags.etaOverdue, true);
});
test('booking windows overlap but adjacent slots do not', () => {
  assert.equal(slotsOverlap('09:00–12:00', '11:00-13:00'), true);
  assert.equal(slotsOverlap('09:00–12:00', '12:00-13:00'), false);
  assert.equal(slotsOverlap('AM', '10:00-11:00'), true);
});
test('duplicate product lines require the full group quantity', () => {
  const order = {
    groups: [{ id: 'g1', receipt: false }],
    lines: [
      { groupId: 'g1', productId: 'p1', quantity: 2 },
      { groupId: 'g1', productId: 'p1', quantity: 1 },
    ],
  } as any;
  assert.equal(
    deliveryReady(
      order,
      [{ groupId: 'g1', productId: 'p1', quantity: 2 }],
      'g1',
    ),
    false,
  );
  assert.equal(
    deliveryReady(
      order,
      [{ groupId: 'g1', productId: 'p1', quantity: 3 }],
      'g1',
    ),
    true,
  );
  assert.equal(
    deliveryReady(
      order,
      [{ groupId: 'g2', productId: 'p1', quantity: 3 }],
      'g1',
    ),
    false,
  );
});
