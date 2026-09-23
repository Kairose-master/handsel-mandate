import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generatePrivateKey } from 'viem/accounts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createDemoServer } from '../demo/seller.js';
import { createWallet, micro } from '../mcp/wallet.js';
import { createCatalog, normalizeProduct } from '../mcp/catalog.js';
import { buildServer, startHttp } from '../mcp/server.js';
import { createMcpClient } from '../examples/mcp-browser-client.js';

const PAY_TO = '0x4444444444444444444444444444444444444444';
async function seller() {
  const probe = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: 'http://127.0.0.1:1' });
  const { port } = await probe.listen(0, '127.0.0.1'); await probe.close();
  const demo = createDemoServer({ mode: 'local', payTo: PAY_TO, publicBaseUrl: `http://127.0.0.1:${port}` });
  await demo.initialize(); await demo.listen(port, '127.0.0.1');
  return { demo, base: `http://127.0.0.1:${port}` };
}
const parse = r => JSON.parse(r.content[0].text);

test('wallet enforces the human ceiling, per-call and total limits before any signature', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), '402lab-'));
  let fetches = 0;
  const wallet = createWallet({ privateKey: generatePrivateKey(), network: 'eip155:84532', statePath: path.join(dir, 'state.json'), maxMandateUsdc: '1', fetcher: async () => { fetches++; throw new Error('must not be called'); } });
  await assert.rejects(() => wallet.createMandate({ total: '1.5' }), /ceiling/);
  await assert.rejects(() => wallet.createMandate({ total: '0.5', perCall: '0.6' }), /per-call/);
  await assert.rejects(() => wallet.buy({ url: 'https://seller.example/x' }), /No active mandate/);
  const m = await wallet.createMandate({ total: '0.05', perCall: '0.02', minutes: 30, allowedSellers: [PAY_TO] });
  assert.equal(m.status, 'active'); assert.equal(m.remaining, '0.05');
  await assert.rejects(() => wallet.createMandate({ total: '0.01' }), /already exists/);
  const quote = (amount, payTo = PAY_TO, network = 'eip155:84532', asset = '0x036cbd53842c5426634e7929541ec2318f3dcf7e') => ({ x402Version: 2, resource: { url: 'https://seller.example/x' }, accepts: [{ scheme: 'exact', network, asset, amount, payTo, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } }] });
  const state = { ...(await wallet.status()), total: micro('0.05').toString(), perCall: micro('0.02').toString(), reserved: '0', expiresAt: Date.now() + 600000, revoked: false, allowedSellers: [PAY_TO] };
  assert.equal(wallet.check(quote('20000'), 'https://seller.example/x', state).amount, '20000');
  assert.throws(() => wallet.check(quote('20001'), 'https://seller.example/x', state), /per-call/);
  assert.throws(() => wallet.check(quote('10000', '0x5555555555555555555555555555555555555555'), 'https://seller.example/x', state), /allowlist/);
  assert.throws(() => wallet.check(quote('10000', PAY_TO, 'eip155:8453', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'), 'https://seller.example/x', state), /No exact USDC offer on Base Sepolia/);
  assert.throws(() => wallet.check(quote('10000'), 'https://seller.example/other', state), /Quote is for/);
  await assert.rejects(() => wallet.buy({ url: 'http://evil.example/x' }), /https/);
  assert.equal(fetches, 0);
});

test('catalog normalizes seller product.json and filters to the configured network', async () => {
  const product = { format: 'blockflow.product.v1', name: 'PDF 표 추출', description: '표를 뽑습니다', network: 'eip155:84532', testnet: true, price: '0.01', payTo: PAY_TO, endpoints: [{ method: 'GET', url: 'https://s.example/extract/sample', description: '샘플' }, { method: 'POST', url: 'https://s.example/extract', request: { fileUrl: 'x' } }] };
  assert.equal(normalizeProduct(product, 'src').length, 2);
  const catalog = createCatalog({ network: 'eip155:8453', bazaar: false, catalogUrls: ['https://s.example/product.json'], fetcher: async () => new Response(JSON.stringify(product)) });
  assert.deepEqual((await catalog.discover('표')).items, [], 'testnet product hidden on mainnet');
  const cat2 = createCatalog({ network: 'eip155:84532', bazaar: false, catalogUrls: ['https://s.example/product.json', 'https://down.example/p.json'], fetcher: async url => url.includes('down') ? new Response('', { status: 500 }) : new Response(JSON.stringify(product)) });
  const found = await cat2.discover('pdf 표');
  assert.equal(found.items.length, 2); assert.equal(found.items[0].price, '0.01'); assert.equal(found.errors.length, 1);
  assert.equal((await cat2.discover('날씨')).items.length, 0);
});

test('MCP over stdio: delegate → discover → buy within budget → blocked over budget → receipts', async () => {
  const { demo, base } = await seller();
  const dir = await mkdtemp(path.join(tmpdir(), '402lab-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: ['mcp/server.js'], env: { ...process.env, BUYER_PRIVATE_KEY: generatePrivateKey(), NETWORK: 'eip155:84532', CATALOG_URLS: `${base}/product.json`, BAZAAR: '0', STATE_PATH: path.join(dir, 'state.json'), MANDATE_MAX_USDC: '1' }, stderr: 'pipe' });
  const client = new Client({ name: 'test', version: '0' });
  try {
    await client.connect(transport);
    const tools = (await client.listTools()).tools.map(t => t.name).sort();
    assert.deepEqual(tools, ['buy', 'discover', 'mandate_create', 'mandate_revoke', 'mandate_status', 'receipts']);
    assert.equal(parse(await client.callTool({ name: 'mandate_status', arguments: {} })).mandate, null);
    const blocked = await client.callTool({ name: 'buy', arguments: { url: `${base}/convert/sample` } });
    assert.equal(blocked.isError, true); assert.match(blocked.content[0].text, /No active mandate/);
    const mandate = parse(await client.callTool({ name: 'mandate_create', arguments: { total_usdc: '0.025', per_call_usdc: '0.01', minutes: 30 } }));
    assert.equal(mandate.remaining, '0.025');
    const found = parse(await client.callTool({ name: 'discover', arguments: { query: 'markdown 표 json' } }));
    assert.equal(found.items.length, 2);
    const sample = found.items.find(i => i.method === 'GET');
    const first = parse(await client.callTool({ name: 'buy', arguments: { url: sample.url, request_id: 'one' } }));
    assert.equal(first.status, 'seller-reported-settled'); assert.equal(first.paid, '0.01 USDC'); assert.equal(first.result.tableCount, 2);
    assert.equal(parse(await client.callTool({ name: 'buy', arguments: { url: sample.url, request_id: 'one' } })).status, 'seller-reported-settled', 'idempotent retry');
    const post = found.items.find(i => i.method === 'POST');
    const second = parse(await client.callTool({ name: 'buy', arguments: { url: post.url, method: 'POST', input: { markdown: '| a |\n|---|\n| 1 |' } } }));
    assert.deepEqual(second.result.tables, [{ columns: ['a'], rows: [['1']] }]);
    assert.equal(second.mandate.remaining, '0.005');
    const third = await client.callTool({ name: 'buy', arguments: { url: sample.url } });
    assert.equal(third.isError, true); assert.match(third.content[0].text, /remaining budget/);
    assert.equal(demo.facilitator.settled.length, 2, 'the blocked purchase never reached the seller facilitator');
    assert.equal(parse(await client.callTool({ name: 'receipts', arguments: {} })).length, 2);
    assert.equal(parse(await client.callTool({ name: 'mandate_revoke', arguments: {} })).status, 'revoked');
    const after = await client.callTool({ name: 'buy', arguments: { url: sample.url } });
    assert.equal(after.isError, true);
  } finally { await client.close().catch(() => {}); await demo.close(); }
});

test('MCP over HTTP: bearer token and extension-only origin, driven by the browser client', async () => {
  const { demo, base } = await seller();
  const dir = await mkdtemp(path.join(tmpdir(), '402lab-'));
  const built = buildServer({ BUYER_PRIVATE_KEY: generatePrivateKey(), NETWORK: 'eip155:84532', CATALOG_URLS: `${base}/product.json`, BAZAAR: '0', STATE_PATH: path.join(dir, 'state.json') });
  const http = await startHttp(built, { port: 0, token: 'test-token' });
  try {
    assert.equal((await fetch(http.url, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(http.url, { method: 'POST', body: '{}', headers: { origin: 'https://evil.example', authorization: 'Bearer test-token' } })).status, 403);
    assert.equal((await fetch(http.url, { method: 'OPTIONS', headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } })).status, 204);
    const client = createMcpClient({ url: http.url, token: 'test-token' });
    await client.init();
    assert.ok((await client.tools()).tools.some(t => t.name === 'buy'));
    const m = await client.call('mandate_create', { total_usdc: '0.01' });
    assert.equal(m.status, 'active');
    const r = await client.call('buy', { url: `${base}/convert/sample` });
    assert.equal(r.status, 'seller-reported-settled');
    await assert.rejects(() => client.call('buy', { url: `${base}/convert/sample` }), /remaining budget/);
  } finally { await http.close(); await demo.close(); }
});

test('catalog normalizes real Bazaar listings and buys can use query parameters', async () => {
  const listing = { x402Version: 1, type: 'http', resource: 'https://api.onesource.example/api/chain/erc20-balance', description: 'ERC20 token balance', lastUpdated: '2026-09-23T04:07:01Z', quality: { score: 0.9 }, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000', payTo: '0x52E29e0d2Aa49bfBfC548C0A9F2196F4aa51f3ea', maxTimeoutSeconds: 3600, extra: { name: 'USD Coin', version: '2', credentialTypes: ['authorization'] } }], extensions: { bazaar: { info: { input: { type: 'http', method: 'GET', queryParams: { address: '0xd8da…', network: 'ethereum' } }, output: { example: { balance: '1' } } } } } };
  const post = { ...listing, resource: 'https://agent402.example/api/csv-to-md', description: 'Convert CSV into a Markdown table', accepts: [{ ...listing.accepts[0], amount: '2000' }], extensions: { bazaar: { info: { input: { type: 'http', method: 'POST', bodyType: 'json', body: { csv: 'a,b' } }, output: { example: { markdown: '| a |' } } } } } };
  const escrow = { ...listing, resource: 'https://escrow.example/x', accepts: [{ ...listing.accepts[0], extra: { name: 'USD Coin', version: '2', paymentFlow: 'upfront', withdrawDelay: 86400 } }] };
  const testnet = { ...listing, resource: 'https://t.example/x', accepts: [{ ...listing.accepts[0], network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', extra: { name: 'USDC', version: '2' } }] };
  const bazaarClient = { extensions: { bazaar: { search: async ({ query }) => ({ resources: query.includes('csv') ? [post, escrow, testnet] : [] }), listResources: async () => ({ items: [listing, post, escrow, testnet] }) } } };
  const cat = createCatalog({ network: 'eip155:8453', bazaarClient });
  const found = await cat.discover('csv to markdown');
  assert.deepEqual(found.items.map(i => [i.method, i.url, i.price]), [['POST', 'https://agent402.example/api/csv-to-md', '0.002']], 'escrow flow and testnet items are dropped');
  assert.deepEqual(found.items[0].exampleRequest, { csv: 'a,b' });
  const listed = await cat.discover('');
  assert.deepEqual(listed.items.map(i => i.method), ['GET', 'POST']);
  assert.deepEqual(listed.items[0].exampleQuery, { address: '0xd8da…', network: 'ethereum' });
  const off = createCatalog({ network: 'eip155:8453', bazaar: false, bazaarClient });
  assert.equal((await off.discover('csv')).items.length, 0);
  // Mainnet quotes name the token domain "USD Coin"; a GET with query params matches the quote's bare resource URL.
  const dir = await mkdtemp(path.join(tmpdir(), '402lab-'));
  const wallet = createWallet({ privateKey: generatePrivateKey(), network: 'eip155:8453', statePath: path.join(dir, 's.json') });
  const m = { total: '1000000', perCall: '1000000', reserved: '0', expiresAt: Date.now() + 600000, revoked: false, allowedSellers: [] };
  const quote = { x402Version: 2, resource: { url: 'https://api.onesource.example/api/chain/erc20-balance' }, accepts: [{ scheme: 'exact', network: 'eip155:8453', asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', amount: '1000', payTo: listing.accepts[0].payTo, maxTimeoutSeconds: 3600, extra: { name: 'USD Coin', version: '2' } }] };
  assert.equal(wallet.check(quote, 'https://api.onesource.example/api/chain/erc20-balance?address=0xabc&network=ethereum', m).amount, '1000');
  assert.throws(() => wallet.check({ ...quote, accepts: [{ ...quote.accepts[0], extra: { name: 'USDC', version: '2' } }] }, quote.resource.url, m), /token domain/);
  assert.throws(() => wallet.check({ ...quote, accepts: [{ ...quote.accepts[0], extra: { name: 'USD Coin', version: '2', paymentFlow: 'upfront' } }] }, quote.resource.url, m), /payment flow/);
});
