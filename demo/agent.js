// Demo buyer agent. It runs the existing Handsel buyer (runtime/buyer.js) with a
// plain testnet EOA key and an in-memory mandate, and reports each stage so the
// public demo can show: discover → budget check → pay → receive result.
//
// Not the AA/session path: no BlockFlow binding, no onchain MandateValidator, no
// DAMBI gate. The budget here is enforced by the buyer process only.
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { privateKeyToAccount } from 'viem/accounts';
import { buy, liveMandate, validateQuote } from '../runtime/buyer.js';

const usdc = micro => (Number(micro) / 1e6).toFixed(6).replace(/\.?0+$/, '');

export function createDemoAgent({ endpoint, payTo, privateKey, total = '0.10', perCall = '0.01', minutes = 60, now = Date.now }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '')) throw new Error('DEMO_AGENT_KEY must be a 32-byte hex private key (testnet only)');
  const config = { endpoint, payTo, privateKey };
  const address = privateKeyToAccount(privateKey).address;
  const state = { mandate: null, receipts: [] };
  function mandate() {
    const m = state.mandate;
    if (m && !m.revoked && now() < m.expiresAt) return m;
    state.mandate = { ...liveMandate({ total, perCall, minutes }, config, now()), mode: 'demo-eoa-testnet' };
    state.receipts = [];
    return state.mandate;
  }
  function budget() {
    const m = mandate();
    return { total: usdc(m.total), perCall: usdc(m.perCall), reserved: usdc(m.reserved), remaining: usdc(m.total - m.reserved), expiresAt: new Date(m.expiresAt).toISOString(), purchases: state.receipts.length };
  }
  async function purchase({ requestId = crypto.randomUUID(), fetcher = fetch } = {}) {
    const m = mandate();
    const steps = [];
    const step = (id, status, detail) => { steps.push({ id, status, at: now(), ...detail }); return steps.at(-1); };
    step('discover', 'ok', { endpoint, payTo, network: m.network });
    let calls = 0;
    const observed = async (url, options) => {
      calls++;
      const response = await fetcher(url, options);
      if (calls === 1) {
        const header = response.headers.get('PAYMENT-REQUIRED');
        if (response.status !== 402 || !header) { step('quote', 'failed', { httpStatus: response.status }); return response; }
        const required = decodePaymentRequiredHeader(header);
        const offer = required.accepts?.[0];
        step('quote', 'ok', { price: usdc(offer?.amount ?? 0), asset: offer?.asset, maxTimeoutSeconds: offer?.maxTimeoutSeconds });
        try { validateQuote(required, config, m, now()); step('budget', 'ok', { price: usdc(offer.amount), perCall: usdc(m.perCall), remaining: usdc(m.total - m.reserved) }); }
        catch (error) { step('budget', 'blocked', { reason: error.message, price: usdc(offer?.amount ?? 0), perCall: usdc(m.perCall), remaining: usdc(m.total - m.reserved) }); }
      } else if (options?.headers?.['PAYMENT-SIGNATURE']) {
        step('pay', response.ok ? 'ok' : 'failed', { httpStatus: response.status });
      }
      return response;
    };
    let receipt = null, error = null;
    try {
      receipt = await buy(config, state, { mandateId: m.id, requestId }, async () => {}, { fetcher: observed, verifyWorkflow: () => true });
    } catch (e) { error = e.message; }
    if (receipt?.status === 'seller-reported-settled') {
      let result = null; try { result = JSON.parse(receipt.result); } catch { result = receipt.result; }
      step('result', 'ok', { transaction: receipt.settlement?.transaction, network: receipt.settlement?.network, simulation: receipt.settlement?.extra?.simulation === true, result });
    } else if (receipt) {
      step('result', 'failed', { status: receipt.status, reason: receipt.error ?? receipt.result?.slice?.(0, 300) });
    } else if (!steps.some(s => s.id === 'budget' && s.status === 'blocked')) {
      step('result', 'failed', { reason: error });
    }
    return { requestId, agent: address, mandateId: m.id, network: m.network, steps, receipt, budget: budget(), error };
  }
  return { address, purchase, budget, mandate };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const endpoint = process.env.DEMO_ENDPOINT ?? 'http://127.0.0.1:4402/convert/sample';
  const payTo = process.env.SELLER_PAY_TO;
  const privateKey = process.env.DEMO_AGENT_KEY;
  if (!payTo || !privateKey) { console.error('Set SELLER_PAY_TO and DEMO_AGENT_KEY (testnet-only key). Optional: DEMO_ENDPOINT, DEMO_TOTAL, DEMO_PER_CALL.'); process.exit(2); }
  const agent = createDemoAgent({ endpoint, payTo, privateKey, total: process.env.DEMO_TOTAL ?? '0.10', perCall: process.env.DEMO_PER_CALL ?? '0.01' });
  const run = await agent.purchase();
  console.log(JSON.stringify(run, null, 2));
  process.exit(run.steps.at(-1)?.status === 'ok' ? 0 : 1);
}
