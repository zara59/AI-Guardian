// ABI shapes for the GuardianRegistry discovery index.
//
// Kept intentionally small and explicit: the registry's contract (and event)
// argument order is part of the discovery contract, so hand-rolled decoding
// is auditable line-by-line. Decoding is validated against real fixtures in
// tests/onchain.test.js.

import { keccak256, keccakFunctionSelector } from './keccak.js';

export const STRATEGY_REGISTERED_SIGNATURE =
  'StrategyRegistered(address,address,address,string,string,string,uint256)';

/** topic0 for the StrategyRegistered event. */
export function strategyRegisteredTopic() {
  return keccak256(STRATEGY_REGISTERED_SIGNATURE);
}

/** Function selectors for the GuardianRegistry view surface. */
export const REGISTRY_SELECTORS = {
  registrationsCount: keccakFunctionSelector('registrationsCount()'),
  registrations: keccakFunctionSelector('registrations(uint256)'),
  byStrategy: keccakFunctionSelector('byStrategy(address)'),
};

function wordsFrom(hex) {
  const cleaned = (hex || '0x').replace(/^0x/, '');
  const words = [];
  for (let i = 0; i < cleaned.length; i += 64) {
    const slice = cleaned.slice(i, i + 64);
    if (slice) words.push(slice);
  }
  return words;
}

function addressFromWord(word) {
  const cleaned = (word || '0').replace(/^0x/, '').padStart(64, '0');
  return `0x${cleaned.slice(cleaned.length - 40).toLowerCase()}`;
}

function uintFromWord(word) {
  return BigInt(`0x${(word || '0').replace(/^0x/, '').padStart(64, '0')}`);
}

/** Read a dynamic string at byte-offset `offset` within `words`. */
function stringAt(words, offsetWords) {
  if (offsetWords >= words.length) return '';
  const length = Number(uintFromWord(words[offsetWords]));
  if (!Number.isSafeInteger(length) || length <= 0) return '';
  const byteWords = Math.ceil(length / 32);
  const tail = words.slice(offsetWords + 1, offsetWords + 1 + byteWords).join('');
  return Buffer.from(tail.slice(0, length * 2), 'hex').toString('utf8');
}

/**
 * Decode an emitted StrategyRegistered log.
 * topics[1..3] = strategy, vault, token (indexed); data carries the three
 * dynamic strings + registeredAt (offsets first, then the tails).
 */
export function decodeStrategyRegistered(topics, data) {
  if (!Array.isArray(topics) || topics.length < 4) return null;
  const words = wordsFrom(data);
  if (words.length < 4) return null;

  const nameOff = Number(uintFromWord(words[0]));
  const descriptionOff = Number(uintFromWord(words[1]));
  const metadataOff = Number(uintFromWord(words[2]));
  if (!Number.isSafeInteger(nameOff) || !Number.isSafeInteger(descriptionOff) || !Number.isSafeInteger(metadataOff)) {
    return null;
  }

  return {
    strategy: addressFromWord(topics[1]),
    vault: addressFromWord(topics[2]),
    token: addressFromWord(topics[3]),
    name: stringAt(words, nameOff / 32),
    description: stringAt(words, descriptionOff / 32),
    metadataUri: stringAt(words, metadataOff / 32),
    registeredAt: uintFromWord(words[3]).toString(),
  };
}

/**
 * Decode the eth_call result of `registrations(uint256)` / `byStrategy(address)`.
 * The return value is a struct whose head holds an offset word pointing at the
 * struct body (addresses, string offsets, registeredAt) followed by the string
 * tails (string offsets are relative to the struct body start).
 */
export function decodeRegistrationCallResult(hex) {
  const words = wordsFrom(hex);
  if (words.length < 8) return null;

  const structOff = Number(uintFromWord(words[0]));
  if (!Number.isSafeInteger(structOff) || structOff % 32 !== 0) return null;
  const s = structOff / 32;
  if (words.length < s + 7 + 1) return null;

  const nameOff = Number(uintFromWord(words[s + 3]));
  const descriptionOff = Number(uintFromWord(words[s + 4]));
  const metadataOff = Number(uintFromWord(words[s + 5]));
  if (!Number.isSafeInteger(nameOff) || !Number.isSafeInteger(descriptionOff) || !Number.isSafeInteger(metadataOff)) {
    return null;
  }

  return {
    strategy: addressFromWord(words[s]),
    vault: addressFromWord(words[s + 1]),
    token: addressFromWord(words[s + 2]),
    name: stringAt(words, s + nameOff / 32),
    description: stringAt(words, s + descriptionOff / 32),
    metadataUri: stringAt(words, s + metadataOff / 32),
    registeredAt: uintFromWord(words[s + 6]).toString(),
  };
}

export { addressFromWord, uintFromWord, wordsFrom };