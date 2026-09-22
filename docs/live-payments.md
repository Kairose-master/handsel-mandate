# Base Sepolia real x402 path

## Implemented vs verified

Implemented: extension → Chrome Native Messaging → local signer → HTTP 402 → policy validation → durable budget reservation → real x402 SDK EIP-3009 signature → paid HTTP retry → response/settlement receipt.

Automated tests use a generated disposable key and a fake HTTP seller. They cryptographically recover the actual SDK signature and validate the chain/token/recipient/value, duplicate request behavior, and uncertain failure accounting. They do NOT settle funds onchain. No funded test wallet or seller endpoint was available during implementation. Chrome UI/native-host installation still needs an end-to-end run on a user's machine. Do not describe this as a confirmed onchain purchase until a transaction is independently checked.

## Setup (macOS/Linux, Google Chrome)

1. Install Node 20+ and run `npm ci` at the repository root.
2. Reload the `extension/` unpacked extension; it now requires `nativeMessaging` permission. Note its extension ID.
3. Run `node runtime/install-host.js YOUR_HANDSEL_EXTENSION_ID`. This installs a local Chrome host manifest and launcher. The manifest allows only that extension ID. Other Chromium browsers need their vendor-specific NativeMessagingHosts location; Windows is not supported by this installer.
4. Copy `runtime/config.example.json` to `runtime/config.local.json` **locally**, fill in an HTTPS GET x402 v2 endpoint, approved seller address, and a dedicated Base Sepolia test-wallet private key. Set file permissions to owner-only (`chmod 600 runtime/config.local.json`). Never paste the key into a chat, browser panel, agent prompt or commit. This file, state and launcher are gitignored. It is plaintext on your machine, not a production key vault.
5. Fund that dedicated address with **testnet USDC only** using an appropriate faucet. Network is hardcoded to Base Sepolia (`eip155:84532`), USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. No mainnet funds. The seller must support exact/EIP-3009 and a facilitator that settles this testnet.
6. In the sidepanel, click **연결 / 수령 주소 확인**. Check endpoint, recipient and payer address. Fill the top form's total/per-call/minutes, then click **테스트넷 지출 위임 활성화** and confirm. Maximum 1 test USDC, 60 minutes. The mock tool checkboxes and goal text do not constrain live calls; the approved endpoint and recipient do.
7. Click **실제 x402 구매 요청**, or pair the included demo agent extension and select its live checkbox. The local host obtains the quote and enforces policy before signing.
8. Inspect receipt: a `seller-reported-settled` record is the seller's claim, not independent chain proof. Verify `settlement.transaction` on Base Sepolia and confirm USDC transfer before declaring end-to-end settlement complete.

The host only performs GET on the configured endpoint. No arbitrary URL from the agent, no redirects, no POST payloads or automatic service discovery yet. Required token domain: USDC / 2; authorization timeout: 1–300 seconds and within mandate expiry. Other payment schemes fail closed.

## Security / failure semantics

- Dedicated local EOA, NOT AA session-key delegation. The host process can access the whole test wallet. Keep it test-only.
- Host stores integer micro-USDC reservations before releasing signatures. Timeout, 4xx/5xx, malformed receipt and process interruption do not restore the budget: a signed authorization may settle later.
- Idempotent request retries return the stored receipt, never issue another signature. New IDs can buy again within the remaining budget.
- Local file lock excludes simultaneous hosts; a crashed process leaves `runtime/state.lock` and fails closed. Stop all hosts and reconcile pending payments before removing that lock. Never delete state to regain budget while authorizations are pending.
- Revoke stops future signing; already issued signatures remain valid until expiry/use. A purchase already running holds the lock, so revocation is not an instantaneous interrupt. Pairing a different agent requests revocation first.
- There is no escrow, quality assurance, chargeback, automatic refund, signing-key recovery or independent settlement reconciliation yet. No production use.
- Native messages use a paired extension identity, not web-page scripts. A compromised paired agent can exhaust the approved budget. The local OS/user remains trusted.

## BlockFlow follow-up

Integrate only after inspecting its actual compiler surface. Exporting a BPMN diagram is not sufficient to force a wallet to obey it. AA-compatible x402 signatures, a reviewed spending module and authenticated external-result checks are a separate milestone.

References: https://docs.x402.org/getting-started/quickstart-for-buyers and https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging.
