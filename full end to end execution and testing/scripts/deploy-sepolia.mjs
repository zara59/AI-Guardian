#!/usr/bin/env node
// Phase 6 — Sepolia deployment (REAL). Never fake.
//
// Usage:
//   node scripts/deploy-sepolia.mjs              # full: build→test→simulate→broadcast→artifact→verify
//   node scripts/deploy-sepolia.mjs --simulate   # simulate only (no broadcast)
//   node scripts/deploy-sepolia.mjs --no-tests   # skip forge test
//   node scripts/deploy-sepolia.mjs --verify     # pass --verify to forge (needs ETHERSCAN_API_KEY)
//
// Required env (from ../.env, security-layer/contracts/.env, backend/.env, or shell):
//   PRIVATE_KEY, SEPOLIA_RPC_URL   (optional: ETHERSCAN_API_KEY)
// Secrets are passed to forge as env only — never printed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  forgeAvailable,
  compile,
  runContractTests,
  simulateDeploy,
  broadcastDeploy,
  extractBroadcast,
  writeArtifact,
  loadEnvFiles,
  requiredEnv,
  CONTRACTS_DIR,
} from '../backend/deployment.js';
import { verifySepoliaDeployment } from '../backend/deploymentCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const SIMULATE_ONLY = args.includes('--simulate');
const SKIP_TESTS = args.includes('--no-tests');
const VERIFY = args.includes('--verify');

const env = {
  ...process.env,
  ...(await loadEnvFiles([
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../security-layer/contracts/.env'),
    path.resolve(__dirname, '../../backend/.env'),
  ].filter(Boolean))),
};

const { available, version, error } = await forgeAvailable();
if (!available) {
  console.error('[deploy] forge is not available:', error);
  console.error('[deploy] install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup');
  process.exit(1);
}
console.log(`[deploy] forge: ${version}`);

const R = console.log;
function check(res, label) {
  if (res.code !== 0) {
    console.error(`[deploy] FAILED at: ${label}`);
    console.error(res.stderr || res.error || `exit code ${res.code}`);
    process.exit(1);
  }
  return res;
}

R('\n[deploy] step 1/6 · compile (forge build)');
check(await compile(), 'compile');

if (!SKIP_TESTS) {
  R('\n[deploy] step 2/6 · contract test suite (forge test)');
  const res = check(await runContractTests(), 'forge test');
  const failed = (res.stdout.match(/\[FAIL/g) || []).length + (res.stderr.match(/\[FAIL/g) || []).length;
  if (failed > 0) {
    console.error(`[deploy] ${failed} contract test(s) FAILED.`);
    process.exit(1);
  }
  R(`[deploy] contract tests: ${(res.stdout.match(/\[PASS/g) || []).length} passed`);
}

R('\n[deploy] step 3/6 · simulate on Sepolia (no broadcast)');
const missing = requiredEnv(env);
if (missing.length) {
  console.error(`[deploy] missing env: ${missing.join(', ')}. Set them (never commit) and retry.`);
  // --simulate is still allowed to run: forge will report the real failure.
  if (!SIMULATE_ONLY) process.exit(1);
}
const sim = await simulateDeploy(env);
if (sim.code !== 0) {
  console.error('[deploy] simulation failed — nothing was broadcast.');
  console.error(sim.stderr.split('\n').slice(-20).join('\n'));
  process.exit(1);
}
const simLines = (sim.stdout + sim.stderr)
  .split('\n')
  .filter((l) => /GuardianTestToken|GuardianSimpleStakingStrategy|GuardianVault|deployer|decimals|paused/.test(l));
for (const l of simLines.slice(-12)) R('   ' + l.trim());

if (SIMULATE_ONLY) {
  console.log('\n[deploy] --simulate only. No on-chain writes were performed.');
  process.exit(0);
}

R('\n[deploy] step 4/6 · broadcast REAL deployment to Sepolia');
const bc = check(await broadcastDeploy(env, { verify: VERIFY }), 'forge script --broadcast');
R((bc.stdout + bc.stderr).split('\n').filter((l) => l.includes('ONCHAIN') || l.includes('traces')).slice(0, 6).join('\n'));

R('\n[deploy] step 5/6 · extract real addresses from the broadcast file');
const deployment = await extractBroadcast();
if (!deployment || deployment.error) {
  console.error('[deploy] broadcast artifact could not be parsed:', deployment?.error || 'null');
  process.exit(1);
}
R(`[deploy] broadcast file:   ${deployment.file}`);
R(`[deploy] deployer:          ${deployment.deployer}`);
R(`[deploy] first block:       ${deployment.deployedAtBlock}`);
for (const [name, c] of Object.entries(deployment.contracts)) {
  R(`[deploy] ${name}: ${c.address}  (tx ${c.txHash}, block ${c.blockNumber})`);
}

const { file, artifact } = await writeArtifact(deployment);
R(`[deploy] artifact written:  ${file}`);

R('\n[deploy] step 6/6 · verify deployment ON-CHAIN (bytecode + chain id + decimals)');
const verification = await verifySepoliaDeployment();
R(`[deploy] verified: ${verification.deployed}  (${verification.reason})`);
for (const f of verification.faults || []) R(`[deploy] fault: ${f}`);
if (!verification.deployed) {
  console.error('\n[deploy] Deployment exists in the artifact but on-chain verification failed.');
  process.exit(1);
}

console.log('\n[deploy] DONE. Real contracts are live on Sepolia and the application is configured.');
console.log(`[deploy] Explorer: https://sepolia.etherscan.io/address/${artifact.contracts[2].address}`);
process.exit(0);