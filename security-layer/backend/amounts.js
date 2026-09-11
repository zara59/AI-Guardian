// Amount conversion helpers for the transaction bridge.
//
// Rule for Phase 4: user-facing amounts are handed around as DECIMAL STRINGS
// with the token's real decimals; every amount that touches an RPC payload is
// a BigInt. No float math is used for token values anywhere.

/**
 * Convert a human decimal amount string to raw base units (BigInt).
 * @param {string} amount e.g. "15.25"
 * @param {number} decimals e.g. 6
 * @returns {bigint}
 */
export function toRaw(amount, decimals) {
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const s = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`invalid amount: ${amount}`);
  }
  const [whole, frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(`amount has more than ${decimals} decimals: ${amount}`);
  }
  const fracPadded = frac.padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || '0');
}

/**
 * Convert raw base units (BigInt) to a human decimal string.
 * Lossless by default (full precision). Pass maxFractionDigits to trim for
 * display; a value < 0 drops the fraction entirely.
 * @param {bigint} raw
 * @param {number} decimals
 * @param {number} [maxFractionDigits=decimals] trailing decimals to keep
 * @returns {string}
 */
export function fromRaw(raw, decimals, maxFractionDigits = null) {
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0) {
    throw new Error(`invalid decimals: ${decimals}`);
  }
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  let frac = (abs % divisor).toString().padStart(decimals, '0');

  if (maxFractionDigits === null) {
    maxFractionDigits = decimals;
  }
  if (maxFractionDigits >= 0 && maxFractionDigits < decimals) {
    frac = frac.slice(0, maxFractionDigits);
  } else if (maxFractionDigits < 0) {
    frac = '';
  }
  // Trim trailing zeros to keep the output clean ("15.2500" -> "15.25").
  frac = frac.replace(/0+$/, '');
  const text = frac ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${text}` : text;
}

/** Human/decimal formatting wrapper: raw -> prettier string with commas. */
export function formatRaw(raw, decimals) {
  const [whole, frac] = fromRaw(raw, decimals, 4).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

/** Validate a human amount string (positive, finite decimal places). */
export function isValidAmountString(amount, decimals) {
  if (typeof amount !== 'string' && typeof amount !== 'number') return false;
  const str = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) return false;
  const frac = str.split('.')[1] || '';
  if (frac.length > decimals) return false;
  try {
    return toRaw(str, decimals) > 0n;
  } catch {
    return false;
  }
}