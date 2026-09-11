import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRankingInput,
  validatePreferenceInput,
  validateQueryParams,
  isValidWalletAddress,
} from '../src/utils/validators.js';
import { ApiError } from '../src/utils/response.js';

function expectValidationError(fn) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 400);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
}

test('validateRankingInput accepts valid input', () => {
  assert.deepEqual(validateRankingInput({ allocation: 100, riskPreference: 'moderate' }), {
    allocation: 100,
    riskPreference: 'moderate',
  });
});

test('validateRankingInput rejects invalid risk preference', () => {
  expectValidationError(() =>
    validateRankingInput({ allocation: 100, riskPreference: 'extreme' }),
  );
});

test('validateRankingInput rejects non-positive allocation', () => {
  expectValidationError(() =>
    validateRankingInput({ allocation: 0, riskPreference: 'moderate' }),
  );
});

test('validatePreferenceInput requires at least one field', () => {
  expectValidationError(() => validatePreferenceInput({}));
});

test('validatePreferenceInput normalizes wallet addresses', () => {
  const value = validatePreferenceInput({
    walletAddress: '0x' + 'Ab'.repeat(20),
  });
  assert.equal(value.walletAddress, '0x' + 'ab'.repeat(20));
});

test('validatePreferenceInput rejects malformed wallet addresses', () => {
  expectValidationError(() => validatePreferenceInput({ walletAddress: '0x1234' }));
  expectValidationError(() => validatePreferenceInput({ walletAddress: 'abc' }));
});

test('isValidWalletAddress', () => {
  const valid = '0x' + 'a'.repeat(40);
  assert.equal(isValidWalletAddress(valid), true);
  assert.equal(isValidWalletAddress('0x' + 'a'.repeat(39)), false);
  assert.equal(isValidWalletAddress(42), false);
});

test('validateQueryParams returns defaults', () => {
  assert.deepEqual(validateQueryParams({}), {
    risk: null,
    category: null,
    chain: null,
    minScore: null,
    sort: 'score',
    order: 'desc',
    limit: null,
  });
});

test('validateQueryParams parses filters and clamps limit', () => {
  const params = validateQueryParams({ risk: 'HIGH', category: 'defi', limit: 9999, minScore: 50 });
  assert.equal(params.risk, 'high');
  assert.equal(params.category, 'defi');
  assert.equal(params.minScore, 50);
  assert.equal(params.limit, 100);
});

test('validateQueryParams rejects invalid values', () => {
  expectValidationError(() => validateQueryParams({ risk: 'extreme' }));
  expectValidationError(() => validateQueryParams({ minScore: 101 }));
  expectValidationError(() => validateQueryParams({ sort: 'apy' }));
  expectValidationError(() => validateQueryParams({ order: 'sideways' }));
});