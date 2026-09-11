// Phase 5: KeeperHub REST API HTTP client.
//
// A stateless, typed HTTP client for the KeeperHub Direct Execution API.
// All communication with KeeperHub flows through this single module.
//
// Endpoints used:
//   POST /api/execute/contract-call  — simulate or execute a smart contract call
//   GET  /api/execute/{id}/status    — poll execution status
//   GET  /api/keys                   — validate API key
//   GET  /api/chains                 — list supported chains

import { getConfig } from './config.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const POLL_TIMEOUT_MS = 120_000;

/**
 * Build the standard headers for a KeeperHub API request.
 * @param {object} config
 * @param {object} [extra]
 */
function buildHeaders(config, extra = {}) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    ...extra,
  };
  return headers;
}

/**
 * Parse a rate-limit or poll-interval header into a number of seconds.
 */
function parseRetryAfter(res) {
  const raw = res.headers.get('retry-after') || res.headers.get('x-poll-interval-hint');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Make a request to the KeeperHub REST API.
 * @param {string} path  — URL path (appended to baseUrl)
 * @param {object} options
 * @param {string} options.method
 * @param {object} [options.body]
 * @param {object} [options.headers]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{status: number, data: any, retryAfter: number|null}>}
 */
async function request(path, { method = 'GET', body, headers: extraHeaders, timeoutMs } = {}) {
  const config = getConfig();
  if (!config.apiKeyPresent) {
    throw new Error('KeeperHub API key not configured. Set KEEPERHUB_API_KEY.');
  }

  const url = `${config.baseUrl}${path}`;
  const timeout = timeoutMs ?? (method === 'GET' ? POLL_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions = {
      method,
      headers: buildHeaders(config, extraHeaders),
      signal: controller.signal,
    };
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }
    const res = await fetch(url, fetchOptions);

    clearTimeout(timer);

    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    const retryAfter = parseRetryAfter(res);

    return { status: res.status, data, retryAfter };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error(`KeeperHub API request timed out after ${timeout}ms: ${path}`);
    }
    throw new Error(`KeeperHub API request failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the configured API key against KeeperHub.
 * @returns {Promise<boolean>} true if the key is valid
 */
export async function authProbe() {
  try {
    const { status } = await request('/api/keys');
    return status === 200;
  } catch {
    return false;
  }
}

/**
 * List supported chains from KeeperHub.
 * @returns {Promise<Array>}
 */
export async function listChains() {
  const { status, data } = await request('/api/chains');
  if (status !== 200) throw new Error(`Failed to list chains: ${status}`);
  return Array.isArray(data) ? data : data?.chains || [];
}

/**
 * Simulate a contract call (dry-run, no broadcast).
 * @param {object} body — request body for /api/execute/contract-call
 * @returns {Promise<object>} simulation result
 */
export async function simulateContractCall(body) {
  const { status, data } = await request('/api/execute/contract-call', {
    method: 'POST',
    body: { ...body, simulate: true },
    timeoutMs: 30_000,
  });

  if (status === 200 && data?.success !== false) {
    return { success: true, ...data };
  }

  return {
    success: false,
    status: 'simulated',
    wouldRevert: data?.wouldRevert ?? true,
    error: data?.error || data?.message || `Simulation failed with status ${status}`,
    failureKind: data?.failureKind,
    code: data?.code,
    revertReason: data?.revertReason,
  };
}

/**
 * Execute a contract call via KeeperHub (broadcasts a real transaction).
 * @param {object} body — request body for /api/execute/contract-call
 * @param {string} idempotencyKey — deduplication key
 * @returns {Promise<object>} execution result with executionId
 */
export async function executeContractCall(body, idempotencyKey) {
  const { status, data } = await request('/api/execute/contract-call', {
    method: 'POST',
    body,
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });

  if (status === 409) {
    return {
      success: false,
      conflict: true,
      code: data?.code,
      originalExecutionId: data?.originalExecutionId,
      retryable: data?.retryable,
      error: data?.error,
    };
  }

  if (status >= 200 && status < 300) {
    return {
      success: true,
      executionId: data?.executionId,
      status: data?.status,
      transactionHash: data?.transactionHash || null,
      transactionLink: data?.transactionLink || null,
      sponsored: data?.sponsored || false,
      error: data?.error || null,
    };
  }

  return {
    success: false,
    status: data?.status || 'unknown',
    error: data?.error || data?.message || `Execution failed with status ${status}`,
    executionId: data?.executionId || null,
    transactionHash: data?.transactionHash || null,
  };
}

/**
 * Get the status of a direct execution by its execution ID.
 * @param {string} executionId
 * @returns {Promise<object>} execution status with receipts
 */
export async function getExecutionStatus(executionId) {
  const { status, data, retryAfter } = await request(
    `/api/execute/${encodeURIComponent(executionId)}/status`,
    { timeoutMs: POLL_TIMEOUT_MS },
  );

  if (status === 404) {
    return { found: false, executionId };
  }

  if (status !== 200) {
    return { found: false, executionId, error: `Status check failed: ${status}` };
  }

  return {
    found: true,
    executionId: data?.executionId || executionId,
    status: data?.status,
    type: data?.type,
    network: data?.network,
    transactionHash: data?.transactionHash || null,
    transactionLink: data?.transactionLink || null,
    sponsored: data?.sponsored || false,
    retryCount: data?.retryCount || 0,
    receipts: data?.receipts || [],
    gasUsedWei: data?.gasUsedWei || null,
    gasPriceWei: data?.gasPriceWei || null,
    result: data?.result || null,
    error: data?.error || null,
    createdAt: data?.createdAt || null,
    completedAt: data?.completedAt || null,
    pollIntervalHint: retryAfter,
  };
}
