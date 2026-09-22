# Integration boundaries

## BlockFlow

BlockFlow remains an independent repository. This adapter pins commit `a43efa3788115a16e12f0ebea22416ed61de053d` and invokes its real BPMN parser, structure validator, soundness checker, Solidity generator, and Foundry-test generator. A different commit or any compile failure stops mandate creation.

The adapter binds the human-approved policy fields and AA address to SHA-256 hashes of the BPMN, IR, Solidity, and compiler commit. Every purchase recomputes this binding before requesting a quote. The generated contract is not deployed in v0.3, so this proves artifact integrity rather than onchain enforcement.

A workflow state machine alone does not enforce wallet spending. A reviewed wallet module or payment adapter must make bypassing policy impossible. Specify atomic budget reservation for parallel requests, settlement, failure, expiry and pending authorization revocation. Cancellation cannot reverse payments already settled.

## x402

The live buyer implements x402 v2 exact/EIP-3009 on Base Sepolia USDC. It rejects other chains, tokens, recipients, endpoints, token domains, schemes, redirects, and authorization windows. Bazaar discovery remains unimplemented; live access is deliberately restricted to one configured HTTPS endpoint and recipient.

The payer is a deployed Coinbase Smart Account (ERC-4337). The client produces the account's wrapped signature and creation probes EIP-1271 `isValidSignature` onchain before enabling a mandate. This is not a scoped session key: the Native Host holds a dedicated full owner key, so the account must stay test-only and balance-capped.

Bind approvals to chain ID, token contract, recipient, maximum amount, request identity and expiry. Maintain one authoritative ledger for spent + reserved amounts. Do not trust seller descriptions/categories as authorization. Pin approved merchant identities and endpoints; bind them to payment destinations. Reject redirects and changed quotes unless revalidated.

Most importantly, prepayment is not escrow. Response validation does not provide an automatic refund or prevent paying for poor results. Refund/escrow requires compatible seller terms and settlement support. JSON Schema validation proves shape, not truth or quality.

## Browser agents

The included example is a deterministic extension, not an LLM. Add vendor-specific adapters only through documented APIs. Do not scrape private browser agent interfaces. Seller text and tool output are untrusted data; they must never change a mandate or grant permissions. Never expose owner keys to an agent or page.

The Native Messaging bridge is restricted to the Handsel extension ID; the extension separately pairs one agent-extension ID. Browser shutdown and dropped replies use durable reservations and fail-closed accounting, but settlement reconciliation is still missing.

## Threat model

Protected in this prototype: external extension sender allowlist, human-only mandate mutations and AA deployment, fixed live endpoint/recipient/network/token, integer limits, expiry/revocation, serialized writes, duplicate request IDs, BlockFlow commit pinning/artifact binding, deployed-account and EIP-1271 checks.

Not protected: malicious local user, compromised OS/browser/profile/native host/paired agent, extension or npm supply chain, local state tampering, quota exhaustion, and owner-key extraction. A compromised paired agent can exhaust the approved live budget; a compromised owner key can control the whole dedicated AA account.

Before production funds: deploy a reviewed validator/session-key module that enforces the compiled policy in the account itself; add independent RPC settlement reconciliation, key isolation/recovery, replay/race and prompt-injection tests, pending-authorization semantics, and operational/regulatory review. Mainnet remains disabled.
