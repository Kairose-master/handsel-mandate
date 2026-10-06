# Experimental delegation adapter

This is a **local experimental profile**, informed by [x402 #3693](https://github.com/x402-foundation/x402/issues/3693) and its two comments retrieved on 2026-10-06. It is not standard compliance, a reference facilitator implementation, or evidence of production facilitator support. No live payment was used for validation.

## Opt-in external principal signer

There is no separate principal signing key in the current MCP configuration. Default behavior remains local mandate enforcement, without a delegation grant. A trusted embedding application can inject `deps.delegation` into `buildServer(env, deps)` or `delegation` into `createWallet(options)`:

```js
import { createDelegationAdapter } from '../mcp/delegation.js';
const delegation = createDelegationAdapter({
  principal: principalIdentifier,
  keyId: pinnedPrincipalKeyId,
  publicKey: pinnedEd25519PublicKeyPem,
  signer: {
    async sign({ signingInput, grant }) {
      // External human-controlled signer/HSM: inspect/authorize grant,
      // sign these exact bytes, return base64url Ed25519 signature only.
      return externalSigner.sign(signingInput, grant);
    },
  },
});
const built = buildServer(env, { delegation });
```

No environment flag loads an arbitrary module, no principal key is generated, and no agent tool accepts a principal key or supplied grant. Configure this at the trusted host boundary. The buyer's EVM signing key remains separate. Fixture signing material under `tests/fixtures/` is the publicly known RFC 8032 test vector, exclusively for tests.

## Schema and canonical bytes

`PaymentPayload.extensions.delegation = { profile, grant }`, where `profile` is `handsel.delegation.experimental.v1` and `grant` is a compact EdDSA JWS. This envelope is a local choice: the issue does not yet define a stable wire contract. Only full disclosure is supported. Existing seller extensions are preserved; seller-supplied delegation data is removed when disabled and replaced when enabled.

The signed grant has the following exact fields:

| Field | Binding |
| --- | --- |
| `profile` | Local version/domain separation |
| `principal`, `keyId` | Host-configured principal and pinned signing key |
| `agent`, `nonce` | Actual EIP-3009 `authorization.from` and 32-byte nonce |
| `expiry` | Integer Unix seconds, exactly `authorization.validBefore` |
| `network`, `asset`, `payTo`, `amount` | Exact selected quote strings; amount in atomic units |
| `resource` | Entire quote resource, including URL/audience and metadata |
| `requirements` | Entire selected PaymentRequirements, including scheme, timeout and token domain/extra |
| `authorization` | Entire actual payment authorization, including validAfter |

The authorization must match the wallet agent, payTo and amount. Payload `accepted` and `resource` must exactly match the selected quote. Expiry must be in the future, within the quote timeout and no later than the local mandate expiry. Near mandate expiry, a normal SDK authorization extending beyond that mandate is refused conservatively. The resource is the exact quoted resource URL, not a normalized URL; the existing wallet still permits query parameters on a bare quoted endpoint. This does not bind a POST body or additional query parameters absent from that quote.

Canonicalization recursively sorts object keys by UTF-16 ordering, uses ECMAScript JSON string escaping, and preserves array order. It uses a restricted RFC 8785/JCS-compatible domain: valid Unicode strings, booleans, null, safe integers except negative zero, arrays and plain objects. Floats, undefined, sparse slots, BigInts, lone surrogates and unsupported objects fail closed. This is not a general-purpose full JCS implementation. Integer money stays in strings. Unknown quote fields are signed, not discarded.

Protected header is canonical `{alg:"EdDSA",kid:keyId,typ:"JWT"}`. Signing bytes are ASCII `base64url(UTF8(canonical(header))) + "." + base64url(UTF8(canonical(grant)))`. JWS adds `"." + base64url(signature)`, without padding. The adapter verifies these exact bytes against the configured pinned Ed25519 public key and rechecks expiry after the asynchronous signer returns. It never follows a grant-provided key URL. `verifyGrant` is a pure signature/binding check against an expected grant, **not replay protection or payment verification**.

## Reservation and replay boundary

The existing `buy` queue still serializes quote validation, durable local budget reservation, SDK payment signing, principal signing and transmission. Total/per-call/network/asset/seller/expiry checks remain mandatory. Amount is reserved and saved **before** `createPaymentPayload`, as before. Once the SDK creates the authorization, the nonce is checked against all stored receipts and durably consumed before invoking the external principal signer or sending the payment. Failed principal signing, replay rejection and uncertain transport retain the reservation conservatively. Request-id retries return the previous receipt without signing or paying again. Corrupt/unreadable state fails closed rather than resetting replay and budget history.

This queue protects **one wallet instance with exclusive ownership of its state file**. It is not a cross-process lock or a shared budget authority. Do not run multiple wallet instances/processes against the same state file. A downstream facilitator must independently verify the principal signature and exact requirements/authorization binding and atomically consume the nonce; a valid signature alone does not prevent replay. Unsupported facilitators may ignore the extension, so attaching it does not add remote enforcement or prove authorization acceptance.

Aggregate budget across facilitators, `budgetRef`, reserve → settle/release, revocation propagation, child-grant attenuation accounting, and private attestations are intentionally not implemented. These need a shared durable authority; a remaining-balance query or facilitator-local counter is insufficient. Existing local reservations are never refunded, even if this experimental signer refuses. Verification is neither settlement nor delivery; receipts retain existing `seller-reported-settled` / `uncertain` semantics.

## Validation

`node --test tests/delegation.test.js` covers deterministic canonical/signing bytes, all signed fields, invalid signatures, changed quote and authorization fields, expiry during signing, persisted nonce reuse across concurrent buys and restart, concurrent aggregate budget exhaustion, reservation-before-signer ordering, uncertain holds, request-id retry, opt-out and continued local per-call enforcement. All requests use mocked transports; no facilitator settlement, wallet transfer or real principal signing is performed.
