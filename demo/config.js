// Shared environment parsing for `node demo/server.js` and the Vercel handler.
import { readFileSync } from 'node:fs';
import { productDraftToUpstream, upstreamTool } from './upstream.js';

export function configFromEnv(env = process.env) {
  const mode = env.DEMO_MODE ?? 'local';
  let draft = null;
  if (env.PRODUCT_FILE) draft = productDraftToUpstream(JSON.parse(readFileSync(env.PRODUCT_FILE, 'utf8')), { secret: env.UPSTREAM_SECRET });
  const upstreamUrl = env.UPSTREAM_URL ?? draft?.url;
  const tool = upstreamUrl ? upstreamTool({ url: upstreamUrl, method: env.UPSTREAM_METHOD ?? draft?.method ?? 'POST', secret: env.UPSTREAM_SECRET, name: env.PRODUCT_NAME ?? draft?.name, description: env.PRODUCT_DESCRIPTION ?? draft?.description, exampleRequest: env.PRODUCT_EXAMPLE_REQUEST ? JSON.parse(env.PRODUCT_EXAMPLE_REQUEST) : draft?.exampleRequest, exampleResponse: env.PRODUCT_EXAMPLE_RESPONSE ? JSON.parse(env.PRODUCT_EXAMPLE_RESPONSE) : draft?.exampleResponse }) : undefined;
  return {
    mode, tool,
    price: env.PRODUCT_PRICE ?? draft?.price ?? '0.01',
    payTo: env.SELLER_PAY_TO ?? draft?.payTo ?? (mode === 'local' ? '0x1111111111111111111111111111111111111111' : undefined),
    facilitatorUrl: env.X402_FACILITATOR_URL,
    agentKey: env.DEMO_AGENT_KEY,
    demoTotal: env.DEMO_TOTAL ?? '0.10',
    demoRunsPerHour: Number(env.DEMO_RUNS_PER_HOUR ?? 20),
    internalPayers: (env.INTERNAL_PAYERS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  };
}
