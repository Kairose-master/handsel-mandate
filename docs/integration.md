# Integration boundaries / not implemented

## BlockFlow

Keep BlockFlow independent. Its repository and current supported BPMN subset have NOT been inspected for this prototype. Do not claim compilation or generated-contract enforcement. Pin a reviewed upstream commit only after verifying the source and license.

Proposed adapter input: structured human-approved mandate. Output: supported BPMN/IR plus a validation report. Unsupported constructs must fail closed. Human approval binds an immutable policy version/hash; LLM text remains advisory.

A workflow state machine alone does not enforce wallet spending. A reviewed wallet module or payment adapter must make bypassing policy impossible. Specify atomic budget reservation for parallel requests, settlement, failure, expiry and pending authorization revocation. Cancellation cannot reverse payments already settled.

## x402

Replace the mock catalog with Bazaar discovery and an actual buyer adapter only after testing scheme, chain, token and smart-account/signature compatibility. AA session keys do not automatically support every x402 payment scheme.

Bind approvals to chain ID, token contract, recipient, maximum amount, request identity and expiry. Maintain one authoritative ledger for spent + reserved amounts. Do not trust seller descriptions/categories as authorization. Pin approved merchant identities and endpoints; bind them to payment destinations. Reject redirects and changed quotes unless revalidated.

Most importantly, prepayment is not escrow. Response validation does not provide an automatic refund or prevent paying for poor results. Refund/escrow requires compatible seller terms and settlement support. JSON Schema validation proves shape, not truth or quality.

## Browser agents

The included example is a deterministic extension, not an LLM. Add vendor-specific adapters only through documented APIs. Do not scrape private browser agent interfaces. Seller text and tool output are untrusted data; they must never change a mandate or grant permissions. Never expose owner keys to an agent or page.

For a real runtime use a scoped authenticated bridge. Browser shutdown, worker suspension and dropped replies require durable reservations and reconciliation. This local mock must not be reused as a money ledger.

## Threat model

Protected in this demo: external extension sender allowlist, human-only mandate mutations, fixed-price catalog, integer limits, expiry/revocation, serialized writes, duplicate request IDs.

Not protected: malicious local user, compromised browser/profile/paired agent, extension supply chain, storage tampering or quota exhaustion. A compromised paired agent may spend the entire approved mock budget and read local receipts. Not all browser products support Chrome side panels or extension messaging.

Before funds: audited enforcement path, key/recovery design, approval tests, replay/race tests, prompt-injection tests, quote binding, pending authorization cancellation semantics, operational and regulatory review. Start on testnet, not mainnet.
