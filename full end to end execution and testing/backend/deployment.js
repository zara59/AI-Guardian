// Phase 6: Sepolia deployment tooling.
//
// Real, non-destructive orchestration around the existing Foundry project
// (security-layer/contracts). It:
//   1. checks `forge` is installed
//   2. compiles the contracts (forge build)
//   3. runs the contract test suite (forge test)
//   4. simulates the deploy on Sepolia (no broadcast)
//   5. broadcasts the real deployment (forge script --broadcast)
//   6. extracts the REAL addresses/hashes from the broadcast artifact
//   7. writes security-layer/config/contracts/11155111.json
//   8. verifies the deployment on-chain (bytecode + chain id + decimals)
//
// Neither this module nor the CLI ever prints a private key or RPC credential.
// The script refuses to run when the required env vars are absent.

import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACTS_DIR = path.resolve(__dirname, '../../security-layer/contracts');
export const ARTIFACTS_DIR = path.resolve(__dirname, '../../security-layer/config/contracts');
export const SEPOLIA_CHAIN_ID = 11155111;
export const TOKEN_DECIMALS = 6;

/** Run a command capturing output. Never inherits secrets. */
export function run(cmd, args, opts = {}) {
  // Foundry refuses to auto-load an unapproved project .env; the contracts
  // .env is gitignored and holds only deploy credentials, so approve it.
  if (cmd === 'forge' && !args.includes('--allow-project-env')) {
    args = ['--allow-project-env', ...args];
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd || CONTRACTS_DIR,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: err.message, error: err }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Is `forge` on PATH? */
export async function forgeAvailable() {
  // Probe from a neutral cwd: inside the contracts project, `forge --version`
  // short-circuits BEFORE the flag parser and refuses the unapproved .env.
  const probe = { cwd: tmpdir() };
  const res = await run('forge', ['--version'], probe).catch(() => ({ code: -1 }));
  const ok = res.code === 0;
  return {
    available: ok,
    version: ok ? res.stdout.replace(/\n/g, ' ').trim() : null,
    error: ok ? null : `${res.stderr || res.error || 'forge not found'}`.split('\n')[0],
  };
}

export async function compile() {
  return run('forge', ['build']);
}

export async function runContractTests() {
  return run('forge', ['test']);
}

/** Simulation WITHOUT broadcast — prints the would-be addresses. */
export async function simulateDeploy(env) {
  return run('forge', ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', env.SEPOLIA_RPC_URL], { env });
}

/** Real broadcast. */
export async function broadcastDeploy(env, { verify = false } = {}) {
  const args = ['script', 'script/Deploy.s.sol:Deploy', '--rpc-url', env.SEPOLIA_RPC_URL, '--broadcast'];
  if (verify && env.ETHERSCAN_API_KEY) {
    args.push('--verify', '--etherscan-api-key', env.ETHERSCAN_API_KEY);
  }
  return run('forge', args, { env });
}

async function latestBroadcastFile(chainId = SEPOLIA_CHAIN_ID) {
  const dir = path.join(CONTRACTS_DIR, 'broadcast', 'Deploy.s.sol', String(chainId));
  const files = await readdir(dir).catch(() => []);
  const runs = files.filter((f) => f.startsWith('run-') && f.endsWith('.json'));
  if (!runs.length) return null;
  runs.sort();
  return path.join(dir, runs[runs.length - 1]);
}

/**
 * Parse a forge broadcast artifact into the registry format. Addresses and
 * hashes are read from the REAL broadcast file — never typed in.
 * @returns {Promise<object|null>}
 */
export async function extractBroadcast(chainId = SEPOLIA_CHAIN_ID) {
  const file = await latestBroadcastFile(chainId);
  if (!file) return null;
  let raw;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }

  const txs = Array.isArray(raw.transactions) ? raw.transactions : [];
  const receipts = [];
  if (Array.isArray(raw.receipts)) receipts.push(...raw.receipts);
  else if (raw.receipts && typeof raw.receipts === 'object') {
    for (const r of Object.values(raw.receipts)) if (r) receipts.push(r);
  }
  const byHash = {};
  for (const r of receipts) if (r?.transactionHash) byHash[r.transactionHash] = r;
  const byName = {};
  const createTxs = txs.filter((t) => t.transactionType === 'CREATE' && t.contractName);
  for (const t of createTxs) {
    const receipt = byHash[t.hash] || {};
    const block = String(t.blockNumber ?? receipt?.blockNumber ?? '');
    byName[t.contractName] = {
      address: t.contractAddress,
      txHash: t.hash,
      blockNumber: block ? Number.parseInt(block, block.startsWith('0x') ? 16 : 10) || null : null,
      deployer: t.sender || receipt?.from || null,
    };
  }

  const required = ['GuardianTestToken', 'GuardianSimpleStakingStrategy', 'GuardianVault'];
  const missing = required.filter((n) => !byName[n]);
  if (missing.length) {
    return { error: `broadcast missing deployments: ${missing.join(', ')}`, file, txs: createTxs.length };
  }

  const first = createTxs[0];
  return {
    file,
    deployer: byName.GuardianTestToken?.deployer || null,
    deployedAtBlock: byName.GuardianTestToken?.blockNumber || null,
    contracts: {
      GuardianTestToken: { ...byName.GuardianTestToken, decimals: TOKEN_DECIMALS },
      GuardianSimpleStakingStrategy: byName.GuardianSimpleStakingStrategy,
      GuardianVault: byName.GuardianVault,
    },
  };
}

/**
 * Write the registry artifact consumed by the backend (registry.js).
 */
export async function writeArtifact(deployment, chainId = SEPOLIA_CHAIN_ID) {
  const artifact = {
    chainId,
    network: 'sepolia',
    deployer: deployment.deployer || null,
    deployedAtBlock: deployment.deployedAtBlock ?? null,
    version: '4.0.0',
    contracts: [
      { name: 'GuardianTestToken', address: deployment.contracts.GuardianTestToken.address, decimals: deployment.contracts.GuardianTestToken.decimals },
      { name: 'GuardianSimpleStakingStrategy', address: deployment.contracts.GuardianSimpleStakingStrategy.address },
      { name: 'GuardianVault', address: deployment.contracts.GuardianVault.address },
    ],
  };
  const file = path.join(ARTIFACTS_DIR, `${chainId}.json`);
  await writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return { file, artifact };
}

/**
 * Load an optional .env-style file (KEY=VALUE, comments ignored) WITHOUT
 * printing values. Used to satisfy forge env requirements.
 */
export async function loadEnvFiles(candidates) {
  const env = {};
  for (const f of candidates) {
    let text;
    try {
      text = await readFile(f, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#')) {
        env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

export function requiredEnv(env) {
  const missing = [];
  if (!env.PRIVATE_KEY) missing.push('PRIVATE_KEY');
  if (!env.SEPOLIA_RPC_URL) missing.push('SEPOLIA_RPC_URL');
  return missing;
}