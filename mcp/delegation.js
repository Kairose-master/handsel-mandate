// Experimental local profile for x402 #3693; not a standardized extension.
import { createPublicKey, verify } from 'node:crypto';
export const PROFILE = 'handsel.delegation.experimental.v1';

// Restricted JCS-compatible JSON domain: no floats, undefined or lone surrogates.
// Amounts/timestamps in authorization are decimal strings, never JS bigints.
export function canonical(value) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') {
    if (value.isWellFormed() === false) throw new Error('Invalid Unicode');
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, canonical).join(',') + ']';
  if (value && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => canonical(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('Unsupported canonical JSON value');
}
const address = x => typeof x === 'string' && /^0x[0-9a-fA-F]{40}$/.test(x);
const equalAddress = (a, b) => address(a) && address(b) && a.toLowerCase() === b.toLowerCase();
export function createGrant({ principal, keyId, required, offer, payload, agent, mandateExpiry, now = Date.now() }) {
  const a = payload?.payload?.authorization;
  if (!principal || !keyId || !equalAddress(a?.from, agent) || !equalAddress(a?.to, offer.payTo) || a?.value !== offer.amount || !/^0x[0-9a-fA-F]{64}$/.test(a?.nonce ?? '')) throw new Error('Delegation authorization mismatch');
  if (!/^[1-9]\d{0,12}$/.test(a.validBefore ?? '')) throw new Error('Invalid delegation expiry');
  const expiry = Number(a.validBefore);
  if (expiry <= Math.floor(now / 1000) || expiry * 1000 > mandateExpiry || expiry > Math.floor(now / 1000) + offer.maxTimeoutSeconds) throw new Error('Delegation expired or outside mandate/quote window');
  if (payload.x402Version !== 2 || canonical(payload.accepted) !== canonical(offer) || canonical(payload.resource) !== canonical(required.resource)) throw new Error('Delegation quote mismatch');
  // Exact spellings and all quote fields are covered, including extra/token domain.
  const grant = { profile: PROFILE, principal, keyId, agent: a.from, nonce: a.nonce, expiry, network: offer.network, asset: offer.asset, payTo: offer.payTo, amount: offer.amount, resource: required.resource, requirements: offer, authorization: a };
  return JSON.parse(canonical(grant));
}
export function signingInput(grant) {
  const header = { alg: 'EdDSA', kid: grant.keyId, typ: 'JWT' };
  return Buffer.from(Buffer.from(canonical(header)).toString('base64url') + '.' + Buffer.from(canonical(grant)).toString('base64url'), 'ascii');
}
export function verifyGrant(jws, expected, publicKey, now = Date.now()) {
  if (expected.expiry <= Math.floor(now / 1000)) throw new Error('Delegation expired');
  const prefix = signingInput(expected).toString();
  if (typeof jws !== 'string' || jws.length > 30000 || !jws.startsWith(prefix + '.')) throw new Error('Delegation grant tamper/binding mismatch');
  const encoded = jws.slice(prefix.length + 1);
  if (!/^[A-Za-z0-9_-]{86}$/.test(encoded)) throw new Error('Invalid delegation signature');
  const signature = Buffer.from(encoded, 'base64url');
  const key = createPublicKey(publicKey);
  if (signature.toString('base64url') !== encoded || key.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(prefix), key, signature)) throw new Error('Invalid delegation signature');
  return { profile: PROFILE, grant: jws };
}
export function createDelegationAdapter({ principal, keyId, publicKey, signer }) {
  if (typeof principal !== 'string' || !principal || typeof keyId !== 'string' || !keyId || typeof signer?.sign !== 'function') throw new Error('External principal signer and pinned identity required');
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Pinned Ed25519 key required');
  // Export fixed key material, not a mutable caller-owned JWK.
  const pinned = key.export({ type: 'spki', format: 'pem' });
  return {
    prepare: context => createGrant({ ...context, principal, keyId }),
    async sign(grant, now = Date.now) {
      const expected = JSON.parse(canonical(grant));
      const input = signingInput(expected);
      // signer returns only base64url Ed25519 signature bytes; no keys in this module.
      const signature = await signer.sign({ signingInput: Buffer.from(input), grant: structuredClone(expected) });
      return verifyGrant(input.toString() + '.' + signature, expected, pinned, now());
    },
  };
}
