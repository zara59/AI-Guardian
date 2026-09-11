// Minimal ABI encode/decode helpers for the read-only RPC surface.
// Handles the fixed-size types used by the Guardian contracts (uint256,
// address, bool) — enough to build eth_call/estimateGas payloads and decode
// results and logs without pulling in a full ABI library.

function padWord(value) {
  return value.toString(16).padStart(64, '0');
}

/**
 * Encode an address as a 32-byte word (right-aligned, 20 bytes).
 * @param {string} address 0x-prefixed 20-byte address.
 */
export function encodeAddress(address) {
  return padWord(BigInt(address));
}

/** Encode a uint256 (BigInt/string/number) as a 32-byte word. */
export function encodeUint(value) {
  return padWord(BigInt(value));
}

/**
 * Build the calldata for a contract call: selector + 32-byte words.
 * @param {string} selector 4-byte selector with 0x prefix.
 * @param {Array<{type: 'address'|'uint256', value: *}>} args
 */
export function encodeCalldata(selector, args = []) {
  const data = args.map((arg) =>
    arg.type === 'address' ? encodeAddress(arg.value) : encodeUint(arg.value),
  );
  return `${selector}${data.join('')}`;
}

/** Decode a 32-byte word from a 0x eth_call result into a BigInt. */
export function decodeUint(hex) {
  const cleaned = (hex || '0x0').replace(/^0x/, '');
  const word = cleaned.padStart(64, '0').slice(-64);
  return BigInt(`0x${word}`);
}

/** Extract an address from a 32-byte word (takes the low 20 bytes). */
export function decodeAddress(word) {
  const cleaned = (word || '0x0').replace(/^0x/, '');
  const full = cleaned.padStart(64, '0').slice(-64);
  return `0x${full.slice(full.length - 40)}`;
}

/**
 * Decode a dynamic `string` return value (offsets + length + padded bytes).
 * Handles both the standard ABI layout (offset word, then length, then data)
 * and the raw "first word is the length" layout some tokens emit.
 * @param {string} hex 0x-prefixed ABI-encoded string (single value).
 */
export function decodeString(hex) {
  const cleaned = (hex || '0x').replace(/^0x/, '');
  const words = [];
  for (let i = 0; i < cleaned.length; i += 64) {
    const slice = cleaned.slice(i, i + 64);
    if (slice) words.push(slice);
  }
  if (!words.length) return '';

  let lengthWord = words[0];
  let dataStart = 1;
  const first = Number(decodeUint(`0x${words[0]}`));
  // Standard ABI: word0 is the byte offset of the length word (32 in the
  // single-value case). If it looks like a valid offset, follow it.
  if (
    words.length > 1 &&
    first >= 32 &&
    first % 32 === 0 &&
    first / 32 + 1 < words.length
  ) {
    const offset = first / 32;
    lengthWord = words[offset];
    dataStart = offset + 1;
  }

  const length = Number(decodeUint(`0x${lengthWord}`));
  if (!Number.isSafeInteger(length) || length > (words.length - dataStart) * 32) return '';
  const byteCount = Math.ceil(length / 32);
  const bytes = words.slice(dataStart, dataStart + byteCount).join('');
  // NUL bytes are rejected by Postgres jsonb (they would abort the enclosing
  // insert), so strip them defensively.
  return Buffer.from(bytes.slice(0, length * 2), 'hex')
    .toString('utf8')
    .replace(/\u0000/g, '');
}

/**
 * Decode the array of indexed/unindexed log topics+data for an ERC-20
 * Transfer / Deposit / Withdraw style event into typed values.
 * @param {Array<string>} topics log topics (each 0x-prefixed 32-byte word)
 * @param {string} data 0x-prefixed hex data
 */
export function decodeEventArgs(topics = [], data = '0x') {
  const joined = (data || '0x').replace(/^0x/, '');
  const words = [];
  for (let i = 0; i < joined.length; i += 64) {
    const slice = joined.slice(i, i + 64);
    if (slice) words.push(slice);
  }

  let nextIndexed = 1; // topics[0] is always the event signature
  const indexedTo = (count) => {
    const out = [];
    for (let i = 0; i < count; i += 1) {
      out.push(decodeAddress(topics[nextIndexed]));
      nextIndexed += 1;
    }
    return out;
  };

  return {
    // ERC-20 Transfer: indexed from,to + data value.
    transfer: { from: indexedTo(1)[0], to: indexedTo(1)[0], value: decodeUint(words[0]) },
    // ERC-4626 Deposit/Withdraw: indexed caller,owner + data assets,shares.
    vault: { caller: indexedTo(1)[0], owner: indexedTo(1)[0], assets: decodeUint(words[0]), shares: decodeUint(words[1]) },
    words: words.map((w) => `0x${w}`),
  };
}