// Public RFC 8032 test vector 1. TEST ONLY; never an account/user key.
import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
const key = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60', 'hex'), format: 'der', type: 'pkcs8' });
export const publicKey = createPublicKey(key).export({ type: 'spki', format: 'pem' });
export const signer = { sign: async ({ signingInput }) => sign(null, signingInput, key).toString('base64url') };
