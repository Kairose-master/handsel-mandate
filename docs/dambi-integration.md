# DAMBI-compatible pre-sign gate

Handsel converts each x402 `TransferWithAuthorization` request into the public
`@dambi/core` `typed_signature` request contract and a proposed
`Token::Eip3009TransferAuthorization` action before reserving budget or signing.
Only an `allow / evaluated / enforcing` verdict can continue. `warn`, `deny`,
`fail_closed`, advisory verdicts, malformed results, and evaluator exceptions
stop the payment.

`runtime/dambi.js` contains the executable baseline evaluator for the exact
Base Sepolia USDC action Handsel supports. It checks the chain, token, payer,
recipient, per-call amount, authorization window, and mandate expiry. The
onchain `MandateValidator` remains the authority for cumulative budget and
revocation.

The files under `dambi/` are an upstream-integration proposal: a registry v3
typed-data manifest, an Action schema fragment, and a Cedar policy bundle.
They are not claimed to run in DAMBI unchanged yet because `@dambi/core@0.0.1`
is a type-only scaffold and DAMBI's Rust lowering does not yet include this new
Action variant. When a working browser-free core is published, replace the
baseline evaluator through `checkX402Risk`'s evaluator port; the signing gate
and fail-closed contract do not change.

The proposal was authored for Handsel from DAMBI's public formats. DAMBI is
Apache-2.0; preserve its LICENSE and NOTICE if upstream source is copied later.
