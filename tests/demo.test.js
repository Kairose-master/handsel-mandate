import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { createDemoServer } from '../demo/seller.js';
import { convertMarkdownTables } from '../demo/tool.js';
import { LocalSimulationFacilitator } from '../demo/facilitator-local.js';

const PAY_TO = '0x1111111111111111111111111111111111111111';
async function start(extra = {}) {
  // Bind first to learn the port, then rebuild so the 402 quote's resource URL matches.
  const probe = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1', ...extra });
  const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const demo = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: `http://127.0.0.1:${port}`, ...extra });
  await demo.initialize(); await demo.listen(port, '127.0.0.1');
  return { demo, base: `http://127.0.0.1:${port}` };
}
async function payWith(key, url, init = {}) {
  const first = await fetch(url, init);
  assert.equal(first.status, 402);
  const required = decodePaymentRequiredHeader(first.headers.get('PAYMENT-REQUIRED'));
  const client = new x402Client().register('eip155:84532', new ExactEvmScheme(privateKeyToAccount(key)));
  const payload = await client.createPaymentPayload(required);
  return { required, payload, response: await fetch(url, { ...init, headers: { ...init.headers, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } }) };
}

test('tool converts GFM tables and rejects oversized input', () => {
  const out = convertMarkdownTables('intro\n\n| a | b |\n|---|:--|\n| 1 | x \\| y |\n| 2 |\n\nno table here | at all\n\n| c |\n|---|\n');
  assert.equal(out.tableCount, 2);
  assert.deepEqual(out.tables[0], { columns: ['a', 'b'], rows: [['1', 'x | y'], ['2', '']] });
  assert.deepEqual(out.tables[1], { columns: ['c'], rows: [] });
  assert.throws(() => convertMarkdownTables('x'.repeat(64001)));
  assert.throws(() => convertMarkdownTables(null));
});

test('server refuses unsafe configuration', () => {
  assert.throws(() => createDemoServer({ mode: 'local', payTo: '0x' + '0'.repeat(40), publicBaseUrl: 'http://127.0.0.1:1' }));
  assert.throws(() => createDemoServer({ mode: 'testnet', payTo: PAY_TO, publicBaseUrl: 'http://demo.example' }), /https/);
  assert.throws(() => createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1', price: '0' }));
  assert.throws(() => createDemoServer({ mode: 'mainnet', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1' }));
});

test('unpaid requests get an x402 v2 quote for Base Sepolia USDC and the product is discoverable', async () => {
  const { demo, base } = await start();
  try {
    const res = await fetch(`${base}/convert/sample`);
    assert.equal(res.status, 402);
    const required = decodePaymentRequiredHeader(res.headers.get('PAYMENT-REQUIRED'));
    assert.equal(required.x402Version, 2);
    assert.equal(required.extensions.bazaar.info.input.type, 'http');
    assert.deepEqual(required.extensions.bazaar.info.input.queryParams, {});
    assert.equal(required.extensions.bazaar.info.output.example.format, 'handsel.markdown-tables.v1');
    assert.equal(required.resource.url, `${base}/convert/sample`);
    assert.deepEqual(required.accepts.map(a => [a.scheme, a.network, a.asset.toLowerCase(), a.amount, a.payTo, a.extra.name, a.extra.version]), [['exact', 'eip155:84532', '0x036cbd53842c5426634e7929541ec2318f3dcf7e', '10000', PAY_TO, 'USDC', '2']]);
    const product = await (await fetch(`${base}/product.json`)).json();
    assert.equal(product.testnet, true);
    assert.equal(product.verification.onchainSettlement, false);
    assert.equal(product.endpoints[0].url, `${base}/convert/sample`);
    assert.equal((await fetch(`${base}/demo/run`, { method: 'POST' })).status, 503, 'no agent key → browser run disabled');
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  } finally { await demo.close(); }
});

test('server-run demo agent buys twice within budget and is blocked before signing on the third', async () => {
  const { demo, base } = await start({ agentKey: generatePrivateKey(), demoTotal: '0.025' });
  try {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await (await fetch(`${base}/demo/run`, { method: 'POST' })).json());
    for (const run of runs.slice(0, 2)) {
      assert.deepEqual(run.steps.map(s => [s.id, s.status]), [['discover', 'ok'], ['quote', 'ok'], ['budget', 'ok'], ['pay', 'ok'], ['result', 'ok']]);
      assert.equal(run.testnet, true);
      assert.equal(run.steps.at(-1).simulation, true, 'local mode must say it is a simulation');
      assert.match(run.steps.at(-1).transaction, /^local-simulation:/);
      assert.equal(run.steps.at(-1).result.tableCount, 2);
      assert.equal(run.explorer, null);
    }
    assert.deepEqual(runs[2].steps.map(s => [s.id, s.status]), [['discover', 'ok'], ['quote', 'ok'], ['budget', 'blocked']]);
    assert.equal(runs[2].receipt, null);
    assert.equal(demo.facilitator.settled.length, 2, 'blocked run never reached the facilitator');
    const status = await (await fetch(`${base}/demo/status`)).json();
    assert.deepEqual([status.purchases.external, status.purchases.internal], [0, 2], 'demo agent purchases count as internal');
    assert.equal(status.agent.budget.remaining, '0.005');
  } finally { await demo.close(); }
});

test('mainnet mode advertises Base mainnet USDC and disables browser-triggered spending', async () => {
  const facilitator = {
    async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network: 'eip155:8453' }], extensions: [], signers: {} }; },
    async verify() { return { isValid: false, invalidReason: 'not_used_in_quote_test' }; },
    async settle() { throw new Error('settlement must not run in a quote-only test'); },
  };
  const demo = createDemoServer({ mode: 'mainnet', payTo: PAY_TO, publicBaseUrl: 'https://mainnet.example', facilitator });
  await demo.initialize();
  const { port } = await demo.listen(0, '127.0.0.1');
  try {
    const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
    assert.deepEqual([health.mode, health.network, health.testnet], ['mainnet', 'eip155:8453', false]);
    const product = await (await fetch(`http://127.0.0.1:${port}/product.json`)).json();
    assert.equal(product.status, 'production');
    assert.equal(product.testnet, false);
    assert.equal(product.network, 'eip155:8453');
    const quoteResponse = await fetch(`http://127.0.0.1:${port}/convert/sample`);
    assert.equal(quoteResponse.status, 402);
    const quote = decodePaymentRequiredHeader(quoteResponse.headers.get('PAYMENT-REQUIRED'));
    assert.equal(quote.accepts[0].network, 'eip155:8453');
    assert.equal(quote.accepts[0].asset.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913');
    assert.equal(quote.accepts[0].payTo, PAY_TO);
    assert.equal((await fetch(`http://127.0.0.1:${port}/demo/run`, { method: 'POST' })).status, 503);
  } finally { await demo.close(); }
  assert.throws(() => createDemoServer({ mode: 'mainnet', payTo: PAY_TO, publicBaseUrl: 'https://mainnet.example', facilitator, agentKey: generatePrivateKey() }), /DEMO_AGENT_KEY is disabled/);
  const previousId = process.env.CDP_API_KEY_ID, previousSecret = process.env.CDP_API_KEY_SECRET;
  process.env.CDP_API_KEY_ID = ''; process.env.CDP_API_KEY_SECRET = '';
  try { assert.throws(() => createDemoServer({ mode: 'mainnet', payTo: PAY_TO, publicBaseUrl: 'https://mainnet.example' }), /requires CDP_API_KEY_ID and CDP_API_KEY_SECRET/); }
  finally {
    if (previousId === undefined) delete process.env.CDP_API_KEY_ID; else process.env.CDP_API_KEY_ID = previousId;
    if (previousSecret === undefined) delete process.env.CDP_API_KEY_SECRET; else process.env.CDP_API_KEY_SECRET = previousSecret;
  }
});

test('an external x402 client pays for POST /convert and is counted separately', async () => {
  const { demo, base } = await start({ agentKey: generatePrivateKey() });
  try {
    const buyer = generatePrivateKey();
    const { required, payload, response } = await payWith(buyer, `${base}/convert`, { method: 'POST', body: JSON.stringify({ markdown: '| k | v |\n|---|---|\n| price | 0.01 |' }) });
    assert.equal(required.extensions.bazaar.info.input.bodyType, 'json');
    assert.equal(required.extensions.bazaar.info.input.body.markdown, '| a | b |\n|---|---|\n| 1 | 2 |');
    assert.equal(required.extensions.bazaar.info.output.example.format, 'handsel.markdown-tables.v1');
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).tables, [{ columns: ['k', 'v'], rows: [['price', '0.01']] }]);
    const settlement = decodePaymentResponseHeader(response.headers.get('PAYMENT-RESPONSE'));
    assert.equal(settlement.success, true);
    assert.equal(settlement.payer.toLowerCase(), privateKeyToAccount(buyer).address.toLowerCase());
    assert.deepEqual([demo.ledger.external, demo.ledger.internal], [1, 0]);
    // Replaying the same signed authorization is refused.
    const replay = await fetch(`${base}/convert`, { method: 'POST', body: '{"markdown":""}', headers: { 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } });
    assert.equal(replay.status, 402);
    assert.equal(demo.ledger.external, 1);
    // A verified payment for an invalid body is cancelled, not settled.
    const bad = await payWith(buyer, `${base}/convert`, { method: 'POST', body: 'not json' });
    assert.equal(bad.response.status, 400);
    assert.equal(demo.facilitator.settled.length, 1);
  } finally { await demo.close(); }
});

test('local facilitator rejects tampered amount, wrong recipient and foreign signatures', async () => {
  const facilitator = new LocalSimulationFacilitator();
  const key = generatePrivateKey();
  const required = { x402Version: 2, resource: { url: 'http://127.0.0.1:1/convert/sample' }, accepts: [{ scheme: 'exact', network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: '10000', payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } }] };
  const client = new x402Client().register('eip155:84532', new ExactEvmScheme(privateKeyToAccount(key)));
  const payload = await client.createPaymentPayload(required);
  assert.equal((await facilitator.verify(payload, required.accepts[0])).isValid, true);
  assert.equal((await facilitator.verify(payload, { ...required.accepts[0], amount: '20000' })).isValid, false);
  assert.equal((await facilitator.verify(payload, { ...required.accepts[0], payTo: '0x2222222222222222222222222222222222222222' })).isValid, false);
  const forged = structuredClone(payload); forged.payload.authorization.from = privateKeyToAccount(generatePrivateKey()).address;
  assert.equal((await facilitator.verify(forged, required.accepts[0])).invalidReason, 'invalid_exact_evm_payload_signature');
  const settled = await facilitator.settle(payload, required.accepts[0]);
  assert.equal(settled.success, true); assert.equal(settled.extra.onchain, false);
  assert.equal((await facilitator.settle(payload, required.accepts[0])).success, false, 'nonce reuse');
});

test('402 carries an enriched Bazaar declaration and the paid payload echoes it for indexing', async () => {
  const { demo, base } = await start();
  try {
    const first = await fetch(`${base}/convert`, { method: 'POST', body: '{"markdown":""}' });
    const required = decodePaymentRequiredHeader(first.headers.get('PAYMENT-REQUIRED'));
    assert.equal(required.extensions.bazaar.info.input.method, 'POST', 'server extension must add the method');
    assert.equal(required.extensions.bazaar.info.input.bodyType, 'json');
    const client = new x402Client().register('eip155:84532', new ExactEvmScheme(privateKeyToAccount(generatePrivateKey())));
    const payload = await client.createPaymentPayload(required);
    assert.ok(payload.extensions?.bazaar, 'client payload keeps the seller declaration so the facilitator can index the resource');
    const sample = decodePaymentRequiredHeader((await fetch(`${base}/convert/sample`)).headers.get('PAYMENT-REQUIRED'));
    assert.equal(sample.extensions.bazaar.info.input.method, 'GET');
  } finally { await demo.close(); }
});

test('product.json carries terms and contact; wrong method on the tool path gets a 405 hint; status exposes Bazaar stats', async () => {
  const probe = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1' });
  const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const facilitator = new LocalSimulationFacilitator();
  const demo = createDemoServer({ mode: 'testnet', payTo: PAY_TO, publicBaseUrl: 'https://demo.example', facilitator, bazaarStatsReader: async () => ({ indexed: true, l30DaysTotalCalls: 7, l30DaysUniquePayers: 3 }) });
  await demo.initialize(); await demo.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  try {
    const product = await (await fetch(`${base}/product.json`)).json();
    assert.match(product.terms.settlement, /no refunds/);
    assert.match(product.contact, /github\.com/);
    assert.equal(product.verification.bazaarIndexed, true, 'product.json reflects the live Bazaar index state');
    assert.match(product.endpoints[0].description, /예제 입력으로|샘플 문서/);
    const wrong = await fetch(`${base}/convert`);
    assert.equal(wrong.status, 405); assert.equal(wrong.headers.get('allow'), 'POST'); assert.match((await wrong.json()).error, /GET \/convert\/sample/);
    const status = await (await fetch(`${base}/demo/status`)).json();
    assert.deepEqual(status.bazaar, { indexed: true, l30DaysTotalCalls: 7, l30DaysUniquePayers: 3 });
    assert.deepEqual(status.product.exampleRequest, { markdown: '| a | b |\n|---|---|\n| 1 | 2 |' });
    for (const asset of ['/assets/hero.jpg', '/assets/og.jpg', '/favicon.svg']) { const r = await fetch(`${base}${asset}`); assert.equal(r.status, 200, asset); }
  } finally { await demo.close(); }
  const local = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1' });
  await local.initialize(); const { port: p2 } = await local.listen(0, '127.0.0.1');
  try { assert.equal((await (await fetch(`http://127.0.0.1:${p2}/demo/status`)).json()).bazaar, null, 'no Bazaar lookups in local mode'); } finally { await local.close(); }
});
