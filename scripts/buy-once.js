#!/usr/bin/env node
// One explicit x402 purchase from a wallet you control, on whatever network the
// seller quotes (Base Sepolia or Base mainnet). Used to verify a live endpoint.
//   node scripts/buy-once.js <url> --key 0x<private key> [--max 0.01] [--mainnet] [--post '{"markdown":"..."}']
// Refuses mainnet quotes unless --mainnet is given, and any quote above --max.
import { x402Client } from '@x402/core/client';
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader, decodePaymentResponseHeader } from '@x402/core/http';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const key = opt('--key') ?? process.env.BUYER_PRIVATE_KEY;
const max = opt('--max') ?? '0.01';
const body = opt('--post');
const allowMainnet = args.includes('--mainnet');
if (!url || !/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) { console.error('usage: node scripts/buy-once.js <url> --key 0x<private key> [--max 0.01] [--mainnet] [--post <json>]'); process.exit(2); }
const EXPLORER = { 'eip155:84532': 'https://sepolia.basescan.org/tx/', 'eip155:8453': 'https://basescan.org/tx/' };
const USDC = { 'eip155:84532': '0x036cbd53842c5426634e7929541ec2318f3dcf7e', 'eip155:8453': '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' };
const account = privateKeyToAccount(key);
const init = body ? { method: 'POST', body, headers: { 'content-type': 'application/json' } } : { method: 'GET' };

const first = await fetch(url, init);
if (first.status !== 402) { console.error(`expected 402, got ${first.status}`); process.exit(1); }
const required = decodePaymentRequiredHeader(first.headers.get('PAYMENT-REQUIRED'));
const offer = required.accepts.find(a => a.scheme === 'exact' && USDC[a.network] && a.asset.toLowerCase() === USDC[a.network]);
if (!offer) { console.error('no exact USDC offer on Base Sepolia or Base mainnet'); process.exit(1); }
const maxMicro = BigInt(Math.round(Number(max) * 1e6));
console.log(`quote: ${Number(offer.amount) / 1e6} USDC on ${offer.network} → ${offer.payTo}  (payer ${account.address})`);
if (offer.network === 'eip155:8453' && !allowMainnet) { console.error('MAINNET quote: this would spend real USDC. Re-run with --mainnet to confirm.'); process.exit(3); }
if (BigInt(offer.amount) > maxMicro) { console.error(`quote ${offer.amount} µUSDC exceeds --max ${max} USDC; refusing`); process.exit(3); }

const client = new x402Client().register(offer.network, new ExactEvmScheme(account));
const payload = await client.createPaymentPayload({ ...required, accepts: [offer] });
const paid = await fetch(url, { ...init, headers: { ...init.headers, 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(payload) } });
const settlementHeader = paid.headers.get('PAYMENT-RESPONSE');
const settlement = settlementHeader ? decodePaymentResponseHeader(settlementHeader) : null;
const text = await paid.text();
console.log(`response: HTTP ${paid.status}`);
console.log(text.slice(0, 600));
if (settlement) console.log(`settlement: success=${settlement.success} tx=${settlement.transaction} ${EXPLORER[settlement.network] && /^0x[0-9a-fA-F]{64}$/.test(settlement.transaction) ? EXPLORER[settlement.network] + settlement.transaction : ''}`);
process.exit(paid.ok && settlement?.success ? 0 : 1);
