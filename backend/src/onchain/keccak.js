// Minimal, dependency-free Keccak-256 implementation (the variant Ethereum
// uses — NOT NIST SHA-3). Exists so the on-chain discovery layer can compute
// event topic hashes and function selectors without pulling in an ABI/ethers
// library. Verified against canonical test vectors in tests/onchain.test.js.

const MASK = (1n << 64n) - 1n;

function rotl64(x, n) {
  if (n === 0) return x & MASK;
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;
}

// Round constants for Keccak-f[1600] (24 rounds).
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// Rotation offsets, RHO[x][y] for the 25 lanes.
const RHO = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

const IDX = (x, y) => x + 5 * y;

function permute(state) {
  const B = new Array(25).fill(0n);
  let C = new Array(5).fill(0n);
  for (let round = 0; round < 24; round += 1) {
    // Theta
    for (let x = 0; x < 5; x += 1) {
      C[x] =
        state[IDX(x, 0)] ^ state[IDX(x, 1)] ^ state[IDX(x, 2)] ^ state[IDX(x, 3)] ^ state[IDX(x, 4)];
    }
    for (let x = 0; x < 5; x += 1) {
      const d = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y += 1) {
        state[IDX(x, y)] ^= d;
      }
    }

    // Rho + Pi: B[y][(2x+3y)%5] = rotl(A[x][y], RHO[x][y])
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        B[IDX(y, (2 * x + 3 * y) % 5)] = rotl64(state[IDX(x, y)], RHO[x][y]);
      }
    }

    // Chi
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[IDX(x, y)] = B[IDX(x, y)] ^ (~B[IDX((x + 1) % 5, y)] & B[IDX((x + 2) % 5, y)]);
      }
    }

    // Iota
    state[0] ^= RC[round];
  }
}

const RATE = 136; // bytes (1088 bits) absorbed per permutation for 256-bit output

function absorb(state, block) {
  for (let j = 0; j < RATE; j += 1) {
    state[j >>> 3] ^= BigInt(block[j]) << BigInt(8 * (j & 7));
  }
}

/**
 * keccak256(input) -> 0x-prefixed 64-hex digest.
 * Accepts a string (utf8) or a Buffer/Uint8Array.
 */
export function keccak256(input) {
  const bytes = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  const state = new Array(25).fill(0n);

  const fullBlocks = Math.floor(bytes.length / RATE);
  for (let b = 0; b < fullBlocks; b += 1) {
    absorb(state, bytes.subarray(b * RATE, (b + 1) * RATE));
    permute(state);
  }

  // Padding (Keccak domain 0x01 .. 0x80)
  const pad = Buffer.alloc(RATE, 0);
  bytes.copy(pad, 0, fullBlocks * RATE);
  pad[bytes.length % RATE] = 0x01;
  pad[RATE - 1] |= 0x80;
  absorb(state, pad);
  permute(state);

  const out = Buffer.alloc(32);
  for (let j = 0; j < 32; j += 1) {
    out[j] = Number((state[j >>> 3] >> BigInt(8 * (j & 7))) & 0xffn);
  }
  return `0x${out.toString('hex')}`;
}

/** First 4 bytes of keccak256(signature) as a 0x selector. */
export function keccakFunctionSelector(signature) {
  return keccak256(signature).slice(0, 10);
}