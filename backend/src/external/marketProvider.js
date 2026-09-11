// Market data provider — real USD token prices from CoinGecko's public API
// (no API key required, rate-limited). Only registered asset ids are fetched
// and the provider layer caches aggressively via the refresh pipeline.

import { requestJson } from '../utils/http.js';
import { logger } from '../utils/logger.js';

const PROVIDER = 'coingecko';

const PRICE_URL = (ids) =>
  `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(','),
  )}&vs_currencies=usd`;

/**
 * Fetch current USD prices for a list of asset ids.
 * @returns {Object<string, number>} map of id -> usd price (only present ids)
 */
export async function fetchTokenPrices(ids, options = {}) {
  if (!ids?.length) return {};
  try {
    const payload = await requestJson(PRICE_URL(ids), {
      provider: 'coingecko:price',
      timeoutMs: 12000,
      retries: 2,
      ...options,
    });
    const result = {};
    for (const [id, value] of Object.entries(payload || {})) {
      if (Number.isFinite(Number(value?.usd))) {
        result[id] = Number(value.usd);
      }
    }
    return result;
  } catch (err) {
    logger.warn('CoinGecko price fetch failed', { message: err.message });
    return {};
  }
}

export { PROVIDER };