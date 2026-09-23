#!/usr/bin/env node
// Records the demo against a LOCAL testnet instance of the real product, so the
// browser-run purchase (disabled on the mainnet production page) is on camera.
// Needs: NTS_SERVICE_KEY, DEMO_AGENT_KEY (Base Sepolia USDC), SELLER_PAY_TO.
//   node scripts/record-harness.js [outDir] [--captions] [--outro "..."]
import { spawn } from 'node:child_process';
import { createDemoServer } from '../demo/seller.js';
import { configFromEnv } from '../demo/config.js';

const env = process.env;
const config = configFromEnv({ ...env, DEMO_MODE: 'testnet' });
if (!config.agentKey) { console.error('DEMO_AGENT_KEY (testnet wallet with Base Sepolia USDC) is required'); process.exit(2); }
const publicBaseUrl = env.PUBLIC_BASE_URL ?? 'https://handsel-mandate-demo.vercel.app';
let loopback = null;
const demo = createDemoServer({ ...config, publicBaseUrl, ledgerPath: null, log: (e, d) => console.error(`[harness] ${e}: ${d}`), agentFetcher: (url, o) => fetch(loopback ? String(url).replace(publicBaseUrl, loopback) : url, o) });
await demo.initialize();
const { port } = await demo.listen(0, '127.0.0.1');
loopback = `http://127.0.0.1:${port}`;
console.error(`[harness] testnet instance at ${loopback} selling "${demo.tool.name}"`);
const args = process.argv.slice(2);
const child = spawn(process.execPath, ['scripts/record-demo.js', `${loopback}/`, ...args], { stdio: 'inherit', env });
child.on('exit', async code => { await demo.close(); process.exit(code ?? 1); });
