#!/usr/bin/env node
// Public demo entry point. Local mode needs no keys; testnet mode needs a seller
// address, an https public URL and (for the browser-run agent) a testnet-only key.
import { createDemoServer } from './seller.js';
const env = process.env;
const mode = env.DEMO_MODE ?? 'local';
const port = Number(env.PORT ?? 4402);
const host = env.HOST ?? (mode === 'local' && !env.PUBLIC_BASE_URL ? '127.0.0.1' : '0.0.0.0');
const publicBaseUrl = env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${port}`;
let agentKey = env.DEMO_AGENT_KEY;
if (mode === 'local' && !agentKey) { const { generatePrivateKey } = await import('viem/accounts'); agentKey = generatePrivateKey(); }
const demo = createDemoServer({ mode, price: env.PRODUCT_PRICE ?? '0.01', payTo: env.SELLER_PAY_TO ?? (mode === 'local' ? '0x1111111111111111111111111111111111111111' : undefined), publicBaseUrl, facilitatorUrl: env.X402_FACILITATOR_URL, agentKey, demoTotal: env.DEMO_TOTAL ?? '0.10', demoRunsPerHour: Number(env.DEMO_RUNS_PER_HOUR ?? 20), internalPayers: (env.INTERNAL_PAYERS ?? '').split(',').map(s => s.trim()).filter(Boolean), ledgerPath: env.LEDGER_PATH ?? new URL('./ledger.local.jsonl', import.meta.url).pathname, log: (event, detail) => console.error(`[demo] ${event}: ${detail}`) });
await demo.initialize();
const address = await demo.listen(port, host);
console.log(`[demo] mode=${mode} network=eip155:84532 (Base Sepolia TESTNET) listening on ${host}:${address.port}`);
console.log(`[demo] public page: ${publicBaseUrl}/   paid endpoint: ${publicBaseUrl}/convert/sample   product: ${publicBaseUrl}/product.json`);
if (mode === 'local') console.log('[demo] local mode: signatures are verified in-process, nothing settles onchain.');
if (demo.agent) console.log(`[demo] browser-run agent ${demo.agent.address} (counted as internal), budget ${env.DEMO_TOTAL ?? '0.10'} USDC/hour`);
