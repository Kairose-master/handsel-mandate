// Budget-enforced x402 buyer for the 402-LAB MCP server.
// A human sets a mandate (total, per-call, expiry, optional seller allowlist);
// the agent can only spend inside it. Budget is reserved BEFORE a signature
// leaves this process and reservations are never refunded (a signed
// authorization may settle later), mirroring runtime/buyer.js semantics.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

export const NETWORKS = {
  'eip155:84532': { name: 'Base Sepolia (testnet)', usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e', explorer: 'https://sepolia.basescan.org/tx/', testnet: true },
  'eip155:8453': { name: 'Base (mainnet)', usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', explorer: 'https://basescan.org/tx/', testnet: false },
};
const MAX_BODY = 1024 * 1024;
export function micro(value) {
  const text = String(value ?? '').trim();
  if (!/^(0|[1-9]\d{0,5})(\.\d{1,6})?$/.test(text)) throw new Error(`Invalid USDC amount: ${text}`);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export const usdc = m => (Number(m) / 1e6).toFixed(6).replace(/\.?0+$/, '') || '0';
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

async function limitedText(response) {
  const reader = response.body?.getReader(); if (!reader) return '';
  const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BODY) { await reader.cancel(); throw new Error('Response too large'); } chunks.push(Buffer.from(value)); }
  return Buffer.concat(chunks).toString('utf8');
}

export function createWallet({ privateKey, network, statePath, maxMandateUsdc = '1', maxMinutes = 60, fetcher = fetch, now = Date.now }) {
  const net = NETWORKS[network];
  if (!net) throw new Error(`Unsupported network ${network}; use eip155:84532 or eip155:8453`);
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? '')) throw new Error('BUYER_PRIVATE_KEY must be a 32-byte hex key');
  const account = privateKeyToAccount(privateKey);
  const ceiling = micro(maxMandateUsdc);
  let state = null, queue = Promise.resolve();
  async function load() {
    if (state) return state;
    try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch { state = { mandate: null, receipts: [] }; }
    return state;
  }
  async function save() {
    await mkdir(dirname(statePath), { recursive: true });
    const temp = `${statePath}.tmp`;
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, statePath);
  }
  const serial = fn => (queue = queue.then(fn, fn));
  const active = m => m && !m.revoked && now() < m.expiresAt;

  function view(m) {
    if (!m) return null;
    return { id: m.id, network, status: m.revoked ? 'revoked' : now() >= m.expiresAt ? 'expired' : 'active', total: usdc(m.total), perCall: usdc(m.perCall), reserved: usdc(m.reserved), remaining: usdc(BigInt(m.total) - BigInt(m.reserved)), expiresAt: new Date(m.expiresAt).toISOString(), allowedSellers: m.allowedSellers ?? [], purchases: m.purchases ?? 0 };
  }

  // Validate a 402 quote against the mandate without side effects.
  function check(required, url, m) {
    if (!active(m)) throw new Error('No active mandate');
    if (required?.x402Version !== 2) throw new Error('Seller does not speak x402 v2');
    if (required.resource?.url !== url) throw new Error(`Quote is for ${required.resource?.url}, not ${url}`);
    const offer = required.accepts?.find(a => a.scheme === 'exact' && a.network === network && same(a.asset, net.usdc));
    if (!offer) throw new Error(`No exact USDC offer on ${net.name}; refusing other networks or assets`);
    if (!/^[1-9]\d{0,12}$/.test(offer.amount)) throw new Error('Invalid quote amount');
    if (offer.extra?.name !== 'USDC' || offer.extra?.version !== '2') throw new Error('Unexpected token domain');
    if (!Number.isInteger(offer.maxTimeoutSeconds) || offer.maxTimeoutSeconds < 1 || offer.maxTimeoutSeconds > 300) throw new Error('Authorization window outside 1–300 seconds');
    if (now() + offer.maxTimeoutSeconds * 1000 > m.expiresAt) throw new Error('Authorization would outlive the mandate');
    if (m.allowedSellers?.length && !m.allowedSellers.some(s => same(s, offer.payTo))) throw new Error(`Seller ${offer.payTo} is not in the mandate allowlist`);
    const amount = BigInt(offer.amount);
    if (amount > BigInt(m.perCall)) throw new Error(`Price ${usdc(amount)} USDC exceeds the per-call limit ${usdc(m.perCall)} USDC`);
    if (BigInt(m.reserved) + amount > BigInt(m.total)) throw new Error(`Price ${usdc(amount)} USDC exceeds the remaining budget ${usdc(BigInt(m.total) - BigInt(m.reserved))} USDC`);
    return offer;
  }

  return {
    address: account.address, network, networkInfo: net, check,
    createMandate: ({ total, perCall, minutes, allowedSellers = [] }) => serial(async () => {
      await load();
      if (active(state.mandate)) throw new Error('An active mandate already exists; revoke it first');
      const t = micro(total), p = micro(perCall ?? total), min = Number(minutes ?? 60);
      if (t <= 0n || p <= 0n || p > t) throw new Error('per-call limit must be positive and not exceed the total');
      if (t > ceiling) throw new Error(`Total ${usdc(t)} USDC exceeds the human-set ceiling of ${usdc(ceiling)} USDC (MANDATE_MAX_USDC)`);
      if (!Number.isInteger(min) || min < 1 || min > maxMinutes) throw new Error(`minutes must be 1–${maxMinutes}`);
      for (const s of allowedSellers) if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`Invalid seller address ${s}`);
      state.mandate = { id: crypto.randomUUID(), total: t.toString(), perCall: p.toString(), reserved: '0', expiresAt: now() + min * 60000, revoked: false, allowedSellers, purchases: 0, createdAt: now() };
      await save(); return view(state.mandate);
    }),
    revoke: () => serial(async () => { await load(); if (state.mandate) { state.mandate.revoked = true; await save(); } return view(state.mandate); }),
    status: async () => { await load(); return view(state.mandate); },
    receipts: async () => { await load(); return state.receipts.map(r => ({ ...r, explorer: /^0x[0-9a-fA-F]{64}$/.test(r.transaction ?? '') ? net.explorer + r.transaction : null })); },
    buy: ({ url, method = 'GET', body, requestId = crypto.randomUUID() }) => serial(async () => {
      await load();
      const m = state.mandate;
      if (!active(m)) throw new Error('No active mandate; ask the human to delegate a budget first');
      if (!/^[\w-]{1,100}$/.test(requestId)) throw new Error('Invalid request id');
      const old = state.receipts.find(r => r.requestId === requestId && r.mandateId === m.id); if (old) return old;
      let target; try { target = new URL(url); } catch { throw new Error('Invalid product URL'); }
      if (target.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('Only https product URLs are allowed');
      method = String(method).toUpperCase();
      if (!['GET', 'POST'].includes(method)) throw new Error('method must be GET or POST');
      const init = { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: {} };
      if (method === 'POST') { init.body = typeof body === 'string' ? body : JSON.stringify(body ?? {}); init.headers['content-type'] = 'application/json'; }
      const first = await fetcher(url, init);
      if (first.status !== 402) { await first.body?.cancel(); throw new Error(`Expected HTTP 402, got ${first.status}; nothing was signed`); }
      const header = first.headers.get('PAYMENT-REQUIRED'); await first.body?.cancel();
      if (!header || header.length > 20000) throw new Error('Missing PAYMENT-REQUIRED header');
      const required = decodePaymentRequiredHeader(header);
      const offer = check(required, url, m);
      const receipt = { requestId, mandateId: m.id, url, method, amount: usdc(offer.amount), amountMicro: offer.amount, payTo: offer.payTo, network, status: 'reserved', at: new Date(now()).toISOString() };
      m.reserved = (BigInt(m.reserved) + BigInt(offer.amount)).toString(); m.purchases = (m.purchases ?? 0) + 1;
      state.receipts.push(receipt); await save();
      try {
        const client = new x402Client().register(network, new ExactEvmScheme(account));
        const payload = await client.createPaymentPayload({ ...required, accepts: [offer], extensions: undefined });
        const paid = await fetcher(url, { ...init, signal: AbortSignal.timeout(30000), headers: { ...init.headers, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } });
        receipt.httpStatus = paid.status;
        const settlementHeader = paid.headers.get('PAYMENT-RESPONSE');
        if (settlementHeader && settlementHeader.length < 20000) { const s = decodePaymentResponseHeader(settlementHeader); receipt.settlement = { success: s.success, transaction: s.transaction, network: s.network }; receipt.transaction = s.transaction; }
        receipt.contentType = paid.headers.get('content-type') ?? '';
        receipt.result = await limitedText(paid);
        receipt.status = paid.ok && receipt.settlement?.success === true ? 'seller-reported-settled' : 'uncertain';
      } catch (error) { receipt.status = 'uncertain'; receipt.error = error.message; }
      await save();
      return { ...receipt, explorer: /^0x[0-9a-fA-F]{64}$/.test(receipt.transaction ?? '') ? net.explorer + receipt.transaction : null };
    }),
  };
}
