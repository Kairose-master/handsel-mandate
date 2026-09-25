// x402-paywalled seller for one tool, built on the official @x402 server SDK
// (exact / EIP-3009 on Base Sepolia USDC), plus the public demo page and a
// server-run demo agent. Framework-free Node http.
import { createServer } from 'node:http';
import { appendFile, readFile } from 'node:fs/promises';
import { x402ResourceServer, x402HTTPResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { createCdpFacilitatorClient } from '@coinbase/cdp-sdk/x402';
import { declareDiscoveryExtension, bazaarResourceServerExtension, withBazaar } from '@x402/extensions/bazaar';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { builtinTool } from './upstream.js';
import { LocalSimulationFacilitator, NETWORK } from './facilitator-local.js';
import { createDemoAgent } from './agent.js';
import { createPublicClient, http, parseAbi } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const TESTNET_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const MAINNET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const FAUCET = 'https://faucet.circle.com';
const MAINNET_NETWORK = 'eip155:8453';
const BASESCAN = { testnet: 'https://sepolia.basescan.org/tx/', mainnet: 'https://basescan.org/tx/' };
export function usdcBalanceReader(rpcUrl = 'https://sepolia.base.org', mode = 'testnet') {
  const chain = mode === 'mainnet' ? base : baseSepolia;
  const token = mode === 'mainnet' ? MAINNET_USDC : TESTNET_USDC;
  const client = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 10000, retryCount: 1 }) });
  return address => client.readContract({ address: token, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [address] });
}

const PAGE_FILES = new Map([['/', ['page.html', 'text/html']], ['/page.js', ['page.js', 'text/javascript']], ['/page.css', ['page.css', 'text/css']], ['/assets/hero.jpg', ['assets/hero.jpg', 'image/jpeg']], ['/assets/og.jpg', ['assets/og.jpg', 'image/jpeg']], ['/favicon.svg', ['favicon.svg', 'image/svg+xml']]]);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function productFor({ publicBaseUrl, price, payTo, mode, tool, network = mode === 'mainnet' ? MAINNET_NETWORK : NETWORK }) {
  const main = `${publicBaseUrl}${tool.path}`;
  return {
    format: 'blockflow.product.v1', status: mode === 'mainnet' ? 'production' : mode === 'testnet' ? 'testnet-preview' : 'local-simulation',
    name: tool.name, description: tool.description, network, currency: 'USDC', testnet: mode !== 'mainnet', price, payTo,
    endpoints: [
      { method: 'GET', url: `${main}/sample`, description: tool.sampleDescription ?? (tool.exampleRequest ? '예제 입력으로 도구를 호출합니다. 입력이 없어 GET 전용 x402 클라이언트도 구매할 수 있습니다.' : '번들된 샘플 문서를 변환합니다. 입력이 없어 GET 전용 x402 클라이언트도 구매할 수 있습니다.') },
      { method: tool.method, url: main, description: tool.method === 'POST' ? 'JSON 본문을 도구에 전달합니다.' : '도구를 호출합니다.', request: tool.exampleRequest ?? undefined },
    ],
    exampleResponse: tool.exampleResponse ?? undefined,
    howToBuy: [`GET/POST 요청 → HTTP 402와 PAYMENT-REQUIRED 헤더(x402 v2, exact, ${network} USDC)를 받습니다.`, '요청한 금액의 EIP-3009 TransferWithAuthorization을 서명해 PAYMENT-SIGNATURE 헤더로 재요청합니다.', '200 응답 본문이 도구 결과, PAYMENT-RESPONSE 헤더가 정산 정보입니다.'],
    terms: { settlement: 'x402 exact (EIP-3009 USDC) per call, paid directly to payTo; no escrow, no refunds', failedCalls: 'a verified payment is cancelled when the tool does not return 2xx', privacy: 'request inputs are not logged', ...(tool.terms ?? {}) },
    contact: 'https://github.com/Kairose-master/handsel-mandate/issues', docs: 'https://github.com/Kairose-master/handsel-mandate/blob/main/docs/terms.md',
    verification: { onchainSettlement: mode === 'testnet' || mode === 'mainnet', bazaarIndexed: false, proxiedUpstream: !tool.builtin },
  };
}

function adapterFor(req, url) {
  const headers = req.headers;
  return { getHeader: name => { const v = headers[name.toLowerCase()]; return Array.isArray(v) ? v[0] : v; }, getMethod: () => req.method ?? 'GET', getPath: () => url.pathname, getUrl: () => url.href, getAcceptHeader: () => String(headers.accept ?? ''), getUserAgent: () => String(headers['user-agent'] ?? ''), getQueryParams: () => Object.fromEntries(url.searchParams), getQueryParam: name => url.searchParams.get(name) ?? undefined };
}
function jsonSchemaFor(example) {
  if (Array.isArray(example)) return { type: 'array', items: example.length ? jsonSchemaFor(example[0]) : {} };
  if (example === null) return { type: 'null' };
  if (typeof example === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(example).map(([key, value]) => [key, jsonSchemaFor(value)])) };
  return { type: typeof example };
}

function bazaarDiscovery(method, tool) {
  const input = method === 'GET' ? {} : (tool.exampleRequest ?? {});
  const properties = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, { ...jsonSchemaFor(value), description: key === 'markdown' ? 'Markdown document that may contain GitHub Flavored Markdown tables' : `Example value for ${key}` }]));
  const output = tool.exampleResponse ?? {};
  return declareDiscoveryExtension({
    input,
    inputSchema: { type: 'object', properties, ...(Object.keys(properties).length ? { required: Object.keys(properties) } : {}) },
    ...(method === 'GET' ? {} : { bodyType: 'json' }),
    output: { example: output, schema: jsonSchemaFor(output) },
  });
}

export function createDemoServer(options = {}) {
  const mode = options.mode ?? 'local';
  const tool = options.tool ?? builtinTool();
  if (!['local', 'testnet', 'mainnet'].includes(mode)) throw new Error('mode must be local, testnet or mainnet');
  const network = mode === 'mainnet' ? MAINNET_NETWORK : NETWORK;
  const asset = mode === 'mainnet' ? MAINNET_USDC : TESTNET_USDC;
  if (mode === 'mainnet' && options.agentKey) throw new Error('DEMO_AGENT_KEY is disabled in mainnet mode; browser-triggered real spending is not allowed');
  if (mode === 'mainnet' && !options.facilitator && (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET)) throw new Error('Mainnet mode requires CDP_API_KEY_ID and CDP_API_KEY_SECRET');
  const price = options.price ?? '0.01';
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(price) || Number(price) <= 0) throw new Error('price must be a positive USDC amount with at most six decimals');
  const payTo = options.payTo;
  if (!/^0x[0-9a-fA-F]{40}$/.test(payTo ?? '') || /^0x0{40}$/i.test(payTo)) throw new Error('SELLER_PAY_TO must be a non-zero EVM address');
  const publicBaseUrl = String(options.publicBaseUrl ?? '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(publicBaseUrl)) throw new Error('PUBLIC_BASE_URL is required (the URL buyers will see in the 402 quote)');
  if (mode !== 'local' && !publicBaseUrl.startsWith('https://')) throw new Error(`${mode} mode requires an https PUBLIC_BASE_URL`);
  const facilitator = options.facilitator ?? (mode === 'local' ? new LocalSimulationFacilitator() : mode === 'mainnet' ? createCdpFacilitatorClient() : new HTTPFacilitatorClient({ url: options.facilitatorUrl }));
  const internalPayers = new Set((options.internalPayers ?? []).map(a => a.toLowerCase()));
  const ledgerPath = options.ledgerPath ?? null;
  const ledger = { external: 0, internal: 0, entries: [] };
  const agent = options.agentKey && mode !== 'mainnet' ? createDemoAgent({ endpoint: `${publicBaseUrl}${tool.path}/sample`, payTo, privateKey: options.agentKey, total: options.demoTotal ?? '0.10', perCall: price }) : null;
  if (agent) internalPayers.add(agent.address.toLowerCase());
  const runs = { inFlight: false, times: [], perHour: options.demoRunsPerHour ?? 20 };
  // In testnet mode the demo button is gated on the agent wallet's real USDC balance,
  // so an unfunded deployment explains itself instead of burning budget on failed pays.
  const readBalance = mode === 'testnet' ? (options.balanceReader ?? usdcBalanceReader(options.rpcUrl, mode)) : null;
  const priceMicro = BigInt(Math.round(Number(price) * 1e6));
  let balanceCache = { at: 0, value: null, error: null };
  async function agentFunding() {
    if (!agent || !readBalance) return null;
    if (Date.now() - balanceCache.at > 15000) {
      try { balanceCache = { at: Date.now(), value: await readBalance(agent.address), error: null }; }
      catch (error) { balanceCache = { at: Date.now(), value: null, error: error.message }; }
    }
    const v = balanceCache.value;
    return { usdcBalance: v === null ? null : (Number(v) / 1e6).toFixed(6).replace(/\.?0+$/, ''), funded: v === null ? null : v >= priceMicro, address: agent.address, faucet: FAUCET, network, error: balanceCache.error };
  }
  const log = options.log ?? (() => {});
  // Durable public metrics come from the x402 Bazaar (30-day calls / unique payers), not from instance memory.
  let bazaarCache = { at: 0, value: null };
  async function bazaarStats() {
    if (mode === 'local') return null;
    if (Date.now() - bazaarCache.at < 600000) return bazaarCache.value;
    try {
      const value = options.bazaarStatsReader ? await options.bazaarStatsReader() : await (async () => {
        const c = withBazaar(new HTTPFacilitatorClient({ url: options.bazaarUrl ?? 'https://api.cdp.coinbase.com/platform/v2/x402', timeoutMs: 10000 }));
        const s = await c.extensions.bazaar.search({ query: tool.name, network, type: 'http' });
        const hit = (s.resources ?? []).find(i => String(i.resource).startsWith(`${publicBaseUrl}${tool.path}`));
        return hit ? { indexed: true, ...(hit.quality ?? {}) } : { indexed: false };
      })();
      bazaarCache = { at: Date.now(), value };
    } catch (error) { bazaarCache = { at: Date.now(), value: { indexed: null, error: error.message } }; }
    return bazaarCache.value;
  }

  const accepts = { scheme: 'exact', network, asset, price: `$${price}`, payTo, maxTimeoutSeconds: 60 };
  const routes = {
    // serviceName (≤32 ASCII) and tags feed Bazaar search; description carries the bilingual product text.
    [`GET ${tool.path}/sample`]: { accepts, resource: `${publicBaseUrl}${tool.path}/sample`, description: `${tool.description} (sample input)`.slice(0, 500), mimeType: 'application/json', ...(tool.serviceName ? { serviceName: tool.serviceName } : {}), ...(tool.tags ? { tags: tool.tags } : {}), extensions: bazaarDiscovery('GET', tool) },
    [`${tool.method} ${tool.path}`]: { accepts, resource: `${publicBaseUrl}${tool.path}`, description: String(tool.description).slice(0, 500), mimeType: 'application/json', ...(tool.serviceName ? { serviceName: tool.serviceName } : {}), ...(tool.tags ? { tags: tool.tags } : {}), extensions: bazaarDiscovery(tool.method, tool) },
  };
  // The Bazaar server extension enriches the 402 declaration (method, route template); without it the facilitator cannot index the resource.
  const paid = new x402HTTPResourceServer(new x402ResourceServer(facilitator).register(network, new ExactEvmScheme()).registerExtension(bazaarResourceServerExtension), routes);
  const product = productFor({ publicBaseUrl, price, payTo, mode, tool, network });

  async function record(entry) {
    const internal = internalPayers.has(String(entry.payer ?? '').toLowerCase());
    const row = { ...entry, internal, mode, at: new Date().toISOString() };
    ledger[internal ? 'internal' : 'external']++;
    ledger.entries.push(row); if (ledger.entries.length > 200) ledger.entries.shift();
    if (ledgerPath) await appendFile(ledgerPath, JSON.stringify(row) + '\n').catch(error => log('ledger-write-failed', error.message));
  }
  function send(res, status, body, headers = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': typeof body === 'string' && !headers['Content-Type'] ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE', ...headers });
    res.end(text);
  }
  function sendInstructions(res, instructions) {
    const { status, headers, body, isHtml } = instructions;
    const text = isHtml || typeof body === 'string' ? String(body ?? '') : JSON.stringify(body ?? {});
    res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE', ...headers });
    res.end(text);
  }

  async function handlePaid(req, res, url, invoke) {
    const context = { adapter: adapterFor(req, url), path: url.pathname, method: req.method };
    const outcome = await paid.processHTTPRequest(context);
    if (outcome.type === 'no-payment-required') return send(res, 404, { error: 'Not found' });
    if (outcome.type === 'payment-error') return sendInstructions(res, outcome.response);
    const payer = outcome.paymentPayload.payload?.authorization?.from;
    let output;
    try { output = await invoke({ payer }); }
    catch (error) {
      // Nothing settled yet (authorization flow): release the verified payment.
      await outcome.cancellationDispatcher?.cancel?.({ reason: 'handler_threw', error, responseStatus: error.status ?? 400 }).catch(() => {});
      return send(res, error.status ?? 400, { error: error.message, paymentCancelled: true });
    }
    const settlement = await paid.processSettlement(outcome.paymentPayload, outcome.paymentRequirements, outcome.declaredExtensions, { request: context, responseBody: output.body });
    if (!settlement.success) { log('settle-failed', settlement.errorReason); return sendInstructions(res, settlement.response); }
    // The facilitator reports Bazaar cataloging (success / processing / rejected + rejectedReason) per settlement.
    const bazaar = settlement.extensionResponses?.bazaar ?? null;
    if (bazaar) log('bazaar', JSON.stringify(bazaar));
    await record({ route: `${req.method} ${url.pathname}`, payer: settlement.payer ?? payer, amount: outcome.paymentRequirements.amount, transaction: settlement.transaction, network: settlement.network, bazaar });
    res.writeHead(200, { ...settlement.headers, 'Content-Type': output.contentType, 'Content-Length': output.body.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE' });
    res.end(output.body);
  }

  async function handleDemoRun(res) {
    if (!agent) return send(res, 503, { error: '서버에 데모 에이전트 키가 없어 브라우저 실행이 꺼져 있습니다. 아래 curl 예제로 직접 구매하세요.' });
    const nowMs = Date.now();
    runs.times = runs.times.filter(t => nowMs - t < 3600000);
    if (runs.inFlight) return send(res, 429, { error: '다른 데모 구매가 진행 중입니다. 잠시 후 다시 시도하세요.' });
    if (runs.times.length >= runs.perHour) return send(res, 429, { error: '시간당 데모 실행 한도에 도달했습니다.' });
    const funding = await agentFunding();
    if (funding && funding.funded !== true) return send(res, 409, { error: funding.funded === false ? `데모 에이전트 지갑에 테스트넷 USDC가 부족합니다 (잔액 ${funding.usdcBalance} USDC, 호출당 ${price} USDC). ${funding.address} 주소에 Base Sepolia USDC를 충전하세요.` : `에이전트 잔액을 확인하지 못했습니다: ${funding.error}`, funding });
    runs.inFlight = true; runs.times.push(nowMs);
    try {
      const run = await agent.purchase({ fetcher: options.agentFetcher ?? fetch });
      const tx = run.receipt?.settlement?.transaction;
      send(res, 200, { mode, testnet: mode !== 'mainnet', ...run, explorer: mode === 'testnet' && /^0x[0-9a-fA-F]{64}$/.test(tx ?? '') ? `${BASESCAN.testnet}${tx}` : null });
    } catch (error) { send(res, 500, { error: error.message }); }
    finally { runs.inFlight = false; }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', publicBaseUrl);
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, PAYMENT-SIGNATURE', 'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, PAYMENT-RESPONSE' }); return res.end(); }
      if (method === 'GET' && url.pathname === `${tool.path}/sample`) return await handlePaid(req, res, url, ctx => tool.runSample(ctx));
      if (method === tool.method && url.pathname === tool.path) return await handlePaid(req, res, url, ctx => tool.run(req, ctx));
      if (url.pathname === tool.path && method !== 'OPTIONS') return send(res, 405, { error: `Use ${tool.method} ${tool.path} with a JSON body, or GET ${tool.path}/sample`, exampleRequest: tool.exampleRequest ?? null }, { Allow: tool.method });
      if (method === 'GET' && url.pathname === '/product.json') { const bazaar = await bazaarStats(); return send(res, 200, bazaar?.indexed == null ? product : { ...product, verification: { ...product.verification, bazaarIndexed: bazaar.indexed === true } }, { 'Access-Control-Allow-Origin': '*' }); }
      if (method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, mode, network, testnet: mode !== 'mainnet' });
      if (method === 'GET' && url.pathname === '/demo/status') return send(res, 200, { mode, testnet: mode !== 'mainnet', network, product: { name: product.name, description: product.description, price, payTo, endpoint: `${publicBaseUrl}${tool.path}/sample`, mainEndpoint: `${tool.method} ${publicBaseUrl}${tool.path}`, exampleRequest: tool.exampleRequest ?? null, proxiedUpstream: !tool.builtin }, bazaar: await bazaarStats(), agent: agent ? { address: agent.address, budget: agent.budget(), funding: await agentFunding() } : null, purchases: { external: ledger.external, internal: ledger.internal, note: '서버 데모 에이전트와 등록된 내부 주소의 구매는 internal로 따로 셉니다.' }, recent: ledger.entries.slice(-10).map(e => ({ at: e.at, route: e.route, amount: e.amount, transaction: e.transaction, internal: e.internal, bazaar: e.bazaar ?? null, explorer: mode === 'testnet' && /^0x[0-9a-fA-F]{64}$/.test(e.transaction ?? '') ? `${BASESCAN.testnet}${e.transaction}` : mode === 'mainnet' && /^0x[0-9a-fA-F]{64}$/.test(e.transaction ?? '') ? `${BASESCAN.mainnet}${e.transaction}` : null })) });
      if (method === 'POST' && url.pathname === '/demo/run') return await handleDemoRun(res);
      const page = method === 'GET' || method === 'HEAD' ? PAGE_FILES.get(url.pathname) : undefined;
      if (page) {
        const body = await readFile(new URL(`./${page[0]}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': page[1].startsWith('image/') ? page[1] : `${page[1]}; charset=utf-8`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': page[1].startsWith('image/') ? 'public, max-age=31536000, immutable' : 'no-store', 'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        return res.end(method === 'HEAD' ? undefined : body);
      }
      send(res, 404, { error: 'Not found' });
    } catch (error) { log('request-failed', error.message); if (!res.headersSent) send(res, error.status ?? 500, { error: error.status ? error.message : 'Internal error' }); else res.end(); }
  });
  server.requestTimeout = 30000;
  const handle = (req, res) => server.emit('request', req, res);
  return { server, handle, paid, product, ledger, agent, facilitator, tool, async initialize() { await paid.initialize(); return this; }, listen(port, host) { return new Promise((resolve, reject) => server.once('error', reject).listen(port, host, () => resolve(server.address()))); }, close() { return new Promise(resolve => server.close(() => resolve())); } };
}
