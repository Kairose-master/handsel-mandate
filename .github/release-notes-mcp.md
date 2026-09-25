MCPB bundle of the 402-LAB buyer MCP server: a human delegates a USDC budget in plain words, the agent discovers x402 tools (Bazaar + seller catalogs), pays per call inside the cap and returns only the result. The server enforces the total cap, per-call cap, network, asset and seller allow-list.

**Install**
- Claude Desktop: Settings → Extensions → Advanced → Install Extension… → `402-lab.mcpb`. The wallet key is entered on the install screen and never leaves your machine. Keep only small amounts in that wallet.
- Cursor / any stdio MCP client: `npx -y github:Kairose-master/handsel-mandate` with `BUYER_PRIVATE_KEY`, `NETWORK` (`eip155:84532` testnet, `eip155:8453` Base mainnet) and `MANDATE_MAX_USDC`.
- `server.json` is the official MCP Registry manifest for this release (sha256 of the bundle included).

Docs: https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md · Terms: https://github.com/Kairose-master/handsel-mandate/blob/main/docs/terms.md
