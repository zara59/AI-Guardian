#!/usr/bin/env node
// Phase 6 §12 + §21 — live end-to-end Sepolia demonstration.
//
// Drives the REAL backend API (same endpoints the frontend uses):
//   readiness → vault before-state → prepare → approve → execute-and-poll
//   → derived state → reconcile → vault after-state → withdraw flow
//
// Usage:
//   node scripts/demo-e2e.mjs \
//       --base http://localhost:3000 \
//       --opportunity 1 \
//       --wallet 0x<user wallet> \
//       --amount 100
//
// If any prerequisite (deployment / KeeperHub key / funding) is genuinely
// missing, the demo STOPS and prints the real blocker. It never fakes a step.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFiles } from '../backend/deployment.js';

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

const BASE = (flag('base') || process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const OPPORTUNITY_ID = Number(flag('opportunity') || process.env.DEMO_OPPORTUNITY_ID);
const WALLET = flag('wallet') || process.env.DEMO_WALLET;
const AMOUNT = flag('amount') || process.env.DEMO_AMOUNT || '100';

if (!OPPORTUNITY_ID) {
  console.error('demo-e2e: --opportunity <id> is required (a real DB opportunity row on Sepolia).');
  process.exit(1);
}
if (!WALLET || !/^0x[a-fA-F0-9]{40}$/.test(WALLET)) {
  console.error('demo-e2e: --wallet <0x…> is required (a valid address).');
  process.exit(1);
}

const LOG = (s) => console.log(s);
const step = (n, s) => LOG(`\n[step ${n}] ${s}`);

async function api(method, p, body) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const stop = (msg) => {
  console.error(`\nDEMO STOPPED (real blocker). ${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
LOG('=== AI Guardian · Phase 6 live end-to-end (Sepolia) ===');
LOG(`backend: ${BASE}  opportunity: ${OPPORTUNITY_ID}  wallet: ${WALLET}  amount: ${AMOUNT}`);

step(1, 'readiness — is the system deployable + funded + authenticated?');
let r;
try {
  r = await api('GET', '/api/phase6/readiness');
} catch (err) {
  stop(`could not reach the backend at ${BASE} (${err.message}). Start it with backend/.env loaded, then retry.`);
}
LOG(JSON.stringify({
  ready: r.data?.ready,
  blockers: r.data?.blockers,
  deployment: { deployed: r.data?.deployment?.deployed, reason: r.data?.deployment?.reason },
  keeperhub: { configured: r.data?.keeperhub?.configured, authenticated: r.data?.keeperhub?.authenticated },
  funding: { state: r.data?.funding?.state },
}, null, 2));
if (!r.data?.ready) {
  stop(r.data.blockers?.join('\n        · ') || 'readiness not met.');
}
LOG('READY confirmed — proceeding with real execution.');

step(2, 'vault state BEFORE deposit (on-chain read)');
  const before = await api('GET', `/api/phase6/vault-state?owner=${WALLET}`);
  LOG(JSON.stringify({ vault: before.data?.vault, state: before.data?.state }, null, 2));

  step(3, `prepare deterministic deposit workflow (${AMOUNT} gTEST — 6 decimals)`);
  const prep = await api('POST', '/api/workflows/prepare', {
    opportunityId: OPPORTUNITY_ID,
    walletAddress: WALLET,
    amount: AMOUNT,
    type: 'deposit',
  });
  if (prep.status >= 400) stop(`prepare failed (${prep.status}): ${JSON.stringify(prep.data)}`);
  const wf = prep.data.workflow;
  LOG(`workflowId:   ${wf.workflowId}`);
  LOG(`workflowHash: ${wf.workflowHash}`);
  LOG(`vault:        ${wf.vault.address}`);
  LOG(`chainId:      ${wf.chainId}  mode: ${wf.executionMode}`);

  step(4, 'user approval');
  const app = await api('POST', `/api/workflows/${wf.workflowId}/approve`);
  if (app.status >= 400) stop(`approve failed (${app.status}): ${JSON.stringify(app.data)}`);
  LOG(`approvalId:   ${app.data.workflow.approvalId}`);

  step(5, 'execute-and-poll — KeeperHub executes, we poll to terminal');
  const exe = await api('POST', `/api/workflows/${wf.workflowId}/execute-and-poll`, {
    approvalId: app.data.workflow.approvalId,
  });
  if (exe.status >= 400) stop(`execution failed (${exe.status}): ${JSON.stringify(exe.data)}`);
  const final = exe.data.workflow;
  LOG(`keeperhub executionId: ${final.khExecutionId}`);
  LOG(`txHash:    ${final.txHash}`);
  LOG(`block:     ${final.blockNumber ?? 'pending'}`);
  LOG(`finalState: ${final.finalState}  receipt: ${final.receiptStatus}`);
  if (final.finalState !== 'confirmed') stop('workflow did not reach confirmed; see reconciliation.');

  step(6, 'phase6 derived state + independent reconciliation');
  const st = await api('GET', `/api/phase6/state/${wf.workflowId}`);
  LOG(`derived Phase 6 state: ${st.data?.state} — ${st.data?.label}`);
  const rec = await api('POST', `/api/workflows/${wf.workflowId}/reconcile`);
  LOG(`reconciliation: ${rec.data?.workflow?.reconciliation?.verified ? 'VERIFIED' : 'verification pending'}`);
  LOG(`verifiedAt: ${rec.data?.workflow?.verifiedAt}`);

  step(7, 'vault state AFTER deposit (on-chain read)');
  const after = await api('GET', `/api/phase6/vault-state?owner=${WALLET}`);
  LOG(JSON.stringify({ vault: after.data?.vault, state: after.data?.state }, null, 2));

  step(8, 'withdraw flow — prepare → approve → execute → reconcile');
  const wp = await api('POST', '/api/workflows/prepare', {
    opportunityId: OPPORTUNITY_ID,
    walletAddress: WALLET,
    amount: AMOUNT,
    type: 'withdraw',
  });
  if (wp.status >= 400) stop(`withdraw prepare failed (${wp.status}): ${JSON.stringify(wp.data)}`);
  const wwf = wp.data.workflow;
  const wa = await api('POST', `/api/workflows/${wwf.workflowId}/approve`);
  if (wa.status >= 400) stop(`withdraw approve failed (${wa.status}): ${JSON.stringify(wa.data)}`);
  const wx = await api('POST', `/api/workflows/${wwf.workflowId}/execute-and-poll`, {
    approvalId: wa.data.workflow.approvalId,
  });
  if (wx.status >= 400) stop(`withdraw execution failed (${wx.status}): ${JSON.stringify(wx.data)}`);
  LOG(`withdraw txHash: ${wx.data.workflow.txHash}`);
  const wr = await api('POST', `/api/workflows/${wwf.workflowId}/reconcile`);
  LOG(`withdraw reconciliation: ${wr.data?.workflow?.reconciliation?.verified ? 'VERIFIED' : 'check reconciliation'}`);

  step(9, 'final vault state (on-chain read)');
  const fin = await api('GET', `/api/phase6/vault-state?owner=${WALLET}`);
  LOG(JSON.stringify({ vault: fin.data?.vault, state: fin.data?.state }, null, 2));

  console.log('\nDEMO COMPLETE — real on-chain evidence recorded above.');
  console.log(`Explorer (vault): https://sepolia.etherscan.io/address/${fin.data?.vault}`);
  process.exit(0);
}