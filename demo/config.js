// Shared environment parsing for `node demo/server.js` and the Vercel handler.
import { readFileSync } from 'node:fs';
import { productDraftToUpstream, upstreamTool } from './upstream.js';
import { ntsTool } from './tools/nts.js';

export function configFromEnv(env = process.env) {
  const mode = env.DEMO_MODE ?? 'local';
  let draft = null;
  if (env.PRODUCT_FILE) draft = productDraftToUpstream(JSON.parse(readFileSync(env.PRODUCT_FILE, 'utf8')), { secret: env.UPSTREAM_SECRET });
  const upstreamUrl = env.UPSTREAM_URL ?? draft?.url;
  // Product selection: a seller's upstream API, else our 국세청 status product when its key is set, else the built-in converter.
  const tool = upstreamUrl ? upstreamTool({ url: upstreamUrl, method: env.UPSTREAM_METHOD ?? draft?.method ?? 'POST', secret: env.UPSTREAM_SECRET, name: env.PRODUCT_NAME ?? draft?.name, description: env.PRODUCT_DESCRIPTION ?? draft?.description, exampleRequest: env.PRODUCT_EXAMPLE_REQUEST ? JSON.parse(env.PRODUCT_EXAMPLE_REQUEST) : draft?.exampleRequest, exampleResponse: env.PRODUCT_EXAMPLE_RESPONSE ? JSON.parse(env.PRODUCT_EXAMPLE_RESPONSE) : draft?.exampleResponse }) : env.NTS_SERVICE_KEY ? ntsTool({ serviceKey: env.NTS_SERVICE_KEY }) : undefined;
  return {
    mode, tool,
    price: env.PRODUCT_PRICE ?? draft?.price ?? '0.01',
    payTo: env.SELLER_PAY_TO ?? draft?.payTo ?? (mode === 'local' ? '0x1111111111111111111111111111111111111111' : undefined),
    facilitatorUrl: env.X402_FACILITATOR_URL,
    rpcUrl: mode === 'mainnet' ? env.BASE_MAINNET_RPC : env.BASE_SEPOLIA_RPC,
    agentKey: env.DEMO_AGENT_KEY,
    demoTotal: env.DEMO_TOTAL ?? '0.10',
    demoRunsPerHour: Number(env.DEMO_RUNS_PER_HOUR ?? 20),
    internalPayers: (env.INTERNAL_PAYERS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
