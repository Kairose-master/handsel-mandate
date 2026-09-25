#!/usr/bin/env bash
# Builds the 402-LAB buyer MCP server as an MCPB bundle (Claude Desktop
# extension format, also what Smithery and the official MCP Registry take for
# local stdio servers). Output: dist/402-lab.mcpb and dist/server.json with the
# bundle's sha256 filled in. Nothing here needs a wallet key.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGE=dist/mcpb
rm -rf "$STAGE" dist/402-lab.mcpb dist/server.json
mkdir -p "$STAGE"
cp mcp/server.js mcp/wallet.js mcp/catalog.js mcp/manifest.json "$STAGE"/
cp submissions/x402-ecosystem/logos/402-lab.png "$STAGE/icon.png"
# Only the runtime dependencies the three mcp/*.js files import, pinned to the
# versions the test suite runs against.
node -e '
const root = require("./package.json"), m = require("./mcp/manifest.json");
const keep = ["@modelcontextprotocol/sdk", "@x402/core", "@x402/evm", "@x402/extensions", "viem", "zod"];
const deps = Object.fromEntries(keep.map(k => [k, root.dependencies[k]]));
process.stdout.write(JSON.stringify({ name: "402-lab-mcp", version: m.version, private: true, type: "module", engines: root.engines, dependencies: deps }, null, 2) + "\n");
' > "$STAGE/package.json"
(cd "$STAGE" && npm install --omit=dev --no-audit --no-fund --silent)
npx --yes @anthropic-ai/mcpb@2 pack "$STAGE" dist/402-lab.mcpb
SHA=$(sha256sum dist/402-lab.mcpb | cut -d' ' -f1)
node -e '
const s = require("./mcp/server.registry.json");
s.packages[0].fileSha256 = process.argv[1];
process.stdout.write(JSON.stringify(s, null, 2) + "\n");
' "$SHA" > dist/server.json
echo "bundle  dist/402-lab.mcpb ($(du -h dist/402-lab.mcpb | cut -f1))"
echo "sha256  $SHA"
echo "registry manifest  dist/server.json"
