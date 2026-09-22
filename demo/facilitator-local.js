// In-process FacilitatorClient double for the no-chain demo mode. It verifies the
// real EIP-3009 typed-data signature that the x402 SDK produced, but it never
// settles anything onchain. Every response it returns is labelled as a simulation.
import { recoverTypedDataAddress } from 'viem';

export const NETWORK = 'eip155:84532';
export const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
const TYPES = { TransferWithAuthorization: [{ name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' }] };
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const invalid = (invalidReason, payer) => ({ isValid: false, invalidReason, invalidMessage: invalidReason, payer });

export class LocalSimulationFacilitator {
  constructor({ now = () => Date.now() } = {}) { this.now = now; this.usedNonces = new Set(); this.settled = []; }
  async getSupported() { return { kinds: [{ x402Version: 2, scheme: 'exact', network: NETWORK }], extensions: [], signers: {} }; }
  async verify(paymentPayload, requirements) {
    const a = paymentPayload?.payload?.authorization, signature = paymentPayload?.payload?.signature;
    if (paymentPayload?.x402Version !== 2 || !a || typeof signature !== 'string') return invalid('malformed_payload');
    const accepted = paymentPayload.accepted;
    if (accepted?.scheme !== 'exact' || accepted.network !== NETWORK || requirements.scheme !== 'exact' || requirements.network !== NETWORK) return invalid('unsupported_scheme');
    if (!same(accepted.asset, USDC) || !same(requirements.asset, USDC)) return invalid('unsupported_asset');
    if (!same(a.to, requirements.payTo) || !same(accepted.payTo, requirements.payTo)) return invalid('invalid_exact_evm_payload_recipient_mismatch');
    if (!/^[1-9]\d{0,20}$/.test(String(a.value)) || BigInt(a.value) !== BigInt(requirements.amount)) return invalid('invalid_exact_evm_payload_authorization_value');
    const now = BigInt(Math.floor(this.now() / 1000));
    if (BigInt(a.validAfter) > now) return invalid('invalid_exact_evm_payload_authorization_valid_after');
    if (BigInt(a.validBefore) <= now) return invalid('invalid_exact_evm_payload_authorization_valid_before');
    if (!/^0x[0-9a-fA-F]{64}$/.test(a.nonce ?? '')) return invalid('invalid_exact_evm_payload_nonce');
    if (this.usedNonces.has(a.nonce.toLowerCase())) return invalid('invalid_exact_evm_payload_nonce_reused');
    let recovered;
    try {
      recovered = await recoverTypedDataAddress({ domain: { name: String(requirements.extra?.name ?? 'USDC'), version: String(requirements.extra?.version ?? '2'), chainId: 84532, verifyingContract: USDC }, types: TYPES, primaryType: 'TransferWithAuthorization', message: { from: a.from, to: a.to, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce }, signature });
    } catch { return invalid('invalid_exact_evm_payload_signature'); }
    if (!same(recovered, a.from)) return invalid('invalid_exact_evm_payload_signature', a.from);
    return { isValid: true, payer: a.from };
  }
  async settle(paymentPayload, requirements) {
    const check = await this.verify(paymentPayload, requirements);
    if (!check.isValid) return { success: false, errorReason: check.invalidReason, transaction: '', network: NETWORK, payer: check.payer };
    const a = paymentPayload.payload.authorization;
    this.usedNonces.add(a.nonce.toLowerCase());
    const record = { transaction: `local-simulation:${a.nonce.slice(2, 18)}`, payer: a.from, amount: String(a.value), at: this.now() };
    this.settled.push(record);
    // No chain, no USDC moved: the transaction id is a local marker, not a hash.
    return { success: true, transaction: record.transaction, network: NETWORK, payer: a.from, extra: { simulation: true, onchain: false } };
  }
}
