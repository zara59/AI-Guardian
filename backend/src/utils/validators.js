import { ApiError } from './response.js';

export const RISK_PREFERENCES = ['conservative', 'moderate', 'aggressive'];
export const RISK_LEVELS = ['low', 'medium', 'high'];
export const ALLOWED_CATEGORIES = [
  'staking',
  'lending',
  'defi',
  'incentive',
  'experimental',
];
export const ALLOWED_SORTS = ['score', 'rank', 'name'];

function badRequest(errors) {
  const first = Object.entries(errors)[0];
  const detail = Object.entries(errors)
    .map(([field, message]) => `${field}: ${message}`)
    .join('; ');
  throw new ApiError(400, detail, 'VALIDATION_ERROR');
}

export function parseRiskPreference(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return null;
  const v = String(value).toLowerCase().trim();
  return RISK_PREFERENCES.includes(v) ? v : null;
}

export function parseRiskLevel(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).toLowerCase().trim();
  return RISK_LEVELS.includes(v) ? v : null;
}

export function parseCategory(value) {
  if (value === undefined || value === null) return null;
  const v = String(value).toLowerCase().trim();
  return ALLOWED_CATEGORIES.includes(v) ? v : null;
}

export function parsePositiveNumber(value, { min = 0 } = {}) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) return null;
  return n;
}

export function isValidWalletAddress(value) {
  if (typeof value !== 'string') return false;
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

/** Parse and validate a ranking request body. Returns the clean value. */
export function validateRankingInput(body) {
  const errors = {};
  const allocation = parsePositiveNumber(body.allocation, { min: 1 });
  if (allocation === null) {
    errors.allocation = 'allocation must be a positive number';
  }
  const riskPreference = parseRiskPreference(body.riskPreference);
  if (riskPreference === null) {
    errors.riskPreference = `riskPreference must be one of: ${RISK_PREFERENCES.join(', ')}`;
  }
  if (Object.keys(errors).length) badRequest(errors);
  return { allocation, riskPreference };
}

/** Parse and validate a preferences request body. Returns the clean value. */
export function validatePreferenceInput(body) {
  const errors = {};
  const value = {};
  if (body.walletAddress !== undefined && body.walletAddress !== null) {
    if (!isValidWalletAddress(body.walletAddress)) {
      errors.walletAddress =
        'walletAddress must be a valid 0x address (40 hex chars)';
    } else {
      value.walletAddress = body.walletAddress.trim().toLowerCase();
    }
  }
  if (body.allocation !== undefined && body.allocation !== null) {
    const allocation = parsePositiveNumber(body.allocation, { min: 1 });
    if (allocation === null) {
      errors.allocation = 'allocation must be a positive number';
    } else {
      value.allocation = allocation;
    }
  }
  if (body.riskPreference !== undefined && body.riskPreference !== null) {
    const riskPreference = parseRiskPreference(body.riskPreference);
    if (riskPreference === null) {
      errors.riskPreference = `riskPreference must be one of: ${RISK_PREFERENCES.join(', ')}`;
    } else {
      value.riskPreference = riskPreference;
    }
  }
  if (Object.keys(value).length === 0) {
    errors.general =
      'at least one of walletAddress, allocation, riskPreference is required';
  }
  if (Object.keys(errors).length) badRequest(errors);
  return value;
}

/** Parse and validate opportunity query parameters. Returns clean filters. */
export function validateQueryParams(query) {
  const errors = {};
  const params = {
    risk: null,
    category: null,
    chain: null,
    minScore: null,
    sort: 'score',
    order: 'desc',
    limit: null,
  };

  if (query.risk !== undefined && query.risk !== '') {
    params.risk = parseRiskLevel(query.risk);
    if (!params.risk) errors.risk = 'risk must be one of: low, medium, high';
  }
  if (query.category !== undefined && query.category !== '') {
    params.category = parseCategory(query.category);
    if (!params.category)
      errors.category = `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`;
  }
  if (query.chain !== undefined && query.chain !== '') {
    const v = String(query.chain).trim();
    params.chain = v;
    if (!v) errors.chain = 'chain must be a non-empty string';
  }
  if (query.minScore !== undefined && query.minScore !== '') {
    params.minScore = parsePositiveNumber(query.minScore, { min: 0 });
    if (params.minScore === null || params.minScore > 100) {
      errors.minScore = 'minScore must be a number between 0 and 100';
    }
  }
  if (query.sort !== undefined && query.sort !== '') {
    const v = String(query.sort).toLowerCase().trim();
    if (!ALLOWED_SORTS.includes(v)) {
      errors.sort = `sort must be one of: ${ALLOWED_SORTS.join(', ')}`;
    } else {
      params.sort = v;
    }
  }
  if (query.order !== undefined && query.order !== '') {
    const v = String(query.order).toLowerCase().trim();
    if (!['asc', 'desc'].includes(v)) {
      errors.order = 'order must be asc or desc';
    } else {
      params.order = v;
    }
  }
  if (query.limit !== undefined && query.limit !== '') {
    const limit = parsePositiveNumber(query.limit, { min: 1 });
    if (limit === null) {
      errors.limit = 'limit must be a positive integer';
    } else {
      params.limit = Math.min(limit, 100);
    }
  }
  if (Object.keys(errors).length) badRequest(errors);
  return params;
}