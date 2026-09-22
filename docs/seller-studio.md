# Seller Studio: first product slice

Positioning: **바이브 코딩으로 만든 도구를 AI 에이전트에게 판매하세요.**

Run `node scripts/seller-studio.js` and open http://127.0.0.1:4173.

This is a local, dependency-free seller onboarding prototype, not a hosted marketplace. Enter a tool endpoint, JSON examples, USDC price and recipient; preview the product, simulate a budget-constrained fixture purchase, and download product metadata plus x402 route configuration. Form edits invalidate the preview. Refresh clears the form state; export before closing.

No endpoint is contacted, no signature is requested, no money moves, no discovery registration occurs. The example domain and wallet are placeholders. The exported `blockflow.product-draft.v1` format is our own draft format, not a Bazaar extension or an MCP server. Prices use exact six-decimal USDC units. Only Base Sepolia is emitted. The server is loopback-only and serves an explicit static file allowlist.

## Next integration gates

1. Establish seller identity and endpoint ownership before exposing any hosted proxy. Never accept arbitrary URLs into an unrestricted server-side fetcher.
2. Install official x402 middleware and the exact EVM scheme on the seller's route, configure an appropriate facilitator, then verify a real testnet payment and delivered response. Route configuration alone cannot enforce payment or protect an upstream API.
3. Generate explicit input/output schemas and configure the official Bazaar discovery extension. Verify actual indexing; do not infer it from a metadata export.
4. Add persistent authenticated product management and a public product URL. Keep simulated events outside revenue metrics.
5. Connect the existing mandate buyer only after the above gates. Do not label the local simulator as autonomous agent reasoning or the existing AA policy engine.

## Demand experiment

Recruit three developers with working input/output APIs and existing users. Offer a fixed-scope paid integration for one endpoint. Measure separately: paid seller onboarding, external buyer's successful paid use, and repeat paid use. Test purchases do not qualify. Bazaar supplies a discovery channel, not guaranteed buyers. Start with document extraction/conversion as a category hypothesis; change it if interviews show stronger demand elsewhere.

Reusable infrastructure: official x402 SDK, facilitator and Bazaar; the existing Handsel mandate implementation. No new payment protocol, search engine, wallet or tax/Merchant-of-Record service is part of this slice.
