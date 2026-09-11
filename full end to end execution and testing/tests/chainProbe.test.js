import { test } from 'node:test';
import assert from 'node:assert/strict';
import { probeContractDeployed, probeDeployment, probeReceipt } from '../backend/chainProbe.js';

test('probeContractDeployed rejects malformed address without RPC', async () => {
  const r = await probeContractDeployed('not-an-address');
  assert.equal(r.deployed, false);
  assert.match(r.error, /Invalid address/);
});

test('probeDeployment with no artifact is honest, no fabrication', async () => {
  const r = await probeDeployment(null);
  assert.equal(r.deployed, false);
  assert.match(r.error, /No deployment artifact/);
});

test('probeReceipt rejects malformed tx hash without RPC', async () => {
  const r = await probeReceipt('0x1234');
  assert.match(r.error, /Invalid transaction hash/);
});