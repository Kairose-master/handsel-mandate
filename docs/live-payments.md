# Base Sepolia real x402 path

## Implemented vs verified

Implemented: extension → Chrome Native Messaging → BlockFlow compile/bind → deployed ERC-4337 Coinbase Smart Account → EIP-1271 compatibility probe → HTTP 402 → policy validation → durable budget reservation → real x402 SDK EIP-3009 signature → paid HTTP retry → response/settlement receipt.

Automated tests use generated disposable keys and a fake HTTP seller. They validate the real BlockFlow compiler output and policy binding, Coinbase Smart Account signature wrapping, AA payer placement in the actual x402 payload, chain/token/recipient/value, duplicate request behavior, and uncertain failure accounting. They do NOT settle funds onchain. No funded test smart account, bundler credential, or seller endpoint was available during implementation. Do not describe this as a confirmed onchain purchase until a transaction is independently checked.

## Setup (macOS/Linux, Google Chrome)

1. Install Node 22+ and run `npm ci` at this repository root. Clone `https://github.com/Kairose-master/BlockFlow`, check out commit `a43efa3788115a16e12f0ebea22416ed61de053d`, and run `pnpm install` in it.
2. Reload the `extension/` unpacked extension; it now requires `nativeMessaging` permission. Note its extension ID.
3. Run `node runtime/install-host.js YOUR_HANDSEL_EXTENSION_ID`. This installs a local Chrome host manifest and launcher. The manifest allows only that extension ID. Other Chromium browsers need their vendor-specific NativeMessagingHosts location; Windows is not supported by this installer.
4. Copy `runtime/config.example.json` to `runtime/config.local.json` **locally**. Fill in the BlockFlow absolute path, HTTPS RPC and ERC-4337 bundler URLs, x402 endpoint, seller address, and a fresh dedicated testnet AA owner key. Set mode `600`. Never paste the key into chat, browser UI, agent prompts, or git. This plaintext file is not a production key vault.
5. In the sidepanel, click **연결 상태 확인**, then **AA 계정 배포**. Without a paymaster, pre-fund the counterfactual AA address with Base Sepolia test ETH for its deployment UserOperation. With `usePaymaster: true`, the configured bundler must support integrated sponsorship.
6. Fund the deployed **smart-account address** with testnet USDC only. Network and asset are fixed to Base Sepolia (`eip155:84532`) and USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. The seller/facilitator must support deployed smart-account EIP-1271 signatures for exact/EIP-3009.
7. Fill total/per-call/minutes and click **BlockFlow 위임 활성화**. Creation probes the deployed account's `isValidSignature`, runs the pinned BlockFlow compiler, and binds the policy, AA address, BPMN, IR, Solidity, and compiler commit. Maximum 1 test USDC and 60 minutes.
8. Click **실제 x402 구매 요청**, or use the paired demo agent extension. The host rechecks the BlockFlow binding before obtaining and signing the quote.
9. A `seller-reported-settled` record is the seller's claim. Verify `settlement.transaction` on Base Sepolia and confirm the USDC transfer independently.

The host only performs GET on the configured endpoint. No arbitrary URL from the agent, no redirects, no POST payloads or automatic service discovery yet. Required token domain: USDC / 2; authorization timeout: 1–300 seconds and within mandate expiry. Other payment schemes fail closed.

## Security / failure semantics

- The payer is a real deployed ERC-4337 Coinbase Smart Account and x402 receives its wrapped EIP-1271 signature. The local owner key still has full control of that dedicated smart account; it is not a limited session key. Keep its balance at or below the intended test budget.
- BlockFlow validates and binds the workflow artifact, but the generated contract is not deployed and does not enforce spending onchain. Budget, recipient, expiry, and revocation are enforced by the Native Host.
- Host stores integer micro-USDC reservations before releasing signatures. Timeout, 4xx/5xx, malformed receipt and process interruption do not restore the budget: a signed authorization may settle later.
- Idempotent request retries return the stored receipt, never issue another signature. New IDs can buy again within the remaining budget.
- Local file lock excludes simultaneous hosts; a crashed process leaves `runtime/state.lock` and fails closed. Stop all hosts and reconcile pending payments before removing that lock. Never delete state to regain budget while authorizations are pending.
- Revoke stops future signing; already issued signatures remain valid until expiry/use. A purchase already running holds the lock, so revocation is not an instantaneous interrupt. Pairing a different agent requests revocation first.
- There is no escrow, quality assurance, chargeback, automatic refund, signing-key recovery or independent settlement reconciliation yet. No production use.
- Native messages use a paired extension identity, not web-page scripts. A compromised paired agent can exhaust the approved budget. The local OS/user remains trusted.

## Remaining security milestone

Move the compiled policy into a reviewed ERC-4337 validator/session-key module so the smart account itself enforces recipient, per-call/total budget, expiry, and revocation. Then independently reconcile each seller receipt against Base Sepolia RPC. Until both are complete, this is testnet-only.

References: https://docs.x402.org/getting-started/quickstart-for-buyers, https://docs.x402.org/advanced-concepts/wallet-compatibility, and https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging.
