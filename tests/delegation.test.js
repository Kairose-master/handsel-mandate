import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generatePrivateKey } from 'viem/accounts';
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader } from '@x402/core/http';
import { createDelegationAdapter, createGrant, canonical, signingInput, verifyGrant, PROFILE } from '../mcp/delegation.js';
import { createWallet, NETWORKS } from '../mcp/wallet.js';
import { publicKey, signer } from './fixtures/delegation-signer.js';
const agent = '0x1111111111111111111111111111111111111111';
const payTo = '0x4444444444444444444444444444444444444444';
const network = 'eip155:84532', url = 'https://seller.example/x?q=1';
const offer = { scheme: 'exact', network, asset: NETWORKS[network].usdc, amount: '10000', payTo, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
const required = { x402Version: 2, resource: { url, description: 'Fixture' }, accepts: [offer], extensions: { bazaar: { info: {} }, delegation: { untrusted: true } } };
const config = { principal: 'fixture:principal', keyId: 'fixture:rfc8032', publicKey, signer };
const context = { principal: config.principal, keyId: config.keyId, required, offer, agent, now: 100000, mandateExpiry: 200000, payload: { x402Version: 2, accepted: offer, resource: required.resource, payload: { authorization: { from: agent, to: payTo, value: '10000', nonce: '0x' + 'ab'.repeat(32), validAfter: '0', validBefore: '160' } } } };

test('restricted canonical bytes and external fixture JWS are deterministic', async () => {
  assert.equal(canonical({ z: '한글', a: { y: '2', x: 1 } }), '{"a":{"x":1,"y":"2"},"z":"한글"}');
  for (const bad of [NaN, undefined, 1.1, -0, '\ud800', { a: undefined }]) assert.throws(() => canonical(bad));
  const grant = createGrant(context), adapter = createDelegationAdapter(config);
  const extension = await adapter.sign(grant, () => 100000);
  assert.equal(extension.profile, PROFILE);
  assert.deepEqual(verifyGrant(extension.grant, grant, publicKey, 100000), extension);
  assert.equal(extension.grant.split('.')[1], Buffer.from(canonical(grant)).toString('base64url'));
  assert.equal(signingInput(grant).toString(), extension.grant.slice(0, extension.grant.lastIndexOf('.')));
});

test('tampering every bound field, signature and expiry fails closed', async () => {
  const grant = createGrant(context);
  const extension = await createDelegationAdapter(config).sign(grant, () => 100000);
  for (const field of ['principal', 'keyId', 'agent', 'nonce', 'network', 'asset', 'payTo', 'amount', 'expiry', 'resource', 'requirements', 'authorization']) {
    const changed = structuredClone(grant); changed[field] = field === 'expiry' ? 159 : 'tampered';
    assert.throws(() => verifyGrant(extension.grant, changed, publicKey, 100000), /tamper/);
  }
  const parts = extension.grant.split('.'); parts[2] = 'A'.repeat(86);
  assert.throws(() => verifyGrant(parts.join('.'), grant, publicKey, 100000), /signature/);
  assert.throws(() => verifyGrant(extension.grant, grant, publicKey, 160000), /expired/);
  assert.throws(() => createGrant({ ...context, mandateExpiry: 159000 }), /window/);
  for (const field of ['network', 'asset', 'payTo', 'amount', 'maxTimeoutSeconds', 'extra']) {
    const changed = structuredClone(context); changed.offer = structuredClone(changed.offer); changed.offer[field] = field === 'maxTimeoutSeconds' ? 1 : 'changed';
    assert.throws(() => createGrant(changed));
  }
  for (const field of ['from', 'to', 'value', 'nonce', 'validBefore']) {
    const changed = structuredClone(context); changed.payload.payload.authorization[field] = 'invalid';
    assert.throws(() => createGrant(changed));
  }
  const changed = structuredClone(context); changed.required.resource = structuredClone(changed.required.resource); changed.required.resource.url += '&tampered=1';
  assert.throws(() => createGrant(changed), /quote/);
  await assert.rejects(() => createDelegationAdapter({ ...config, signer: { sign: async () => 'A'.repeat(86) } }).sign(grant, () => 100000), /signature/);
  assert.throws(() => createDelegationAdapter({ ...config, signer: null }), /signer/);
});

async function walletFixture(delegation, total = '0.01', overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'delegation-'));
  const statePath = path.join(dir, 'state.json');
  const sent = [];
  const options = { privateKey: generatePrivateKey(), network, statePath, delegation, fetcher: async (_url, init) => {
    if (!init.headers['PAYMENT-SIGNATURE']) return new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(required) } });
    sent.push(decodePaymentSignatureHeader(init.headers['PAYMENT-SIGNATURE']));
    throw new Error('uncertain fixture transport');
  } };
  Object.assign(options, overrides);
  const wallet = createWallet(options);
  await wallet.createMandate({ total, perCall: Number(total) < 0.01 ? total : '0.01' });
  return { wallet, sent, statePath, options };
}

test('opt-in preserves extensions, reserves durably before external signing and retains uncertain budget', async () => {
  let fixture;
  const adapter = createDelegationAdapter({ ...config, signer: { sign: async input => {
    const state = JSON.parse(await readFile(fixture.statePath));
    assert.equal(state.mandate.reserved, '10000');
    assert.equal(state.receipts[0].delegationNonce, input.grant.nonce);
    return signer.sign(input);
  } } });
  fixture = await walletFixture(adapter);
  const results = await Promise.allSettled([fixture.wallet.buy({ url, requestId: 'a' }), fixture.wallet.buy({ url, requestId: 'b' })]);
  assert.equal(results[0].value.status, 'uncertain');
  assert.match(results[1].reason.message, /remaining budget/);
  assert.equal(fixture.sent.length, 1);
  assert.ok(fixture.sent[0].extensions.bazaar);
  const jws = fixture.sent[0].extensions.delegation.grant;
  const grant = JSON.parse(Buffer.from(jws.split('.')[1], 'base64url'));
  assert.equal(grant.nonce, fixture.sent[0].payload.authorization.nonce);
  assert.equal(grant.expiry, Number(fixture.sent[0].payload.authorization.validBefore));
  verifyGrant(jws, grant, publicKey);
  assert.equal((await fixture.wallet.status()).remaining, '0');
  await fixture.wallet.buy({ url, requestId: 'a' });
  assert.equal(fixture.sent.length, 1, 'idempotent retry never pays twice');
  const restarted = createWallet(fixture.options);
  await assert.rejects(() => restarted.buy({ url, requestId: 'c' }), /remaining budget/);
});

test('single-use nonce is rejected concurrently and after restart', async () => {
  const real = createDelegationAdapter(config); let first;
  // Deliberately replay a captured grant at the trusted adapter boundary.
  const replay = { ...real, prepare: ctx => { const fresh = real.prepare(ctx); return first ??= fresh; } };
  const fixture = await walletFixture(replay, '0.03');
  const results = await Promise.all([fixture.wallet.buy({ url, requestId: 'a' }), fixture.wallet.buy({ url, requestId: 'b' })]);
  assert.equal(results[1].status, 'uncertain'); assert.match(results[1].error, /replay/);
  assert.equal(fixture.sent.length, 1);
  const restarted = createWallet(fixture.options);
  const third = await restarted.buy({ url, requestId: 'c' });
  assert.match(third.error, /replay/); assert.equal(fixture.sent.length, 1);
});

test('bad principal signature or expiry during signing never sends a payment', async () => {
  const bad = await walletFixture(createDelegationAdapter({ ...config, signer: { sign: async () => 'A'.repeat(86) } }));
  const receipt = await bad.wallet.buy({ url });
  assert.match(receipt.error, /signature/); assert.equal(bad.sent.length, 0);
  assert.equal((await bad.wallet.status()).remaining, '0');
  let clock = Date.now();
  const expired = await walletFixture(createDelegationAdapter({ ...config, signer: { sign: async input => { clock = input.grant.expiry * 1000; return signer.sign(input); } } }), '0.01', { now: () => clock });
  assert.match((await expired.wallet.buy({ url })).error, /expired/); assert.equal(expired.sent.length, 0);
});

test('disabled mode sends no delegation and existing local restrictions still apply', async () => {
  const fixture = await walletFixture(null);
  await fixture.wallet.buy({ url });
  assert.equal(fixture.sent[0].extensions?.delegation, undefined);
  assert.ok(fixture.sent[0].extensions.bazaar);
  const blocked = await walletFixture(createDelegationAdapter(config), '0.005');
  await assert.rejects(() => blocked.wallet.buy({ url }), /per-call/);
  assert.equal(blocked.sent.length, 0);
});

test('corrupt state does not reset budget or replay history', async () => {
  const fixture = await walletFixture(null);
  await writeFile(fixture.statePath, '{bad json');
  const restarted = createWallet(fixture.options);
  await assert.rejects(() => restarted.createMandate({ total: '1' }), SyntaxError);
  await assert.rejects(() => restarted.buy({ url }), SyntaxError);
  assert.equal(fixture.sent.length, 0);
});
