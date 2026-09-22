import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { createDemoServer } from '../demo/seller.js';
import { upstreamTool, parseUpstreamUrl, productDraftToUpstream, SECRET_HEADER } from '../demo/upstream.js';
import { configFromEnv } from '../demo/config.js';
import { buildProduct } from '../seller/model.js';

const PAY_TO = '0x2222222222222222222222222222222222222222';
const SECRET = 'test-secret-with-enough-length';

// A stand-in for a seller's existing API: rejects calls without the shared secret,
// echoes what it received, and can be told to fail.
function fakeUpstream() {
  const calls = [];
  let failNext = false;
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks).toString();
    calls.push({ method: req.method, url: req.url, secret: req.headers[SECRET_HEADER], paidBy: req.headers['x-paid-by'], body });
    if (req.headers[SECRET_HEADER] !== SECRET) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"unpaid"}'); }
    if (failNext) { failNext = false; res.writeHead(500); return res.end('boom'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ extracted: body ? JSON.parse(body) : null, method: req.method }));
  });
  return { server, calls, fail: () => { failNext = true; }, listen: () => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port))), close: () => new Promise(r => server.close(r)) };
}
async function start(tool, extra = {}) {
  const probe = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1', tool });
  const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const demo = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: `http://127.0.0.1:${port}`, tool, ...extra });
  await demo.initialize(); await demo.listen(port, '127.0.0.1');
  return { demo, base: `http://127.0.0.1:${port}` };
}
async function payWith(key, url, init = {}) {
  const first = await fetch(url, init);
  assert.equal(first.status, 402);
  const required = decodePaymentRequiredHeader(first.headers.get('PAYMENT-REQUIRED'));
  const client = new x402Client().register('eip155:84532', new ExactEvmScheme(privateKeyToAccount(key)));
  const payload = await client.createPaymentPayload(required);
  return { required, response: await fetch(url, { ...init, headers: { ...init.headers, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } }) };
}
const draft = () => buildProduct({ name: 'PDF Table Extractor', description: '공개 PDF 주소를 입력하면 표를 JSON으로 반환합니다.', endpoint: 'https://api.seller.example/extract', method: 'POST', price: '0.02', payTo: PAY_TO, request: '{"fileUrl":"https://example.com/report.pdf"}', response: '{"tables":[]}' });

test('upstream URL and configuration are locked down', () => {
  for (const bad of ['http://api.seller.example/extract', 'https://user:pw@api.seller.example/x', 'https://api.seller.example/x?key=1', 'https://api.seller.example/', 'https://api.seller.example/x/sample', 'ftp://x/y', '']) assert.throws(() => parseUpstreamUrl(bad), bad);
  assert.equal(parseUpstreamUrl('http://127.0.0.1:9/extract').pathname, '/extract');
  const ok = { url: 'https://api.seller.example/extract', secret: SECRET, name: 'n', description: 'd', exampleRequest: { a: 1 } };
  assert.throws(() => upstreamTool({ ...ok, secret: 'short' }), /UPSTREAM_SECRET/);
  assert.throws(() => upstreamTool({ ...ok, method: 'PUT' }));
  assert.throws(() => upstreamTool({ ...ok, exampleRequest: undefined }), /example request/);
  assert.throws(() => upstreamTool({ ...ok, name: '' }));
  assert.throws(() => productDraftToUpstream({ format: 'other' }));
});

test('a Seller Studio export configures the proxy through the environment', () => {
  const d = draft();
  const mapped = productDraftToUpstream({ product: d, x402Routes: {}, nextSteps: [] }, { secret: SECRET });
  assert.deepEqual([mapped.url, mapped.method, mapped.price, mapped.payTo, mapped.name], ['https://api.seller.example/extract', 'POST', '0.02', PAY_TO, 'PDF Table Extractor']);
  assert.deepEqual(mapped.exampleRequest, { fileUrl: 'https://example.com/report.pdf' });
  const config = configFromEnv({ UPSTREAM_URL: 'https://api.seller.example/extract', UPSTREAM_SECRET: SECRET, PRODUCT_NAME: 'X', PRODUCT_DESCRIPTION: 'Y', PRODUCT_EXAMPLE_REQUEST: '{"q":1}', SELLER_PAY_TO: PAY_TO, DEMO_MODE: 'testnet' });
  assert.equal(config.tool.upstream, 'https://api.seller.example/extract');
  assert.equal(config.tool.path, '/extract');
  assert.equal(config.payTo, PAY_TO);
  assert.throws(() => configFromEnv({ UPSTREAM_URL: 'https://api.seller.example/extract' }), /UPSTREAM_SECRET/);
});

test('paid calls are forwarded to the seller API with the shared secret; unpaid and failed calls are not settled', async () => {
  const up = fakeUpstream(); const upPort = await up.listen();
  const d = draft();
  const tool = upstreamTool({ ...productDraftToUpstream(d, { secret: SECRET }), url: `http://127.0.0.1:${upPort}/extract` });
  const { demo, base } = await start(tool, { agentKey: generatePrivateKey(), price: d.payment.price });
  try {
    const product = await (await fetch(`${base}/product.json`)).json();
    assert.equal(product.name, 'PDF Table Extractor');
    assert.equal(product.verification.proxiedUpstream, true);
    assert.deepEqual(product.endpoints.map(e => `${e.method} ${e.url}`), [`GET ${base}/extract/sample`, `POST ${base}/extract`]);
    assert.equal(JSON.stringify(product).includes(SECRET), false, 'secret never leaks into product metadata');
    // Unpaid: 402, upstream untouched.
    assert.equal((await fetch(`${base}/extract`, { method: 'POST', body: '{}' })).status, 402);
    assert.equal(up.calls.length, 0);
    // External buyer pays for POST with its own input.
    const buyer = generatePrivateKey();
    const { required, response } = await payWith(buyer, `${base}/extract`, { method: 'POST', body: JSON.stringify({ fileUrl: 'https://example.com/other.pdf' }), headers: { 'content-type': 'application/json' } });
    assert.equal(required.accepts[0].amount, '20000');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { extracted: { fileUrl: 'https://example.com/other.pdf' }, method: 'POST' });
    assert.equal(decodePaymentResponseHeader(response.headers.get('PAYMENT-RESPONSE')).success, true);
    assert.equal(up.calls.at(-1).secret, SECRET);
    assert.equal(up.calls.at(-1).paidBy.toLowerCase(), privateKeyToAccount(buyer).address.toLowerCase());
    // Server-run demo agent buys the sample route: the example request is forwarded.
    const run = await (await fetch(`${base}/demo/run`, { method: 'POST' })).json();
    assert.deepEqual(run.steps.map(s => [s.id, s.status]), [['discover', 'ok'], ['quote', 'ok'], ['budget', 'ok'], ['pay', 'ok'], ['result', 'ok']]);
    assert.deepEqual(run.steps.at(-1).result.extracted, { fileUrl: 'https://example.com/report.pdf' });
    assert.deepEqual([demo.ledger.external, demo.ledger.internal], [1, 1]);
    // Upstream failure after verification: payment cancelled, nothing settled, 502 to the buyer.
    up.fail();
    const failed = await payWith(buyer, `${base}/extract`, { method: 'POST', body: '{"fileUrl":"x"}' });
    assert.equal(failed.response.status, 502);
    assert.equal((await failed.response.json()).paymentCancelled, true);
    assert.equal(demo.facilitator.settled.length, 2);
    assert.deepEqual([demo.ledger.external, demo.ledger.internal], [1, 1]);
    // Direct unpaid call to the seller API is the seller's own check.
    assert.equal((await fetch(`http://127.0.0.1:${upPort}/extract`, { method: 'POST', body: '{}' })).status, 401);
  } finally { await demo.close(); await up.close(); }
});

test('testnet mode gates the browser-run agent on the wallet USDC balance', async () => {
  const { LocalSimulationFacilitator } = await import('../demo/facilitator-local.js');
  let balance = 0n;
  const make = port => createDemoServer({ mode: 'testnet', payTo: PAY_TO, publicBaseUrl: 'https://demo.example', facilitator: new LocalSimulationFacilitator(), agentKey: generatePrivateKey(), balanceReader: async () => balance, agentFetcher: (url, o) => fetch(String(url).replace('https://demo.example', `http://127.0.0.1:${port}`), o) });
  const probe = make(1); const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const demo = make(port); await demo.initialize(); await demo.listen(port, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  try {
    const status = await (await fetch(`${base}/demo/status`)).json();
    assert.equal(status.mode, 'testnet');
    assert.deepEqual([status.agent.funding.funded, status.agent.funding.usdcBalance], [false, '0']);
    const blocked = await fetch(`${base}/demo/run`, { method: 'POST' });
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).error, /USDC/);
    assert.equal(demo.facilitator.settled.length, 0);
    balance = 5000n; // below the 0.01 price
    await new Promise(r => setTimeout(r, 20)); // cache still holds 0 → still blocked
    assert.equal((await fetch(`${base}/demo/run`, { method: 'POST' })).status, 409);
  } finally { await demo.close(); }
});
