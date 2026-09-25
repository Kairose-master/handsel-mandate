#!/usr/bin/env node
// Writes the MCP Registry server.json for a built bundle:
//   node scripts/registry-manifest.mjs <bundle.mcpb> <out server.json>
// Takes mcp/server.registry.json, fills packages[0].fileSha256 with the
// bundle's sha256 and checks the asset URL matches the manifest version.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const [bundle, out = 'dist/server.json'] = process.argv.slice(2);
if (!bundle) { console.error('usage: registry-manifest.mjs <bundle.mcpb> [out]'); process.exit(2); }
const template = JSON.parse(readFileSync(new URL('../mcp/server.registry.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../mcp/manifest.json', import.meta.url), 'utf8'));
if (template.version !== manifest.version) throw new Error(`server.registry.json version ${template.version} != manifest ${manifest.version}`);
if (!template.packages[0].identifier.includes(`/releases/download/mcp-v${manifest.version}/`)) throw new Error('asset URL does not match the manifest version');
template.packages[0].fileSha256 = createHash('sha256').update(readFileSync(bundle)).digest('hex');
writeFileSync(out, JSON.stringify(template, null, 2) + '\n');
console.log(`${out}  sha256 ${template.packages[0].fileSha256}`);
