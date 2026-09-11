#!/usr/bin/env node
// Phase 6 funding CLI — reads real Sepolia balances/allowances for the
// execution wallet (or an explicit wallet).
// Usage: node scripts/check-funding.mjs [--operation deposit] [--amount 100] [--wallet 0x...]
import { checkExecutionFunding } from '../backend/funding.js';
import { loadEnvFiles } from '../backend/deployment.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

await loadEnvFiles([
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../backend/.env'),
].filter(Boolean));

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

const funding = await checkExecutionFunding({
  operation: flag('operation') || 'deposit',
  amountRaw: flag('amount'),
  walletAddress: flag('wallet'),
  tokenAddress: flag('token'),
  vaultAddress: flag('vault'),
});

process.stdout.write(`${JSON.stringify(funding, null, 2)}\n`);
console.log(`\nSTATUS: ${funding.state} (${funding.ready ? 'READY' : 'NOT READY'})`);
console.log(funding.detail);
process.exit(funding.ready ? 0 : 3);