#!/usr/bin/env node
// 402-LAB MCP server: a human delegates a budget ("$1 안에서"), the agent
// discovers x402 products, pays inside that budget and returns the result.
//   node mcp/server.js            # stdio (Claude Desktop, Cursor, Aside, any MCP host)
//   node mcp/server.js --http 4402 # Streamable HTTP on 127.0.0.1 for browser extensions
// Env: BUYER_PRIVATE_KEY (required), NETWORK (eip155:84532 default | eip155:8453),
//      MANDATE_MAX_USDC (1), MANDATE_MAX_MINUTES (60), CATALOG_URLS (comma-separated product.json),
//      BAZAAR=1 to also search the x402 Bazaar, X402_FACILITATOR_URL, STATE_PATH, MCP_TOKEN (http mode).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { createWallet, NETWORKS, usdc } from './wallet.js';
import { createCatalog } from './catalog.js';

export function buildServer(env = process.env, deps = {}) {
  const network = env.NETWORK ?? 'eip155:84532';
  const wallet = deps.wallet ?? createWallet({ privateKey: env.BUYER_PRIVATE_KEY, network, statePath: env.STATE_PATH ?? new URL('./state.local.json', import.meta.url).pathname, maxMandateUsdc: env.MANDATE_MAX_USDC ?? '1', maxMinutes: Number(env.MANDATE_MAX_MINUTES ?? 60) });
  const catalog = deps.catalog ?? createCatalog({ network, catalogUrls: (env.CATALOG_URLS ?? 'https://handsel-mandate-demo.vercel.app/product.json').split(',').map(s => s.trim()).filter(Boolean), bazaar: env.BAZAAR === '1', facilitatorUrl: env.X402_FACILITATOR_URL });
  const net = NETWORKS[network];
  // One McpServer per transport; the wallet/catalog behind it are shared.
  function makeServer() {
  const server = new McpServer({ name: '402-lab', version: '0.1.0' }, { instructions: `You buy x402-paid tools on ${net.name} for the human, strictly inside the budget they delegated. Flow: mandate_status → (if none) ask the human for a budget and call mandate_create → discover → buy → return only the result. Never create a mandate the human did not ask for. Every buy spends ${net.testnet ? 'testnet' : 'REAL'} USDC and is not refundable.` });
  const text = value => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });
  const fail = error => ({ isError: true, content: [{ type: 'text', text: error.message }] });

  server.registerTool('mandate_status', { title: '위임 상태', description: 'Current delegated budget: total, per-call limit, remaining, expiry. Call this first.' }, async () => text({ buyer: wallet.address, network, networkName: net.name, testnet: net.testnet, mandate: await wallet.status() }));
  server.registerTool('mandate_create', { title: '예산 위임', description: `Create the budget the human just delegated in natural language (e.g. "1달러 안에서"). Only call this when the human explicitly stated an amount. Hard ceiling set by the human in server config; one active mandate at a time.`, inputSchema: { total_usdc: z.string().describe('Total budget in USDC, e.g. "1" or "0.50"'), per_call_usdc: z.string().optional().describe('Max per purchase in USDC; defaults to the total'), minutes: z.number().int().min(1).max(1440).optional().describe('Validity in minutes (default 60)'), allowed_sellers: z.array(z.string()).optional().describe('Optional payTo allowlist') } }, async ({ total_usdc, per_call_usdc, minutes, allowed_sellers }) => { try { return text(await wallet.createMandate({ total: total_usdc, perCall: per_call_usdc, minutes, allowedSellers: allowed_sellers })); } catch (e) { return fail(e); } });
  server.registerTool('mandate_revoke', { title: '위임 회수', description: 'Stop all further spending under the current mandate. Already-signed payments may still settle.' }, async () => text(await wallet.revoke()));
  server.registerTool('discover', { title: '상품 찾기', description: `Find x402-paid tools matching a task on ${net.name}. Returns url, method, price (USDC per call), example input/output. Prefer the cheapest item that fits; never buy anything not returned here.`, inputSchema: { query: z.string().describe('What the human needs, e.g. "markdown 표를 JSON으로"'), limit: z.number().int().min(1).max(25).optional() } }, async ({ query, limit }) => text(await catalog.discover(query, { limit })));
  server.registerTool('buy', { title: '구매', description: `Pay one x402 quote inside the mandate and return the tool output. Refuses anything over the per-call limit or remaining budget, other networks, or sellers outside the allowlist. Spends ${net.testnet ? 'testnet' : 'REAL'} USDC.`, inputSchema: { url: z.string().url().describe('Product URL from discover'), method: z.enum(['GET', 'POST']).optional(), input: z.record(z.string(), z.unknown()).optional().describe('JSON body for POST tools'), request_id: z.string().regex(/^[\w-]{1,100}$/).optional().describe('Idempotency key; reuse to retry without paying twice') } }, async ({ url, method, input, request_id }) => {
    try {
      const r = await wallet.buy({ url, method, body: input, requestId: request_id });
      let result = r.result; try { result = JSON.parse(r.result); } catch {}
      return text({ status: r.status, paid: `${r.amount} USDC`, payTo: r.payTo, transaction: r.transaction ?? null, explorer: r.explorer, httpStatus: r.httpStatus, error: r.error ?? null, result, mandate: await wallet.status() });
    } catch (e) { return fail(e); }
  });
  server.registerTool('receipts', { title: '영수증', description: 'All purchases under the current wallet with settlement transactions.' }, async () => text(await wallet.receipts()));
  return server;
  }
  return { server: makeServer(), makeServer, wallet, catalog, network };
}

export async function startHttp({ makeServer }, { port = 4402, host = '127.0.0.1', token = process.env.MCP_TOKEN ?? randomBytes(24).toString('hex') } = {}) {
  const http = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const cors = origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS' } : {};
    if (req.method === 'OPTIONS') { res.writeHead(cors['Access-Control-Allow-Origin'] ? 204 : 403, cors); return res.end(); }
    // Only extensions (or non-browser clients with no Origin) may talk to the wallet; web pages never.
    if (origin && !cors['Access-Control-Allow-Origin']) { res.writeHead(403); return res.end('Origin not allowed'); }
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host ?? '')) { res.writeHead(421); return res.end('Bad host'); }
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401, cors); return res.end('Bearer token required'); }
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/mcp') { res.writeHead(404, cors); return res.end(); }
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    // Stateless transport: a fresh server+transport pair per request, sharing the same wallet.
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    try { await server.connect(transport); await transport.handleRequest(req, res); }
    catch (error) { console.error('[402-lab] request failed:', error.message); if (!res.headersSent) { res.writeHead(500, cors); res.end(); } }
  });
  await new Promise((resolve, reject) => http.once('error', reject).listen(port, host, resolve));
  return { http, token, url: `http://${host}:${http.address().port}/mcp`, close: () => new Promise(r => http.close(r)) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const built = buildServer();
  const i = process.argv.indexOf('--http');
  if (i >= 0) {
    const { url, token } = await startHttp(built, { port: Number(process.argv[i + 1] ?? 4402) });
    console.error(`[402-lab] MCP over HTTP at ${url}\n[402-lab] Authorization: Bearer ${token}\n[402-lab] buyer ${built.wallet.address} on ${NETWORKS[built.network].name}`);
  } else {
    await built.server.connect(new StdioServerTransport());
    console.error(`[402-lab] MCP over stdio · buyer ${built.wallet.address} on ${NETWORKS[built.network].name}`);
  }
}
