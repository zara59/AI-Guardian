// Phase 6: real KeeperHub credentials author.
//
// Phase 5 already implemented the official KeeperHub client (Bearer kh_ key,
// /api/keys, /api/chains, execute/status endpoints). This module adds the
// diagnostics-only probes Phase 6 needs. It NEVER exposes the key — callers
// only ever see booleans + non-secret metadata.

import { authProbe, listChains } from '../../keeper hub integration/backend/client.js';
import { getConfig } from '../../keeper hub integration/backend/config.js';

/**
 * Probe whether the configured KeeperHub API key actually authenticates.
 * @param {object} [deps] — injectable for tests
 * @returns {Promise<{configured: boolean, authenticated: boolean, error?: string}>}
 */
export async function probeKeeperHubAuth(deps = {}) {
  const auth = deps.authProbe || authProbe;
  const config = deps.getConfig ? deps.getConfig() : getConfig();

  if (!config.apiKeyPresent) {
    return {
      configured: false,
      authenticated: false,
      error: 'KEEPERHUB_API_KEY is not set (must start with kh_).',
    };
  }

  const baseUrl = config.baseUrl;
  try {
    const ok = await auth();
    if (!ok) {
      return {
        configured: true,
        authenticated: false,
        error: 'KeeperHub rejected the configured key (401/403). Check KEEPERHUB_API_KEY.',
        baseUrl,
      };
    }
    return { configured: true, authenticated: true, baseUrl };
  } catch (err) {
    return {
      configured: true,
      authenticated: false,
      error: `KeeperHub auth probe failed: ${err.message}`,
      baseUrl,
    };
  }
}

/**
 * List the chains KeeperHub's configured key can actually reach.
 * @returns {Promise<{ok: boolean, chainIds: Array<number>, error?: string}>}
 */
export async function probeKeeperHubChains(deps = {}) {
  const chains = deps.listChains || listChains;
  try {
    const data = await chains();
    const ids = (Array.isArray(data) ? data : data?.chains || [])
      .map((c) => Number(c?.chainId ?? c?.id ?? 0))
      .filter((n) => Number.isInteger(n) && n > 0);
    return { ok: true, chainIds: ids };
  } catch (err) {
    return { ok: false, chainIds: [], error: err.message };
  }
}