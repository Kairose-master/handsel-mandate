#!/usr/bin/env bash
# Opens the x402.org ecosystem PR for 402-LAB from your own machine.
# Needs: gh CLI logged in (gh auth login) as the GitHub account that will own the fork.
# Usage: bash scripts/submit-x402-ecosystem.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM=x402-foundation/x402
WORK="$(mktemp -d)"
echo "→ forking and cloning $UPSTREAM into $WORK"
gh repo fork "$UPSTREAM" --clone=true --remote=true -- "$WORK/x402" >/dev/null
cd "$WORK/x402"
git checkout -q -b ecosystem/402-lab
DEST=typescript/site/app/ecosystem/partners-data/402-lab
if [ ! -d typescript/site/app/ecosystem/partners-data ]; then
  echo "!! partners-data directory moved; see typescript/site/README.md in the upstream repo" >&2; exit 1
fi
mkdir -p "$DEST" typescript/site/public/logos
cp "$HERE/submissions/x402-ecosystem/402-lab/metadata.json" "$DEST/metadata.json"
cp "$HERE/submissions/x402-ecosystem/logos/402-lab.png" typescript/site/public/logos/402-lab.png
git add -A
git commit -q -m "ecosystem: add 402-LAB (Services/Endpoints)"
git push -q -u origin ecosystem/402-lab
gh pr create --repo "$UPSTREAM" --base main --head "$(gh api user -q .login):ecosystem/402-lab" \
  --title "ecosystem: add 402-LAB (Services/Endpoints)" \
  --body "Adds 402-LAB to the ecosystem directory under Services/Endpoints: one metadata.json and one 256×256 PNG logo.

Live x402 resource on Base mainnet (Bazaar-listed): https://handsel-mandate-demo.vercel.app — Korean business-registration status lookup, 0.02 USDC per call, settled via the CDP facilitator. Buyer side is an MCP server that enforces a human-delegated budget (listed in the official MCP Registry as io.github.Kairose-master/402-lab).

Source: https://github.com/Kairose-master/handsel-mandate"
echo "✓ PR opened. Clone left at $WORK/x402"
