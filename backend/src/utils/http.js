// Bounded HTTP helpers used by the external provider layer.
// Failures propagate as typed errors so providers can degrade gracefully
// (fail-soft) instead of crashing the backend.

import { logger } from './logger.js';

export class ProviderError extends Error {
  constructor(message, { provider, status, kind = 'http' } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.status = status;
    this.kind = kind; // 'http' | 'timeout' | 'network' | 'invalid-response'
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Perform a JSON request to an external URL with bounded retries and
 * exponential backoff. Throws ProviderError on failure.
 */
export async function requestJson(
  url,
  {
    method = 'GET',
    body,
    headers = { 'Content-Type': 'application/json' },
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = 2,
    provider = 'unknown',
    acceptableStatuses = [200],
  } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!acceptableStatuses.includes(res.status)) {
        throw new ProviderError(
          `HTTP ${res.status} from ${provider}`,
          { provider, status: res.status, kind: 'http' },
        );
      }

      let payload;
      try {
        payload = await res.json();
      } catch {
        throw new ProviderError(
          `Malformed JSON response from ${provider}`,
          { provider, kind: 'invalid-response' },
        );
      }
      return payload;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        lastError = new ProviderError(
          `Request timed out after ${timeoutMs}ms (${provider})`,
          { provider, kind: 'timeout' },
        );
      } else if (err instanceof ProviderError) {
        lastError = err;
      } else {
        lastError = new ProviderError(
          `Network error reaching ${provider}: ${err.message}`,
          { provider, kind: 'network' },
        );
      }

      if (attempt < retries) {
        const backoffMs = Math.min(250 * 2 ** attempt, 2000);
        logger.warn(`Retrying ${provider} in ${backoffMs}ms`, {
          attempt: attempt + 1,
          message: lastError.message,
        });
        await sleep(backoffMs);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

/**
 * Send one JSON-RPC 2.0 request over HTTP. Bounded retries for read-only
 * calls (safe to retry). Returns the parsed `result` or throws ProviderError.
 */
export async function rpcCall(url, method, params = [], options = {}) {
  const payload = await requestJson(url, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: options.id ?? 1, method, params },
    ...options,
  });

  if (payload?.error) {
    throw new ProviderError(
      `RPC error ${payload.error.code}: ${payload.error.message} (${method})`,
      { provider: 'rpc', kind: 'invalid-response' },
    );
  }
  if (!Object.prototype.hasOwnProperty.call(payload ?? {}, 'result')) {
    throw new ProviderError(
      `Malformed RPC response for ${method}: missing result`,
      { provider: 'rpc', kind: 'invalid-response' },
    );
  }
  return payload.result;
}