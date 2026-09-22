// Vercel Node function: boots the demo server once per instance and hands every
// request to it. Counters, the local-mode nonce set and the demo budget live in
// instance memory; the JSONL ledger is disabled (read-only filesystem).
import { createDemoServer } from '../demo/seller.js';
import { configFromEnv } from '../demo/config.js';
let booting;
async function boot() {
  const env = process.env;
  const config = configFromEnv(env);
  const publicBaseUrl = env.PUBLIC_BASE_URL ?? `https://${env.VERCEL_PROJECT_PRODUCTION_URL ?? env.VERCEL_URL}`;
  if (config.mode === 'local' && !config.agentKey) { const { generatePrivateKey } = await import('viem/accounts'); config.agentKey = generatePrivateKey(); }
  let loopback = null;
  const demo = createDemoServer({ ...config, publicBaseUrl, ledgerPath: null, log: (event, detail) => console.error(`[demo] ${event}: ${detail}`),
    // The browser-run agent talks to this same instance over loopback so its
    // purchase is counted here, while the 402 quote still names the public URL.
    agentFetcher: (url, options) => fetch(loopback ? String(url).replace(publicBaseUrl, loopback) : url, options) });
  await demo.initialize();
  try { const { port } = await demo.listen(0, '127.0.0.1'); loopback = `http://127.0.0.1:${port}`; } catch (error) { console.error(`[demo] loopback listen failed, agent will use the public URL: ${error.message}`); }
  return demo;
}
export default async function handler(req, res) {
  const demo = await (booting ??= boot().catch(error => { booting = undefined; throw error; }));
  demo.handle(req, res);
}
