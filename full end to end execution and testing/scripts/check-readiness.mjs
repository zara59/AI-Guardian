#!/usr/bin/env node
// Phase 6 readiness CLI — prints the real readiness report.
// Usage: node scripts/check-readiness.mjs
import { checkReadiness } from '../backend/readiness.js';
import { loadEnvFiles } from '../backend/deployment.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load optional Untracked env files so local checks match the running backend
// (values are only read by config modules — never printed).
await loadEnvFiles([
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../backend/.env'),
  process.env.GUARDIAN_CONTRACTS_DIR
    ? path.join(process.env.GUARDIAN_CONTRACTS_DIR, '.env')
    : null,
].filter(Boolean));

const report = await checkReadiness();

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
const line = report.ready
  ? 'STATUS: READY — the system can move real value via KeeperHub on Sepolia.'
  : 'STATUS: NOT READY — see "blockers".';
console.log('\n' + line);
process.exit(report.ready ? 0 : 2);