// Share-price APY derivation with no external oracle.
//
// An ERC-4626 vault's "share price" is totalAssets / totalSupply. Guardian
// samples both values on-chain over time (opportunity_share_samples) and
// annualizes the observed per-share growth between two block-height snapshots.
// Until two spaced samples exist, APY is null — never invented.

/**
 * Annualize the growth of assets-per-share between two sampled blocks.
 * @param {{blockNo: number, totalAssets: string, totalSupply: string}|null} older
 * @param {{blockNo: number, totalAssets: string, totalSupply: string}} newer
 * @param {{blockSeconds?: number}} options
 * @returns {number|null} APY in percent, or null when not yet measurable.
 */
export function estimateApyFromSamples(older, newer, { blockSeconds = 12 } = {}) {
  if (!older || !newer) return null;
  const a0 = Number(older.totalAssets);
  const s0 = Number(older.totalSupply);
  const a1 = Number(newer.totalAssets);
  const s1 = Number(newer.totalSupply);
  if (![a0, s0, a1, s1].every(Number.isFinite)) return null;
  if (s0 <= 0 || s1 <= 0) return null;

  const share0 = a0 / s0;
  const share1 = a1 / s1;
  if (share0 <= 0 || !Number.isFinite(share0) || !Number.isFinite(share1)) return null;

  const elapsedBlocks = Number(newer.blockNo) - Number(older.blockNo);
  if (!Number.isFinite(elapsedBlocks) || elapsedBlocks <= 0) return null;
  const days = (elapsedBlocks * blockSeconds) / 86400;
  if (days < 1) return null; // not enough wall-clock time yet — honest null

  const rate = share1 / share0 - 1;
  if (rate <= 0) return 0; // no yield observed yet (share price flat/down)
  const apy = (Math.pow(1 + rate, 365 / days) - 1) * 100;
  if (!Number.isFinite(apy)) return null;
  return Number(apy.toFixed(2));
}

/**
 * Pick the two most recent distinct samples (oldest→newest) to annualize.
 * Sorts defensively so callers never have to guarantee ordering.
 */
export function pickTwoMostRecent(samples) {
  const rows = (samples || []).filter(Boolean).sort(
    (a, b) => Number(a.blockNo) - Number(b.blockNo),
  );
  if (rows.length < 2) return null;
  return {
    older: rows[0],
    newer: rows[rows.length - 1],
  };
}