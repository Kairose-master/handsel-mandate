#!/usr/bin/env node
// Public demo entry point. Local mode needs no keys; testnet mode needs a seller
// address, an https public URL and (for the browser-run agent) a testnet-only key.
// Set UPSTREAM_URL (or PRODUCT_FILE from Seller Studio) + UPSTREAM_SECRET to sell
// your own API instead of the built-in converter.
import { createDemoServer } from './seller.js';
import { configFromEnv } from './config.js';
const env = process.env;
const config = configFromEnv(env);
const port = Number(env.PORT ?? 4402);
const host = env.HOST ?? (config.mode === 'local' && !env.PUBLIC_BASE_URL ? '127.0.0.1' : '0.0.0.0');
const publicBaseUrl = env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;
if (config.mode === 'local' && !config.agentKey) { const { generatePrivateKey } = await import('viem/accounts'); config.agentKey = generatePrivateKey(); }
const demo = createDemoServer({ ...config, publicBaseUrl, ledgerPath: env.LEDGER_PATH ?? new URL('./ledger.local.jsonl', import.meta.url).pathname, log: (event, detail) => console.error(`[demo] ${event}: ${detail}`) });
await demo.initialize();
const address = await demo.listen(port, host);
console.log(`[demo] mode=${config.mode} network=eip155:84532 (Base Sepolia TESTNET) listening on ${host}:${address.port}`);
console.log(`[demo] selling: ${demo.tool.name}${demo.tool.builtin ? ' (built-in)' : ` → upstream ${demo.tool.upstream}`}`);
console.log(`[demo] public page: ${publicBaseUrl}/   paid endpoint: ${publicBaseUrl}${demo.tool.path}/sample   product: ${publicBaseUrl}/product.json`);
if (config.mode === 'local') console.log('[demo] local mode: signatures are verified in-process, nothing settles onchain.');
if (demo.agent) console.log(`[demo] browser-run agent ${demo.agent.address} (counted as internal), budget ${config.demoTotal} USDC/hour`);
