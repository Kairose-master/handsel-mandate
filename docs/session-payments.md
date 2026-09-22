# v0.4: Onchain payment reservations

The agent process holds only its own gas-paying EOA key. The human's existing Coinbase Smart Account holds USDC. A non-upgradeable `MandateValidator` is installed as one contract owner of that smart account. Its ERC-1271 callback approves only replay-safe hashes of explicitly reserved USDC EIP-3009 transfers. It exposes no arbitrary execution, upgrade, raw-hash approval, or owner-key signing method.

This is a narrow Coinbase contract-owner adapter, not a generic ERC-7579 module or general UserOperation session validator. The human retains full control through their original owner. Coinbase contract-owner behavior is tested against vendored upstream Solidity, not a wallet-shaped mock.

## Setup

1. Node 22+, `npm ci`. Clone and install BlockFlow at commit `a43efa3788115a16e12f0ebea22416ed61de053d`, with a clean working tree. Configure its absolute path.
2. Use an already deployed, human-owned Coinbase Smart Account on Base Sepolia. The v0.3 provisioning path may be used first, then remove its owner key and AA config completely from the agent runtime. Keep only test USDC in the smart account and test ETH in the human/agent EOAs for gas.
3. Copy `runtime/config.example.json` to `runtime/config.local.json`, fill `session.wallet`, HTTPS RPC, a fresh `session.agentPrivateKey`, approved endpoint and recipient. `chmod 600 runtime/config.local.json`. Do not add an owner key to this file. Install the native host using `node runtime/install-host.js HANDSEL_EXTENSION_ID`.
4. In a separate human-controlled terminal, provide the existing owner key as `OWNER_PRIVATE_KEY` through your secret manager/environment. Do not paste it into chat, the extension, repository, or shell history. Run `node scripts/owner.js install`. This deploys the validator and calls the smart account's `addOwnerAddress`. It checks validator bytecode and saves its address and owner index; a repeated install recovers a previously completed deployment.
5. In the extension, make a mandate draft. Creation compiles BlockFlow and binds its artifact hashes, account, validator, agent, endpoint, recipient, amount limits and expiry. This does not grant permission yet.
6. Run `node scripts/owner.js review`. Inspect recipient, agent, account, total/per-call micro-USDC, expiry and binding. Then run `node scripts/owner.js grant REVIEWED_BINDING`. The explicit binding must match; the CLI recompiles the workflow before the human owner grants authority via the smart account. Never expose this terminal/environment to the agent.
7. Buy through the paired agent or panel. Runtime reads the actual onchain grant. Each x402 authorization triggers an agent-signed `reserve` transaction; only after a successful receipt and wallet `isValidSignature` check is the x402 payload returned to the seller.
8. Use **온체인 결제 확인** to retry pending reconciliation. `chain-verified` requires a successful transaction in the canonical RPC block, at least two confirmations, an exact USDC Transfer and matching AuthorizationUsed nonce. RPC/provider trust and later reorg risk remain; two confirmations are not finality.
9. **권한 회수** stops local signing immediately and sends agent-authorized onchain revoke. If it times out/fails, local signing stays disabled but onchain revocation is unconfirmed: retry or use `node scripts/owner.js revoke REVIEWED_BINDING`. The human can also remove the validator owner through their wallet. Never refund a local reservation on this basis.

Maximum per grant: 1 test USDC, one hour. Smart account recipient, token, session agent, total budget, per-call limit, authorization expiry and one-use nonce are enforced onchain. A new grant requires the human owner; an agent cannot reset a grant by resetting local files. Multiple human-approved grants have separate budgets and therefore add together.

## Why a reservation transaction?

ERC-1271 signature verification is a view/static call; it cannot decrement a cumulative budget. `reserve` consumes the amount before a usable signature exists. It validates the full payment preimage and stores only its exact Coinbase replay-safe hash. `isValidSignature` reads that record, expiry and revocation, and verifies a canonical 65-byte ECDSA signature from the authorized agent over that replay-safe hash. Public reservation calldata alone cannot settle a payment. All reservations are irreversible, even if a seller never settles. USDC's nonce prevents the same authorization settling twice.

Confirmed revoke invalidates still-unsettled signatures through this validator. It cannot undo already settled transfers and can race settlement. Other smart-account owners can still spend; this constrains the delegated agent, not the human's root authority. The agent can burn its own ETH on gas or exhaust its approved USDC budget at the approved recipient. Gas is not included in the USDC cap.

## BlockFlow's exact role

The pinned clean compiler parses the fixed supported BPMN, validates structure/soundness, and emits IR, Solidity and Foundry tests. A SHA-256 binding covers artifacts and structured policy, then is used as the immutable grant ID and workflow commitment. `MandateValidator` is a separately implemented target for those policy fields. The generated workflow contract itself is not deployed. This does not prove arbitrary BPMN-to-wallet semantic equivalence. The onchain validator cannot enforce an HTTPS resource URL or the quality of delivered results; endpoint filtering remains local.

## Evidence and limits

Local EVM tests run the actual upstream Coinbase wallet runtime (initialized directly in fresh EVM storage), this validator and a clearly marked EIP-3009 USDC test double. They cover real x402 payload settlement, unauthorized execution/grants, wrong payer/payee/amount/time, total-budget exhaustion, duplicate nonce, revocation and expiry. This is not a test of the deployed Coinbase proxy/factory, a live bundler, Circle's deployed USDC, or a remote facilitator.

No public-chain deployment or transfer was performed for this change. Public Base Sepolia proof still requires funded test accounts, an installed module, a compatible seller/facilitator and transaction hashes. The custom validator has not received an independent security audit. No mainnet deployment is supported.

Source references: [Coinbase wallet](https://github.com/coinbase/smart-wallet), [x402 wallet compatibility](https://docs.x402.org/advanced-concepts/wallet-compatibility), [BlockFlow](https://github.com/Kairose-master/BlockFlow). The vendored source closure in `tests/fixtures/coinbase-sources.json` records the exact wallet commit and preserves upstream SPDX headers. `node scripts/vendor-wallet-fixture.js PATH_TO_UPSTREAM` regenerates it from upstream with its pinned submodules. `node scripts/compile-contracts.js` regenerates the validator deployment artifact.
