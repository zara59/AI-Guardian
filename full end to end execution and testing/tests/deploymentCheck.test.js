import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifySepoliaDeployment, loadSepoliaContracts } from '../backend/deploymentCheck.js';

const G = (a) => '0x' + a.padStart(40, '0');

const ARTIFACT = {
  deployer: G('1'),
  deployedAtBlock: 7000000,
  version: '1.0.0',
  contracts: {
    GuardianTestToken: { address: G('2'), decimals: 6 },
    GuardianSimpleStakingStrategy: { address: G('3') },
    GuardianVault: { address: G('4') },
  },
};

function okOnChain() {
  return {
    chain: { chainId: 11155111, ok: true },
    contracts: {
      token: { address: G('2'), deployed: true, bytecodeLength: 5000, decimals: 6 },
      strategy: { address: G('3'), deployed: true, bytecodeLength: 6000 },
      vault: {
        address: G('4'),
        deployed: true,
        bytecodeLength: 8000,
        state: { token: G('2'), strategy: G('3'), tokenSupported: true, paused: false, totalAssets: '1000000' },
      },
    },
  };
}

test('no artifact → NOT_DEPLOYED, no fabrication', async () => {
  const r = await verifySepoliaDeployment({
    getDeployment: async () => null,
  });
  assert.equal(r.deployed, false);
  assert.equal(r.reason, 'NOT_DEPLOYED');
  assert.match(r.detail, /config\/contracts\/11155111\.json/);
});

test('artifact + matching on-chain → VERIFIED', async () => {
  const r = await verifySepoliaDeployment({
    getDeployment: async () => ARTIFACT,
    probeDeployment: async () => okOnChain(),
  });
  assert.equal(r.reason, 'VERIFIED');
  assert.equal(r.deployed, true);
  assert.equal(r.artifact.vault, G('4'));
  assert.equal(r.onChain.decimalsOk, true);
  assert.equal(r.onChain.strategyOk, true);
});

test('artifact + mismatch (wrong chain + wrong strategy + paused) → PARTIAL_MISMATCH with faults', async () => {
  const bad = okOnChain();
  bad.chain = { chainId: 1, ok: false };
  bad.contracts.strategy = { address: G('9'), deployed: true, bytecodeLength: 6000 };
  bad.contracts.vault.state = { token: G('2'), strategy: G('9'), tokenSupported: true, paused: true, totalAssets: '1000000' };
  const r = await verifySepoliaDeployment({
    getDeployment: async () => ARTIFACT,
    probeDeployment: async () => bad,
  });
  assert.equal(r.deployed, false);
  assert.equal(r.reason, 'PARTIAL_MISMATCH');
  assert.ok(r.faults.some((f) => /chain id mismatch/.test(f)));
  assert.ok(r.faults.some((f) => /strategy/.test(f)));
  assert.ok(r.faults.some((f) => /paused/.test(f)));
});

test('loadSepoliaContracts returns null when registry is empty', async () => {
  const c = await loadSepoliaContracts({ getGuardianContracts: async () => null });
  assert.equal(c, null);
});

test('loadSepoliaContracts returns authoritative addresses when present', async () => {
  const contracts = { token: { address: G('2'), decimals: 6 }, vault: { address: G('4') } };
  const c = await loadSepoliaContracts({ getGuardianContracts: async () => contracts });
  assert.equal(c.vault.address, G('4'));
});