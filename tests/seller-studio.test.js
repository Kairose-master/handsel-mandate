import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProduct, routesFor, simulatePurchase } from '../seller/model.js';
const input = { name: 'PDF tables', description: 'Extract tables from a public PDF.', endpoint: 'https://example.com/extract', method: 'POST', price: '0.000001', payTo: '0x1111111111111111111111111111111111111111', request: '{}', response: '{"tables":[]}' };
test('minimum USDC unit stays exact and draft cannot claim settlement', () => {
  const p = buildProduct(input);
  assert.equal(p.payment.amount, '1');
  assert.equal(p.verification.paymentSettled, false);
  assert.equal(p.verification.bazaarIndexed, false);
  assert.equal(routesFor(p)['POST /extract'].accepts[0].network, 'eip155:84532');
});
test('reject invalid money, credential-bearing URLs and invalid examples', () => {
  for (const price of ['0', '-1', '1e2', '0.0000001', 'NaN']) assert.throws(() => buildProduct({ ...input, price }));
  for (const endpoint of ['http://example.com', 'https://key@example.com', 'https://example.com?api_key=secret', 'javascript:alert(1)']) assert.throws(() => buildProduct({ ...input, endpoint }));
  assert.throws(() => buildProduct({ ...input, request: '[]' }));
});
test('simulation denies insufficient budget and never reports a real payment', () => {
  const p = buildProduct({ ...input, price: '0.03' });
  assert.throws(() => simulatePurchase(p, '0.029999'));
  const receipt = simulatePurchase(p, '0.03');
  assert.equal(receipt.settled, false);
  assert.equal(receipt.charged, '0');
  assert.deepEqual(receipt.fixtureOutput, { tables: [] });
});
