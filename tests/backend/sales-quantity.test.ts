import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validSalesQuantity, salesLineTotal } from '../../lib/sales-quantity';
test('ordinary sales lines remain whole units; only explicit measured units allow decimals', () => {
  for (const unit of [undefined, 'Each', 'Pack', 'invalid'])
    assert.equal(validSalesQuantity({ quantity: 1.5, unit }), false);
  assert.equal(validSalesQuantity({ quantity: 2 }), true);
  for (const unit of ['m²', 'Metre']) {
    assert.equal(validSalesQuantity({ quantity: 12.345, unit }), true);
    assert.equal(validSalesQuantity({ quantity: 12.3456, unit }), false);
  }
  for (const quantity of [0, -1, NaN, Infinity, 10001])
    assert.equal(validSalesQuantity({ quantity, unit: 'm²' }), false);
  assert.equal(salesLineTotal({ quantity: 1.125, unitPence: 999 }), 1124);
});
