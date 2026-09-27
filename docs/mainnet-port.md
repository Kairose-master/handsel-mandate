# Base mainnet validator port

This source port is preparation only. It has not been deployed, installed in a wallet, independently reviewed, or used for a live x402 purchase.

## Network-specific checks

`MandateValidator` remains Base Sepolia-only. `MandateValidatorMainnet` is a separate artifact pinned to Base chain ID 8453, native Base USDC, and its EIP-712 token domain. Runtime quote validation, signing, contract-bytecode verification, reservation, and settlement reconciliation select their network configuration from `runtime/config.local.json`.

Base mainnet spending is disabled by default. It requires both `allowMainnet: true` in that private config and `--confirm-mainnet` on every owner CLI operation. The browser asks again before sending a mainnet purchase or revoke. The older AA provisioning flow remains Sepolia-only.

The grant remains capped at 1 USDC and one hour. Each payment requires an onchain `reserve` transaction; the agent EOA pays ETH gas separately from the USDC budget. Reservations do not refund on failure.

## Before any mainnet deployment

Complete these gates first:

1. Independent review of the mainnet Solidity artifact, constructor parameters, Coinbase Smart Wallet contract-owner behavior, revocation race, and EIP-3009 signature path.
2. Confirm the target smart account is deployed on Base and its root owner can add and remove contract owners.
3. Verify the selected x402 facilitator accepts EIP-1271 from this exact Coinbase Smart Account implementation and native Base USDC.
4. Validate deployment and owner-install transactions on a dedicated Base Sepolia account first; inspect the emitted addresses and owner index independently.
5. Use a dedicated, low-balance mainnet smart account for the first live test. Fund only the intended USDC cap and the agent's separate ETH gas wallet.

## Mainnet setup after those gates pass

1. Copy `runtime/config.mainnet.example.json` to `runtime/config.local.json`; set `allowMainnet` to `true` only after checking every address and endpoint. Set file mode to `600`.
2. Rebuild artifacts and run tests:

   ```sh
   npm run compile:contracts
   npm test
   ```

3. Provide `OWNER_PRIVATE_KEY` through a secret manager to the human-controlled CLI process. Never put it in the config, extension, agent runtime, repository, or chat.
4. Review the exact target wallet and seller configuration. Only after the security gates pass, run:

   ```sh
   node scripts/owner.js install --confirm-mainnet
   ```

   This deploys the mainnet validator and asks the Coinbase Smart Account to add it as an owner. The owner account pays both transaction gas fees. The validator address and owner index are saved into the local config.
5. Create a mandate draft in the extension; inspect it with `node scripts/owner.js review --confirm-mainnet`; then grant only the exact displayed binding:

   ```sh
   node scripts/owner.js grant <reviewed-binding> --confirm-mainnet
   ```

6. Independently verify both transaction receipts, validator bytecode, `wallet()` binding, installed owner index, grant fields, and the first paid transaction on BaseScan.

`install` includes owner installation; deploying an unused validator without adding it as an owner is not the completed setup. Removing the validator from the smart account is a separate owner action and must be tested before live use.
