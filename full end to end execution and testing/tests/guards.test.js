import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertConstrainedWorkflow,
  scanExecutionSurface,
  scanForExposedSecrets,
  runSecurityAudit,
} from '../backend/guards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTRACTS = {
  chainId: 11155111,
  token: { address: '0x9999999999999999999999999999999999999999' },
  strategy: { address: '0x3333333333333333333333333333333333333333' },
  vault: { address: '0x1111111111111111111111111111111111111111' },
};

test('assertConstrainedWorkflow accepts a fully constrained workflow', () => {
  assert.equal(
    assertConstrainedWorkflow(
      { operation: 'deposit', vaultAddress: CONTRACTS.vault.address, tokenAddress: CONTRACTS.token.address, chainId: 11155111 },
      CONTRACTS,
    ),
    true,
  );
});

test('assertConstrainedWorkflow rejects arbitrary operations', () => {
  assert.throws(
    () => assertConstrainedWorkflow({ operation: 'executeRaw' }, CONTRACTS),
    /not in the allowed set/,
  );
});

test('assertConstrainedWorkflow rejects unknown target vault', () => {
  assert.throws(
    () => assertConstrainedWorkflow(
      { operation: 'deposit', vaultAddress: '0x1234567890123456789012345678901234567890', tokenAddress: CONTRACTS.token.address, chainId: 11155111 },
      CONTRACTS,
    ),
    /target contract is not the registered GuardianVault/,
  );
});

test('assertConstrainedWorkflow rejects wrong chain', () => {
  assert.throws(
    () => assertConstrainedWorkflow(
      { operation: 'deposit', vaultAddress: CONTRACTS.vault.address, tokenAddress: CONTRACTS.token.address, chainId: 1 },
      CONTRACTS,
    ),
    /chainId/,
  );
});

test('execution surface files are registry/whitelist guarded', async () => {
  const rows = await scanExecutionSurface();
  assert.ok(Array.isArray(rows) && rows.length === 4);
  for (const r of rows) {
    assert.equal(r.verdict, 'PASS', `${r.file}: ${r.notes}`);
  }
});

test('secret scan finds no real committed keys', async () => {
  const hits = await scanForExposedSecrets();
  const onlyFixtures = hits.filter((h) => /test|spec|fixture|mock/i.test(h.file));
  assert.ok(onlyFixtures.length >= hits.length, `unexpected secret hits: ${JSON.stringify(hits)}`);
});

test('runSecurityAudit aggregates surface + secrets', async () => {
  const audit = await runSecurityAudit();
  assert.deepEqual(audit.allowedOperations, ['approve', 'deposit', 'withdraw']);
  assert.ok(Array.isArray(audit.executionSurface));
  assert.ok(Array.isArray(audit.exposedSecrets));
});