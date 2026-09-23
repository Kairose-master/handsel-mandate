import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { createDemoServer } from '../demo/seller.js';
import { ntsTool, normalizeNumbers } from '../demo/tools/nts.js';
import { configFromEnv } from '../demo/config.js';

const KEY = 'test-service-key-0123456789abcdef';
const PAY_TO = '0x6666666666666666666666666666666666666666';
function fakeNts() {
  const calls = [];
  const fetcher = async (url, init) => {
    const u = new URL(url); calls.push({ key: u.searchParams.get('serviceKey'), body: JSON.parse(init.body) });
    const numbers = JSON.parse(init.body).b_no;
    return new Response(JSON.stringify({ status_code: 'OK', request_cnt: numbers.length, match_cnt: numbers.length, data: numbers.map(b_no => ({ b_no, b_stt: '계속사업자', b_stt_cd: '01', tax_type: '부가가치세 일반과세자', tax_type_cd: '01', end_dt: '', utcc_yn: 'N', tax_type_change_dt: '', invoice_apply_dt: '', rbf_tax_type: '해당없음', rbf_tax_type_cd: '99', extra_we_drop: 1 })) }), { headers: { 'content-type': 'application/json' } });
  };
  return { fetcher, calls };
}
async function start(tool) {
  const probe = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1', tool });
  const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const demo = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: `http://127.0.0.1:${port}`, tool, agentKey: generatePrivateKey() });
  await demo.initialize(); await demo.listen(port, '127.0.0.1');
  return { demo, base: `http://127.0.0.1:${port}` };
}
async function pay(key, url, init = {}) {
  const first = await fetch(url, init); assert.equal(first.status, 402);
  const required = decodePaymentRequiredHeader(first.headers.get('PAYMENT-REQUIRED'));
  const payload = await new x402Client().register('eip155:84532', new ExactEvmScheme(privateKeyToAccount(key))).createPaymentPayload(required);
  return fetch(url, { ...init, headers: { ...init.headers, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } });
}

test('input validation: hyphens stripped, 10 digits, at most 100', () => {
  assert.deepEqual(normalizeNumbers(['124-81-00998', ' 1234567890 ']), ['1248100998', '1234567890']);
  assert.throws(() => normalizeNumbers([]), /non-empty/);
  assert.throws(() => normalizeNumbers(['12345']), /Invalid/);
  assert.throws(() => normalizeNumbers(Array(101).fill('1234567890')), /100/);
  assert.throws(() => ntsTool({ serviceKey: 'short' }), /NTS_SERVICE_KEY/);
});

test('config picks the 국세청 product when NTS_SERVICE_KEY is set, otherwise the converter', () => {
  assert.equal(configFromEnv({ NTS_SERVICE_KEY: KEY }).tool.path, '/biz/status');
  assert.equal(configFromEnv({}).tool, undefined);
});

test('paid status lookup forwards numbers with our key, never leaks the key, and cancels on upstream failure', async () => {
  const nts = fakeNts();
  const { demo, base } = await start(ntsTool({ serviceKey: KEY, fetcher: nts.fetcher }));
  try {
    const product = await (await fetch(`${base}/product.json`)).json();
    assert.equal(product.name, '사업자등록 상태 조회 (국세청)');
    assert.deepEqual(product.endpoints.map(e => `${e.method} ${e.url}`), [`GET ${base}/biz/status/sample`, `POST ${base}/biz/status`]);
    assert.equal(JSON.stringify(product).includes(KEY), false);
    const quote = await fetch(`${base}/biz/status`, { method: 'POST', body: '{"b_no":["1248100998"]}' });
    assert.equal(quote.status, 402); assert.equal(nts.calls.length, 0, 'unpaid requests never hit 국세청');
    const buyer = generatePrivateKey();
    const paid = await pay(buyer, `${base}/biz/status`, { method: 'POST', body: JSON.stringify({ b_no: ['124-81-00998', '1234567890'] }), headers: { 'content-type': 'application/json' } });
    assert.equal(paid.status, 200);
    const out = await paid.json();
    assert.equal(out.format, 'handsel.nts-business-status.v1');
    assert.deepEqual(out.data.map(d => d.b_no), ['1248100998', '1234567890']);
    assert.equal('extra_we_drop' in out.data[0], false, 'only documented fields are returned');
    assert.equal(nts.calls[0].key, KEY); assert.deepEqual(nts.calls[0].body, { b_no: ['1248100998', '1234567890'] });
    assert.equal(JSON.stringify(out).includes(KEY), false);
    const bad = await pay(buyer, `${base}/biz/status`, { method: 'POST', body: '{"b_no":["12"]}' });
    assert.equal(bad.status, 400); assert.equal((await bad.json()).paymentCancelled, true);
    const run = await (await fetch(`${base}/demo/run`, { method: 'POST' })).json();
    assert.equal(run.steps.at(-1).status, 'ok'); assert.equal(run.steps.at(-1).result.data[0].b_stt, '계속사업자');
    assert.equal(demo.facilitator.settled.length, 2);
  } finally { await demo.close(); }
  const failing = ntsTool({ serviceKey: KEY, fetcher: async () => new Response('{"status_code":"ERROR","msg":"quota"}', { status: 500 }) });
  const { demo: d2, base: b2 } = await start(failing);
  try {
    const r = await pay(generatePrivateKey(), `${b2}/biz/status`, { method: 'POST', body: '{"b_no":["1248100998"]}' });
    assert.equal(r.status, 502); assert.match((await r.json()).error, /국세청 API returned HTTP 500/); assert.equal(d2.facilitator.settled.length, 0);
  } finally { await d2.close(); }
});
